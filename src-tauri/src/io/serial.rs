// ui/src-tauri/src/io/serial_reader.rs
//
// Serial port reader with optional framing support.
// Can emit raw bytes (serial-raw-bytes) and/or framed messages (frame-message).
// Provides cross-platform serial communication for CANdor.

use async_trait::async_trait;
use serde::Serialize;
use std::io::Read;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;
use tauri::AppHandle;

use super::{
    emit_frames, emit_to_session, now_us, serial_utils, IODevice, FrameMessage, IOCapabilities, IOState, StreamEndedPayload,
};

// Re-export Parity for external use (sessions.rs imports via serial_reader::Parity)
pub use super::serial_utils::Parity;
use crate::buffer_store::{self, BufferType, TimestampedByte};
use crate::serial_framer::{extract_frame_id, FrameIdConfig, FramingEncoding, SerialFramer};

// ============================================================================
// Types and Configuration
// ============================================================================

/// Serial port configuration with optional framing
#[derive(Clone, Debug)]
pub struct SerialConfig {
    pub port: String,
    pub baud_rate: u32,
    pub data_bits: u8,
    pub stop_bits: u8,
    pub parity: Parity,
    /// Optional framing configuration - when set, frames are extracted and emitted
    pub framing: Option<SerialFramingConfig>,
    /// Maximum number of bytes to read before stopping (None = no limit)
    pub limit: Option<i64>,
    /// Display name for the reader (used in buffer names)
    pub display_name: Option<String>,
}

/// Configuration for serial framing and frame ID extraction
#[derive(Clone, Debug)]
pub struct SerialFramingConfig {
    /// Framing encoding (SLIP, Modbus RTU, or delimiter-based)
    pub encoding: FramingEncoding,
    /// Configuration for extracting frame ID from frame bytes
    pub frame_id_config: Option<FrameIdConfig>,
    /// Configuration for extracting source address from frame bytes
    pub source_address_config: Option<FrameIdConfig>,
    /// Minimum frame length - frames shorter than this are discarded
    pub min_frame_length: Option<usize>,
    /// Also emit raw bytes (serial-raw-bytes) in addition to frames
    pub emit_raw_bytes: bool,
}

/// Payload for raw serial bytes event - emitted in batches for performance,
/// but each byte has its own timestamp for precise timing analysis
#[derive(Clone, Serialize)]
pub struct SerialRawBytesPayload {
    /// Bytes with individual timestamps (uses TimestampedByte from buffer_store)
    pub bytes: Vec<TimestampedByte>,
    /// Serial port name
    pub port: String,
}

/// Information about an available serial port
#[derive(Clone, Serialize)]
pub struct SerialPortInfo {
    pub port_name: String,
    pub port_type: String,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
}

// ============================================================================
// Serial Reader
// ============================================================================

/// Serial port reader implementing IODevice trait
pub struct SerialReader {
    app: AppHandle,
    session_id: String,
    config: SerialConfig,
    state: IOState,
    cancel_flag: Arc<AtomicBool>,
    pause_flag: Arc<AtomicBool>,
    task_handle: Option<tauri::async_runtime::JoinHandle<()>>,
}

impl SerialReader {
    pub fn new(app: AppHandle, session_id: String, config: SerialConfig) -> Self {
        Self {
            app,
            session_id,
            config,
            state: IOState::Stopped,
            cancel_flag: Arc::new(AtomicBool::new(false)),
            pause_flag: Arc::new(AtomicBool::new(false)),
            task_handle: None,
        }
    }
}

#[async_trait]
impl IODevice for SerialReader {
    fn capabilities(&self) -> IOCapabilities {
        IOCapabilities {
            can_pause: true,
            supports_time_range: false,
            is_realtime: true,
            supports_speed_control: false,
            supports_seek: false,
            can_transmit: false,
            can_transmit_serial: true, // Serial reader can transmit bytes
            supports_canfd: false,
            supports_extended_id: false,
            supports_rtr: false,
            available_buses: vec![],
        }
    }

    async fn start(&mut self) -> Result<(), String> {
        if self.state == IOState::Running {
            return Err("Reader is already running".to_string());
        }

        self.state = IOState::Starting;
        self.cancel_flag.store(false, Ordering::Relaxed);
        self.pause_flag.store(false, Ordering::Relaxed);

        let app = self.app.clone();
        let session_id = self.session_id.clone();
        let config = self.config.clone();
        let cancel_flag = self.cancel_flag.clone();
        let pause_flag = self.pause_flag.clone();

        let handle = spawn_serial_stream(app, session_id, config, cancel_flag, pause_flag);
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
        if self.state != IOState::Running {
            return Err("Reader is not running".to_string());
        }
        self.pause_flag.store(true, Ordering::Relaxed);
        self.state = IOState::Paused;
        Ok(())
    }

