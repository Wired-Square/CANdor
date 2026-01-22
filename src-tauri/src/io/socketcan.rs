// ui/src-tauri/src/io/socketcan_reader.rs
//
// SocketCAN reader for Linux native CAN interfaces.
// Used with CANable Pro (Candlelight firmware) or native CAN hardware.
//
// Requires the interface to be configured first:
//   sudo ip link set can0 up type can bitrate 500000
//
// This module is only compiled on Linux.

#[cfg(target_os = "linux")]
mod linux_impl {
    use async_trait::async_trait;
    use serde::{Deserialize, Serialize};
    use socketcan::{CanSocket, EmbeddedFrame, Frame, Socket};
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    use std::time::Duration;
    use tauri::AppHandle;

    use crate::buffer_store::{self, BufferType};
    use crate::io::{
        emit_frames, emit_to_session, now_us, IODevice, FrameMessage, IOCapabilities, IOState,
        StreamEndedPayload,
    };

    // ============================================================================
    // Types and Configuration
    // ============================================================================

    /// SocketCAN reader configuration
    #[derive(Clone, Debug, Serialize, Deserialize)]
    pub struct SocketCanConfig {
        /// CAN interface name (e.g., "can0", "vcan0")
        pub interface: String,
        /// Maximum number of frames to read (None = unlimited)
        pub limit: Option<i64>,
        /// Display name for the reader
        pub display_name: Option<String>,
        /// Bus number override - assigns a specific bus number to all frames from this device.
        /// Used for multi-bus capture where multiple single-bus devices are combined.
        /// If None, defaults to bus 0.
        #[serde(default)]
        pub bus_override: Option<u8>,
    }

    // ============================================================================
    // Utility Functions
    // ============================================================================

    /// Convert a socketcan frame to our FrameMessage format
    fn convert_socketcan_frame(frame: &socketcan::CanFrame, bus_override: Option<u8>) -> FrameMessage {
        FrameMessage {
            protocol: "can".to_string(),
            timestamp_us: now_us(),
            frame_id: frame.raw_id() & 0x1FFF_FFFF,
            bus: bus_override.unwrap_or(0),
            dlc: frame.len() as u8,
            bytes: frame.data().to_vec(),
            is_extended: frame.is_extended(),
            is_fd: false, // TODO: CAN FD support
            source_address: None,
            incomplete: None,
            direction: None,
        }
    }

    // ============================================================================
    // Simple SocketCAN Reader (for multi_source.rs)
    // ============================================================================

    /// Simple SocketCAN reader/writer for use in multi-source mode.
    /// Wraps a CanSocket for both reading and writing frames.
    pub struct SocketCanReader {
        socket: CanSocket,
    }

    impl SocketCanReader {
        /// Create a new SocketCAN reader for the given interface
        pub fn new(interface: &str) -> Result<Self, String> {
            let socket = CanSocket::open(interface)
                .map_err(|e| format!("Failed to open {}: {}", interface, e))?;

            // Set read timeout for non-blocking reads
            socket
                .set_read_timeout(Duration::from_millis(100))
                .map_err(|e| format!("Failed to set read timeout: {}", e))?;

            Ok(Self { socket })
        }

        /// Read a frame with timeout, returns None on timeout
        pub fn read_frame_timeout(&self, _timeout: Duration) -> Result<Option<FrameMessage>, String> {
            // Note: timeout is already set in constructor, parameter kept for API compatibility
            match self.socket.read_frame() {
                Ok(frame) => Ok(Some(convert_socketcan_frame(&frame, None))),
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => Ok(None),
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => Ok(None),
                Err(e) => Err(format!("Read error: {}", e)),
            }
        }

        /// Write a raw CAN frame (16-byte struct can_frame format)
        pub fn write_frame(&self, data: &[u8]) -> Result<(), String> {
            use socketcan::{CanDataFrame, ExtendedId, StandardId, Id};

            if data.len() < 16 {
                return Err("Frame data too short".to_string());
            }

            // Parse struct can_frame layout: can_id (4), dlc (1), padding (3), data (8)
            let can_id = u32::from_ne_bytes([data[0], data[1], data[2], data[3]]);
            let dlc = data[4] as usize;
            let frame_data = &data[8..8 + dlc.min(8)];

            // Check flags in can_id
            let is_extended = (can_id & 0x8000_0000) != 0; // CAN_EFF_FLAG
            let raw_id = can_id & 0x1FFF_FFFF;

            // Build the frame
            let frame = if is_extended {
                let id = ExtendedId::new(raw_id)
                    .ok_or_else(|| format!("Invalid extended ID: 0x{:08X}", raw_id))?;
                CanDataFrame::new(Id::Extended(id), frame_data)
                    .ok_or_else(|| "Failed to create extended frame".to_string())?
            } else {
                let id = StandardId::new(raw_id as u16)
                    .ok_or_else(|| format!("Invalid standard ID: 0x{:03X}", raw_id))?;
                CanDataFrame::new(Id::Standard(id), frame_data)
                    .ok_or_else(|| "Failed to create standard frame".to_string())?
            };

            self.socket
                .write_frame(&frame)
                .map_err(|e| format!("Write error: {}", e))?;

            Ok(())
        }
    }

    // ============================================================================
    // SocketCAN IODevice (for single-source sessions)
    // ============================================================================

    /// SocketCAN reader implementing IODevice trait
    pub struct SocketIODevice {
        app: AppHandle,
        session_id: String,
        config: SocketCanConfig,
        state: IOState,
        cancel_flag: Arc<AtomicBool>,
        task_handle: Option<tauri::async_runtime::JoinHandle<()>>,
    }

    impl SocketIODevice {
        pub fn new(app: AppHandle, session_id: String, config: SocketCanConfig) -> Self {
            Self {
                app,
                session_id,
                config,
                state: IOState::Stopped,
                cancel_flag: Arc::new(AtomicBool::new(false)),
                task_handle: None,
            }
        }
    }

    #[async_trait]
    impl IODevice for SocketIODevice {
        fn capabilities(&self) -> IOCapabilities {
            IOCapabilities {
                can_pause: false,
                supports_time_range: false,
                is_realtime: true,
                supports_speed_control: false,
                supports_seek: false,
                can_transmit: true, // SocketCAN supports transmission
                can_transmit_serial: false,
                supports_canfd: false, // TODO: CAN FD support
                supports_extended_id: true, // SocketCAN supports extended IDs
                supports_rtr: true, // SocketCAN supports RTR frames
                available_buses: vec![0], // Single interface per reader
            }
        }

        async fn start(&mut self) -> Result<(), String> {
            if self.state == IOState::Running {
                return Err("Reader is already running".to_string());
            }

            self.state = IOState::Starting;
            self.cancel_flag.store(false, Ordering::Relaxed);

            let app = self.app.clone();
            let session_id = self.session_id.clone();
            let config = self.config.clone();
            let cancel_flag = self.cancel_flag.clone();

            let handle = spawn_socketcan_stream(app, session_id, config, cancel_flag);
            self.task_handle = Some(handle);
            self.state = IOState::Running;

            Ok(())
        }

        async fn stop(&mut self) -> Result<(), String> {
            self.cancel_flag.store(true, Ordering::Relaxed);

            if let Some(handle) = self.task_handle.take() {
                let _ = handle.await;
            }

            self.state = IOState::Stopped;
            Ok(())
        }

        async fn pause(&mut self) -> Result<(), String> {
            Err("SocketCAN is a live stream and cannot be paused.".to_string())
        }

        async fn resume(&mut self) -> Result<(), String> {
            Err("SocketCAN is a live stream and does not support pause/resume.".to_string())
        }

        fn set_speed(&mut self, _speed: f64) -> Result<(), String> {
            Err("SocketCAN is a live stream and does not support speed control.".to_string())
        }

        fn set_time_range(
            &mut self,
            _start: Option<String>,
            _end: Option<String>,
        ) -> Result<(), String> {
            Err("SocketCAN is a live stream and does not support time range filtering.".to_string())
        }