    async fn resume(&mut self) -> Result<(), String> {
        if self.state != IOState::Paused {
            return Err("Reader is not paused".to_string());
        }
        self.pause_flag.store(false, Ordering::Relaxed);
        self.state = IOState::Running;
        Ok(())
    }

    fn set_speed(&mut self, _speed: f64) -> Result<(), String> {
        Err("Serial is a live stream and does not support speed control.".to_string())
    }

    fn set_time_range(&mut self, _start: Option<String>, _end: Option<String>) -> Result<(), String> {
        Err("Serial is a live stream and does not support time range filtering.".to_string())
    }

    fn state(&self) -> IOState {
        self.state.clone()
    }

    fn session_id(&self) -> &str {
        &self.session_id
    }
}

/// Helper to emit stream-ended event
fn emit_stream_ended(app_handle: &AppHandle, session_id: &str, reason: &str) {
    // Finalize the buffer and get metadata
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
        "[Serial:{}] Stream ended (reason: {}, count: {})",
        session_id,
        reason,
        count
    );
}

/// Spawn the serial stream task
fn spawn_serial_stream(
    app_handle: AppHandle,
    session_id: String,
    config: SerialConfig,
    cancel_flag: Arc<AtomicBool>,
    pause_flag: Arc<AtomicBool>,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        // Run blocking serial I/O in a dedicated thread
        let result = tokio::task::spawn_blocking(move || {
            run_serial_stream_blocking(app_handle, session_id, config, cancel_flag, pause_flag)
        })
        .await;

        if let Err(e) = result {
            eprintln!("[Serial] Task panicked: {:?}", e);
        }
    })
}