        fn state(&self) -> IOState {
            self.state.clone()
        }

        fn session_id(&self) -> &str {
            &self.session_id
        }
    }

    // ============================================================================
    // Stream Implementation
    // ============================================================================

    /// Helper to emit stream-ended event
    fn emit_stream_ended(app_handle: &AppHandle, session_id: &str, reason: &str) {
        let metadata = buffer_store::finalize_buffer();

        let (buffer_id, buffer_type, count, time_range, buffer_available) = match metadata {
            Some(ref m) => {
                let type_str = match m.buffer_type {
                    BufferType::Frames => "frames",
                    BufferType::Bytes => "bytes",
                };
                (
                    Some(m.id.clone()),
                    Some(type_str.to_string()),
                    m.count,
                    match (m.start_time_us, m.end_time_us) {
                        (Some(start), Some(end)) => Some((start, end)),
                        _ => None,
                    },
                    m.count > 0,
                )
            }
            None => (None, None, 0, None, false),
        };

        emit_to_session(
            app_handle,
            "stream-ended",
            session_id,
            StreamEndedPayload {
                reason: reason.to_string(),
                buffer_available,
                buffer_id,
                buffer_type,
                count,
                time_range,
            },
        );
        eprintln!(
            "[SocketCAN:{}] Stream ended (reason: {}, count: {})",
            session_id, reason, count
        );
    }

    /// Spawn the SocketCAN stream task
    fn spawn_socketcan_stream(
        app_handle: AppHandle,
        session_id: String,
        config: SocketCanConfig,
        cancel_flag: Arc<AtomicBool>,
    ) -> tauri::async_runtime::JoinHandle<()> {
        tauri::async_runtime::spawn(async move {
            let result = tokio::task::spawn_blocking(move || {
                run_socketcan_stream_blocking(app_handle, session_id, config, cancel_flag)
            })
            .await;

            if let Err(e) = result {
                eprintln!("[SocketCAN] Task panicked: {:?}", e);
            }
        })
    }

    /// Blocking SocketCAN stream implementation
    #[allow(unused_assignments)]
    fn run_socketcan_stream_blocking(
        app_handle: AppHandle,
        session_id: String,
        config: SocketCanConfig,
        cancel_flag: Arc<AtomicBool>,
    ) {
        let buffer_name = config
            .display_name
            .clone()
            .unwrap_or_else(|| format!("SocketCAN {}", config.interface));
        let _buffer_id = buffer_store::create_buffer(BufferType::Frames, buffer_name);

        let mut stream_reason = "stopped";
        let mut total_frames: i64 = 0;

        // Open SocketCAN interface
        let socket = match CanSocket::open(&config.interface) {
            Ok(s) => s,
            Err(e) => {
                emit_to_session(
                    &app_handle,
                    "can-bytes-error",
                    &session_id,
                    format!(
                        "Failed to open {}: {}. Is the interface configured? Try: sudo ip link set {} up type can bitrate 500000",
                        config.interface, e, config.interface
                    ),
                );
                emit_stream_ended(&app_handle, &session_id, "error");
                return;
            }
        };

        // Set read timeout for cancellation check
        if let Err(e) = socket.set_read_timeout(Duration::from_millis(100)) {
            eprintln!(
                "[SocketCAN:{}] Warning: could not set read timeout: {}",
                session_id, e
            );
        }

        eprintln!(
            "[SocketCAN:{}] Starting stream (interface: {}, limit: {:?})",
            session_id, config.interface, config.limit
        );

        let mut pending_frames: Vec<FrameMessage> = Vec::with_capacity(32);
        let mut last_emit_time = std::time::Instant::now();
        let emit_interval = Duration::from_millis(25);

        loop {
            if cancel_flag.load(Ordering::Relaxed) {
                stream_reason = "stopped";
                break;
            }

            if let Some(limit) = config.limit {
                if total_frames >= limit {
                    eprintln!("[SocketCAN:{}] Reached limit of {} frames, stopping", session_id, limit);
                    stream_reason = "complete";
                    break;
                }
            }

            match socket.read_frame() {
                Ok(frame) => {
                    let msg = convert_socketcan_frame(&frame, config.bus_override);
                    pending_frames.push(msg);
                    total_frames += 1;
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    // Timeout - check cancel flag
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    // Timeout - check cancel flag
                }
                Err(e) => {
                    emit_to_session(
                        &app_handle,
                        "can-bytes-error",
                        &session_id,
                        format!("Read error: {}", e),
                    );
                    stream_reason = "error";
                    break;
                }
            }

            // Emit batched frames periodically with active listener filtering
            if last_emit_time.elapsed() >= emit_interval && !pending_frames.is_empty() {
                let frames = std::mem::take(&mut pending_frames);
                buffer_store::append_frames(frames.clone());
                emit_frames(&app_handle, &session_id, frames);
                last_emit_time = std::time::Instant::now();
            }
        }

        // Emit any remaining frames with active listener filtering
        if !pending_frames.is_empty() {
            buffer_store::append_frames(pending_frames.clone());
            emit_frames(&app_handle, &session_id, pending_frames);
        }

        emit_stream_ended(&app_handle, &session_id, stream_reason);
    }
}