/// Blocking serial stream implementation
/// When framing is None: emits raw bytes (serial-raw-bytes)
/// When framing is Some: applies framing and emits frame-message events
/// If emit_raw_bytes is true, also emits serial-raw-bytes in framed mode
fn run_serial_stream_blocking(
    app_handle: AppHandle,
    session_id: String,
    config: SerialConfig,
    cancel_flag: Arc<AtomicBool>,
    pause_flag: Arc<AtomicBool>,
) {
    // Convert config to serialport types
    let data_bits = serial_utils::to_serialport_data_bits(config.data_bits);
    let stop_bits = serial_utils::to_serialport_stop_bits(config.stop_bits);
    let parity = serial_utils::to_serialport_parity(&config.parity);

    // Create buffer(s) based on framing configuration:
    // - If framing enabled with emit_raw_bytes: create BOTH a Bytes buffer AND a Frames buffer
    // - If framing enabled without emit_raw_bytes: create only a Frames buffer
    // - If no framing: create only a Bytes buffer
    let buffer_name = config.display_name.clone().unwrap_or_else(|| format!("Serial {}", config.port));
    let emit_raw = config.framing.as_ref().map(|f| f.emit_raw_bytes).unwrap_or(true);

    // Create bytes buffer ID (Some if we're storing bytes, None otherwise)
    let bytes_buffer_id: Option<String> = if config.framing.is_none() || emit_raw {
        // Create bytes buffer - active if no framing, inactive if framing is enabled
        let id = if config.framing.is_none() {
            buffer_store::create_buffer(BufferType::Bytes, format!("Bytes: {}", buffer_name))
        } else {
            buffer_store::create_buffer_inactive(BufferType::Bytes, format!("Bytes: {}", buffer_name))
        };
        Some(id)
    } else {
        None
    };

    // Create frames buffer ID (Some if framing is enabled, None otherwise)
    let frames_buffer_id: Option<String> = if config.framing.is_some() {
        // Frames buffer is always active when framing is enabled
        let id = buffer_store::create_buffer(BufferType::Frames, format!("Frames: {}", buffer_name));
        Some(id)
    } else {
        None
    };

    eprintln!(
        "[Serial:{}] Created buffers - bytes: {:?}, frames: {:?}",
        session_id, bytes_buffer_id, frames_buffer_id
    );

    // Open serial port with minimal timeout for better byte-level timing resolution.
    let mut port = match serialport::new(&config.port, config.baud_rate)
        .data_bits(data_bits)
        .stop_bits(stop_bits)
        .parity(parity)
        .timeout(Duration::from_millis(1))
        .open()
    {
        Ok(p) => p,
        Err(e) => {
            emit_to_session(
                &app_handle,
                "can-bytes-error",
                &session_id,
                format!("Failed to open {}: {}", config.port, e),
            );
            emit_stream_ended(&app_handle, &session_id, "error");
            return;
        }
    };

    eprintln!(
        "[Serial:{}] Opened {} at {} baud ({}-{}-{}) [framing: {}]",
        session_id, config.port, config.baud_rate, config.data_bits,
        match config.parity { Parity::None => 'N', Parity::Odd => 'O', Parity::Even => 'E' },
        config.stop_bits,
        if config.framing.is_some() { "enabled" } else { "raw" }
    );

    // Set up framing if configured
    let mut framer: Option<SerialFramer> = config.framing.as_ref().map(|f| SerialFramer::new(f.encoding.clone()));
    let frame_id_config = config.framing.as_ref().and_then(|f| f.frame_id_config.clone());
    let source_address_config = config.framing.as_ref().and_then(|f| f.source_address_config.clone());
    let min_frame_length = config.framing.as_ref().and_then(|f| f.min_frame_length).unwrap_or(0);
    // Note: emit_raw is already defined above during buffer creation

    eprintln!(
        "[Serial:{}] Starting stream (limit: {:?})",
        session_id, config.limit
    );

    let mut buf = [0u8; 256];
    let mut pending_bytes: Vec<TimestampedByte> = Vec::with_capacity(256);
    let mut pending_frames: Vec<FrameMessage> = Vec::with_capacity(32);
    let mut last_emit_time = std::time::Instant::now();
    let emit_interval = Duration::from_millis(25); // Emit at ~40 Hz for smooth UI updates
    let stream_reason;
    let mut total_bytes_read: i64 = 0;
    let byte_limit = config.limit;

    loop {
        // Check cancellation
        if cancel_flag.load(Ordering::Relaxed) {
            stream_reason = "stopped";
            break;
        }

        // Check byte limit
        if let Some(limit) = byte_limit {
            if total_bytes_read >= limit {
                eprintln!("[Serial:{}] Reached limit of {} bytes, stopping", session_id, limit);
                stream_reason = "complete";
                break;
            }
        }

        // Handle pause - continue reading to keep port alive but don't emit
        if pause_flag.load(Ordering::Relaxed) {
            let _ = port.read(&mut buf);
            pending_bytes.clear();
            pending_frames.clear();
            std::thread::sleep(Duration::from_millis(10));
            continue;
        }

        // Read bytes
        match port.read(&mut buf) {
            Ok(n) if n > 0 => {
                let base_ts = now_us();
                let read_bytes = &buf[..n];
                total_bytes_read += n as i64;

                // If we need to emit raw bytes (either no framing, or emit_raw_bytes is true)
                if emit_raw || framer.is_none() {
                    for &byte in read_bytes {
                        pending_bytes.push(TimestampedByte {
                            byte,
                            timestamp_us: base_ts,
                        });
                    }
                }

                // If framing is enabled, feed bytes to framer
                if let Some(ref mut f) = framer {
                    let frames = f.feed(read_bytes);
                    for frame in frames {
                        // Skip frames that are too short
                        if frame.bytes.len() < min_frame_length {
                            continue;
                        }

                        // Extract frame ID
                        let frame_id = frame_id_config
                            .as_ref()
                            .and_then(|cfg| extract_frame_id(&frame.bytes, cfg))
                            .unwrap_or(0);

                        // Extract source address
                        let source_address = source_address_config
                            .as_ref()
                            .and_then(|cfg| extract_frame_id(&frame.bytes, cfg))
                            .map(|v| v as u16);

                        let msg = FrameMessage {
                            protocol: "serial".to_string(),
                            timestamp_us: base_ts,
                            frame_id,
                            bus: 0,
                            dlc: frame.bytes.len() as u8,
                            bytes: frame.bytes,
                            is_extended: false,
                            is_fd: false,
                            source_address,
                            incomplete: None,
                            direction: None,
                        };

                        pending_frames.push(msg);
                    }
                }
            }
            Ok(0) => {
                // EOF - port closed/disconnected
                stream_reason = "disconnected";
                break;
            }
            Ok(_) => {
                // No data from timeout
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                // Timeout is expected for serial reads
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

        // Emit batched data periodically
        if last_emit_time.elapsed() >= emit_interval {
            // Emit raw bytes if we have any
            if !pending_bytes.is_empty() {
                let bytes = std::mem::take(&mut pending_bytes);
                // Store raw bytes in specific buffer by ID
                if let Some(ref bid) = bytes_buffer_id {
                    buffer_store::append_raw_bytes_to_buffer(bid, bytes.clone());
                }
                let payload = SerialRawBytesPayload {
                    bytes,
                    port: config.port.clone(),
                };
                emit_to_session(&app_handle, "serial-raw-bytes", &session_id, payload);
            }

            // Emit frames if we have any with active listener filtering
            if !pending_frames.is_empty() {
                let frames = std::mem::take(&mut pending_frames);
                // Store frames in specific buffer by ID
                if let Some(ref fid) = frames_buffer_id {
                    buffer_store::append_frames_to_buffer(fid, frames.clone());
                }
                emit_frames(&app_handle, &session_id, frames);
            }

            last_emit_time = std::time::Instant::now();
        }
    }

    // Emit any remaining data before exit
    if !pending_bytes.is_empty() {
        // Store raw bytes in specific buffer by ID
        if let Some(ref bid) = bytes_buffer_id {
            buffer_store::append_raw_bytes_to_buffer(bid, pending_bytes.clone());
        }
        let payload = SerialRawBytesPayload {
            bytes: pending_bytes,
            port: config.port.clone(),
        };
        emit_to_session(&app_handle, "serial-raw-bytes", &session_id, payload);
    }

    // Flush framer and emit remaining frames
    if let Some(ref mut f) = framer {
        if let Some(frame) = f.flush() {
            if frame.bytes.len() >= min_frame_length {
                let frame_id = frame_id_config
                    .as_ref()
                    .and_then(|cfg| extract_frame_id(&frame.bytes, cfg))
                    .unwrap_or(0);

                let source_address = source_address_config
                    .as_ref()
                    .and_then(|cfg| extract_frame_id(&frame.bytes, cfg))
                    .map(|v| v as u16);

                let msg = FrameMessage {
                    protocol: "serial".to_string(),
                    timestamp_us: now_us(),
                    frame_id,
                    bus: 0,
                    dlc: frame.bytes.len() as u8,
                    bytes: frame.bytes,
                    is_extended: false,
                    is_fd: false,
                    source_address,
                    incomplete: None,
                    direction: None,
                };

                pending_frames.push(msg);
            }
        }
    }

    if !pending_frames.is_empty() {
        // Store frames in specific buffer by ID and emit with active listener filtering
        if let Some(ref fid) = frames_buffer_id {
            buffer_store::append_frames_to_buffer(fid, pending_frames.clone());
        }
        emit_frames(&app_handle, &session_id, pending_frames);
    }

    emit_stream_ended(&app_handle, &session_id, stream_reason);
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// List available serial ports
///
/// On macOS, filters out /dev/tty.* devices and only shows /dev/cu.* devices.
/// The cu (calling unit) devices are non-blocking and preferred for outgoing connections.
/// The tty (terminal) devices block on open waiting for carrier detect.
#[tauri::command]
pub fn list_serial_ports() -> Result<Vec<SerialPortInfo>, String> {
    let ports = serialport::available_ports().map_err(|e| format!("Failed to enumerate ports: {}", e))?;

    Ok(ports
        .into_iter()
        // On macOS, filter out /dev/tty.* devices - only show /dev/cu.* (calling unit)
        .filter(|_p| {
            #[cfg(target_os = "macos")]
            {
                !_p.port_name.starts_with("/dev/tty.")
            }
            #[cfg(not(target_os = "macos"))]
            {
                true
            }
        })
        .map(|p| {
            let (port_type, manufacturer, product, serial_number, vid, pid) = match p.port_type {
                serialport::SerialPortType::UsbPort(info) => (
                    "USB".to_string(),
                    info.manufacturer,
                    info.product,
                    info.serial_number,
                    Some(info.vid),
                    Some(info.pid),
                ),
                serialport::SerialPortType::BluetoothPort => {
                    ("Bluetooth".to_string(), None, None, None, None, None)
                }
                serialport::SerialPortType::PciPort => {
                    ("PCI".to_string(), None, None, None, None, None)
                }
                serialport::SerialPortType::Unknown => {
                    ("Unknown".to_string(), None, None, None, None, None)
                }
            };
            SerialPortInfo {
                port_name: p.port_name,
                port_type,
                manufacturer,
                product,
                serial_number,
                vid,
                pid,
            }
        })
        .collect())
}