// Re-export for Linux
#[cfg(target_os = "linux")]
pub use linux_impl::{SocketCanConfig, SocketCanReader, SocketIODevice};

// ============================================================================
// Non-Linux Stub
// ============================================================================

#[cfg(not(target_os = "linux"))]
mod stub {
    use async_trait::async_trait;
    use serde::{Deserialize, Serialize};
    use tauri::AppHandle;

    use crate::io::{IODevice, IOCapabilities, IOState};

    /// SocketCAN configuration (stub for non-Linux)
    #[derive(Clone, Debug, Serialize, Deserialize)]
    pub struct SocketCanConfig {
        pub interface: String,
        pub limit: Option<i64>,
        pub display_name: Option<String>,
        #[serde(default)]
        pub bus_override: Option<u8>,
    }

    /// SocketCAN reader stub for non-Linux platforms
    pub struct SocketIODevice {
        _session_id: String,
    }

    impl SocketIODevice {
        pub fn new(_app: AppHandle, session_id: String, _config: SocketCanConfig) -> Self {
            Self { _session_id: session_id }
        }
    }

    #[async_trait]
    impl IODevice for SocketIODevice {
        fn capabilities(&self) -> IOCapabilities {
            IOCapabilities {
                can_pause: false,
                supports_time_range: false,
                is_realtime: true,
                supports_speed_control: false,
                supports_seek: false,
                can_transmit: false, // Not available on this platform
                can_transmit_serial: false,
                supports_canfd: false,
                supports_extended_id: false,
                supports_rtr: false,
                available_buses: vec![],
            }
        }

        async fn start(&mut self) -> Result<(), String> {
            Err("SocketCAN is only available on Linux. Use slcan for macOS/Windows.".to_string())
        }

        async fn stop(&mut self) -> Result<(), String> {
            Ok(())
        }

        async fn pause(&mut self) -> Result<(), String> {
            Err("SocketCAN is only available on Linux.".to_string())
        }

        async fn resume(&mut self) -> Result<(), String> {
            Err("SocketCAN is only available on Linux.".to_string())
        }

        fn set_speed(&mut self, _speed: f64) -> Result<(), String> {
            Err("SocketCAN is only available on Linux.".to_string())
        }

        fn set_time_range(
            &mut self,
            _start: Option<String>,
            _end: Option<String>,
        ) -> Result<(), String> {
            Err("SocketCAN is only available on Linux.".to_string())
        }

        fn state(&self) -> IOState {
            IOState::Stopped
        }

        fn session_id(&self) -> &str {
            &self._session_id
        }
    }
}

#[cfg(not(target_os = "linux"))]
pub use stub::{SocketCanConfig, SocketIODevice};
