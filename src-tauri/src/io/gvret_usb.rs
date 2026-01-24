// ui/src-tauri/src/io/gvret_usb.rs
//
// GVRET USB serial protocol device for devices like ESP32-RET, M2RET, CANDue
// and other GVRET-compatible hardware over USB serial.
//
// Protocol reference: https://github.com/collin80/GVRET
//
// This is the USB/serial version of the GVRET protocol, which uses binary mode
// for efficient frame transfer. The protocol is the same as GVRET TCP but over
// a serial port connection.
//
// NOTE: The standalone GvretUsbReader is now legacy code. All real-time devices now use
// MultiSourceReader which has its own gvret_usb source implementation. The GvretUsbReader
// struct and related functions are kept for reference but not actively used.

#![allow(dead_code)]

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::Duration;
use tauri::AppHandle;

use super::gvret_common::{
    encode_gvret_frame, gvret_capabilities, parse_gvret_frames, validate_gvret_frame,
    emit_stream_ended, BINARY_MODE_ENABLE, DEVICE_INFO_PROBE, GVRET_CMD_NUMBUSES,
    GvretDeviceInfo, GVRET_SYNC,
};
use super::{
    emit_frames, emit_to_session, now_ms, CanBytesPayload, CanTransmitFrame, FrameMessage, IOCapabilities,
    IODevice, IOState, TransmitResult,
};
use crate::buffer_store::{self, BufferType};

// ============================================================================
// Configuration
// ============================================================================

/// GVRET USB reader configuration
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GvretUsbConfig {
    /// Serial port path (e.g., "/dev/cu.usbmodem1101", "COM3")
    pub port: String,
    /// Serial baud rate (typically 115200 or 1000000)
    pub baud_rate: u32,
    /// Maximum number of frames to read (None = unlimited)
    pub limit: Option<i64>,
    /// Display name for the reader (used in buffer names)
    pub display_name: Option<String>,
    /// Bus number override - if set, all frames will use this bus number
    /// instead of the device-reported bus number
    #[serde(default)]
    pub bus_override: Option<u8>,
}

// ============================================================================
// GVRET USB Reader
// ============================================================================

/// Shared serial port type for GVRET reader/writer access
pub type SharedSerialPort = Arc<Mutex<Option<Box<dyn serialport::SerialPort>>>>;

/// GVRET USB protocol reader implementing IODevice trait
pub struct GvretUsbReader {
    app: AppHandle,
    session_id: String,
    config: GvretUsbConfig,
    state: IOState,
    cancel_flag: Arc<AtomicBool>,
    task_handle: Option<tauri::async_runtime::JoinHandle<()>>,
    /// Shared serial port - allows transmit while reading
    port: SharedSerialPort,
}

impl GvretUsbReader {
    pub fn new(app: AppHandle, session_id: String, config: GvretUsbConfig) -> Self {
        Self {
            app,
            session_id,
            config,
            state: IOState::Stopped,
            cancel_flag: Arc::new(AtomicBool::new(false)),
            task_handle: None,
            port: Arc::new(Mutex::new(None)),
        }
    }

    /// Transmit a CAN frame through this reader's serial port
    ///
    /// This acquires the port lock briefly to write the frame, allowing
    /// the read task to continue receiving frames between transmissions.
    pub fn transmit_frame(&self, frame: &CanTransmitFrame) -> Result<TransmitResult, String> {
        // Validate frame using shared validation
        if let Err(result) = validate_gvret_frame(frame) {
            return Ok(result);
        }

        // Acquire lock on the shared port
        let mut port_guard = self
            .port
            .lock()
            .map_err(|e| format!("Failed to lock port: {}", e))?;
        let port = port_guard.as_mut().ok_or("Port not open")?;

        // Encode and send using shared encoder
        let cmd = encode_gvret_frame(frame);
        port.write_all(&cmd)
            .map_err(|e| format!("Failed to write frame: {}", e))?;
        port.flush()
            .map_err(|e| format!("Failed to flush port: {}", e))?;

        let transmit_result = TransmitResult::success();

        eprintln!(
            "[GVRET_USB:{}] Transmit succeeded, emitting TX frame for ID 0x{:X}",
            self.session_id, frame.frame_id
        );

        // Emit the transmitted frame back to the session so it shows in Discovery
        let tx_frame = FrameMessage {
            protocol: "can".to_string(),
            timestamp_us: transmit_result.timestamp_us,
            frame_id: frame.frame_id,
            bus: frame.bus,
            dlc: frame.data.len() as u8,
            bytes: frame.data.clone(),
            is_extended: frame.is_extended,
            is_fd: frame.is_fd,
            source_address: None,
            incomplete: None,
            direction: Some("tx".to_string()),
        };

        // Buffer the TX frame for replay
        buffer_store::append_frames(vec![tx_frame.clone()]);

        // Emit as a single-frame batch with active listener filtering
        emit_frames(&self.app, &self.session_id, vec![tx_frame]);

        Ok(transmit_result)
    }
}

#[async_trait]
impl IODevice for GvretUsbReader {
    fn capabilities(&self) -> IOCapabilities {
        gvret_capabilities()
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
        let port = self.port.clone();

        let handle = spawn_gvret_usb_stream(app, session_id, config, cancel_flag, port);
        self.task_handle = Some(handle);
        self.state = IOState::Running;

        Ok(())
    }

    async fn stop(&mut self) -> Result<(), String> {
        self.cancel_flag.store(true, Ordering::Relaxed);

        if let Some(handle) = self.task_handle.take() {
            let _ = handle.await;
        }

        // Close the serial port
        if let Ok(mut port_guard) = self.port.lock() {
            *port_guard = None;
        }

        self.state = IOState::Stopped;
        Ok(())
    }

    async fn pause(&mut self) -> Result<(), String> {
        Err("GVRET USB is a live stream and cannot be paused. Data would be lost.".to_string())
    }

    async fn resume(&mut self) -> Result<(), String> {
        Err("GVRET USB is a live stream and does not support pause/resume.".to_string())
    }

    fn set_speed(&mut self, _speed: f64) -> Result<(), String> {
        Err("GVRET USB is a live stream and does not support speed control.".to_string())
    }

    fn set_time_range(
        &mut self,
        _start: Option<String>,
        _end: Option<String>,
    ) -> Result<(), String> {
        Err("GVRET USB is a live stream and does not support time range filtering.".to_string())
    }

    fn state(&self) -> IOState {
        self.state.clone()
    }

    fn session_id(&self) -> &str {
        &self.session_id
    }

    fn transmit_frame(&self, frame: &CanTransmitFrame) -> Result<TransmitResult, String> {
        // Delegate to the impl method
        GvretUsbReader::transmit_frame(self, frame)
    }
}

// ============================================================================
// Stream Implementation
// ============================================================================

/// Spawn the GVRET USB stream task
fn spawn_gvret_usb_stream(
    app_handle: AppHandle,
    session_id: String,
    config: GvretUsbConfig,
    cancel_flag: Arc<AtomicBool>,
    shared_port: SharedSerialPort,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        // Run blocking serial I/O in a dedicated thread
        let result = tokio::task::spawn_blocking(move || {
            run_gvret_usb_stream_blocking(app_handle, session_id, config, cancel_flag, shared_port)
        })
        .await;

        if let Err(e) = result {
            eprintln!("[gvret_usb] Task panicked: {:?}", e);
        }
    })
}

/// Blocking GVRET USB stream implementation
fn run_gvret_usb_stream_blocking(
    app_handle: AppHandle,
    session_id: String,
    config: GvretUsbConfig,
    cancel_flag: Arc<AtomicBool>,
    shared_port: SharedSerialPort,
) {
    let buffer_name = config
        .display_name
        .clone()
        .unwrap_or_else(|| format!("GVRET USB {}", config.port));
    let _buffer_id = buffer_store::create_buffer(BufferType::Frames, buffer_name);
    let source = config.port.clone();

    let stream_reason;
    let mut total_frames: i64 = 0;

    // Open serial port and store in shared location
    let port = match serialport::new(&config.port, config.baud_rate)
        .timeout(Duration::from_millis(100))
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
            emit_stream_ended(&app_handle, &session_id, "error", "gvret_usb");
            return;
        }
    };

    eprintln!(
        "[gvret_usb:{}] Opened {} at {} baud",
        session_id, config.port, config.baud_rate
    );

    // Store port in shared location
    {
        if let Ok(mut port_guard) = shared_port.lock() {
            *port_guard = Some(port);
        } else {
            emit_to_session(
                &app_handle,
                "can-bytes-error",
                &session_id,
                "Failed to store port in shared location".to_string(),
            );
            emit_stream_ended(&app_handle, &session_id, "error", "gvret_usb");
            return;
        }
    }

    // Wait for USB serial device to be ready
    std::thread::sleep(Duration::from_millis(500));

    // Setup GVRET binary mode (acquire lock briefly)
    {
        let setup_result = shared_port
            .lock()
            .map_err(|e| format!("Lock error: {}", e))
            .and_then(|mut guard| {
                if let Some(ref mut port) = *guard {
                    setup_gvret(port)
                } else {
                    Err("Port not available".to_string())
                }
            });

        if let Err(e) = setup_result {
            emit_to_session(
                &app_handle,
                "can-bytes-error",
                &session_id,
                format!("GVRET setup failed: {}", e),
            );
            emit_stream_ended(&app_handle, &session_id, "error", "gvret_usb");
            return;
        }
    }

    eprintln!(
        "[gvret_usb:{}] Starting stream (limit: {:?})",
        session_id, config.limit
    );

    // Read and parse frames
    let mut read_buf = [0u8; 4096];
    let mut parse_buf: Vec<u8> = Vec::with_capacity(4096);
    let mut pending_frames: Vec<(FrameMessage, String)> = Vec::with_capacity(32);
    let mut last_emit_time = std::time::Instant::now();
    let emit_interval = Duration::from_millis(25);

    loop {
        if cancel_flag.load(Ordering::Relaxed) {
            stream_reason = "stopped";
            break;
        }

        // Check frame limit
        if let Some(limit) = config.limit {
            if total_frames >= limit {
                eprintln!(
                    "[gvret_usb:{}] Reached limit of {} frames, stopping",
                    session_id, limit
                );
                stream_reason = "complete";
                break;
            }
        }

        // Read from serial port (acquire lock briefly, then release)
        let read_result = {
            let mut port_guard = match shared_port.lock() {
                Ok(g) => g,
                Err(_) => {
                    stream_reason = "error";
                    break;
                }
            };

            if let Some(ref mut port) = *port_guard {
                port.read(&mut read_buf)
            } else {
                // Port was closed externally
                stream_reason = "disconnected";
                break;
            }
        };

        match read_result {
            Ok(n) if n > 0 => {
                // Process received bytes (outside of lock)
                parse_buf.extend_from_slice(&read_buf[..n]);
                let frames = parse_gvret_frames(&mut parse_buf);

                // Calculate how many frames to process based on limit
                let frames_to_process = if let Some(max) = config.limit {
                    let remaining = max - total_frames;
                    if remaining <= 0 {
                        0
                    } else {
                        (remaining as usize).min(frames.len())
                    }
                } else {
                    frames.len()
                };

                if frames_to_process > 0 {
                    let frames_subset: Vec<_> =
                        frames.into_iter().take(frames_to_process).collect();
                    total_frames += frames_subset.len() as i64;
                    pending_frames.extend(frames_subset);
                } else if config.limit.is_some() && !frames.is_empty() {
                    // Hit limit
                    stream_reason = "complete";
                    break;
                }
            }
            Ok(0) => {
                // EOF - port closed
                stream_reason = "disconnected";
                break;
            }
            Ok(_) => {}
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                // Timeout is expected for live streams
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

        // Emit batched frames periodically
        if last_emit_time.elapsed() >= emit_interval && !pending_frames.is_empty() {
            let frames = std::mem::take(&mut pending_frames);

            // Emit per-frame raw payloads for debugging
            for (_, raw_hex) in &frames {
                let payload = CanBytesPayload {
                    hex: raw_hex.clone(),
                    len: raw_hex.len() / 2,
                    timestamp_ms: now_ms(),
                    source: source.clone(),
                };
                emit_to_session(&app_handle, "can-bytes", &session_id, payload);
            }

            // Emit parsed frames with active listener filtering
            // Apply bus_override if configured
            let frame_only: Vec<FrameMessage> = frames.into_iter().map(|(mut f, _)| {
                if let Some(bus) = config.bus_override {
                    f.bus = bus;
                }
                f
            }).collect();
            buffer_store::append_frames(frame_only.clone());
            emit_frames(&app_handle, &session_id, frame_only);

            last_emit_time = std::time::Instant::now();
        }
    }

    // Emit any remaining frames
    if !pending_frames.is_empty() {
        for (_, raw_hex) in &pending_frames {
            let payload = CanBytesPayload {
                hex: raw_hex.clone(),
                len: raw_hex.len() / 2,
                timestamp_ms: now_ms(),
                source: source.clone(),
            };
            emit_to_session(&app_handle, "can-bytes", &session_id, payload);
        }

        // Apply bus_override if configured
        let frame_only: Vec<FrameMessage> =
            pending_frames.into_iter().map(|(mut f, _)| {
                if let Some(bus) = config.bus_override {
                    f.bus = bus;
                }
                f
            }).collect();
        buffer_store::append_frames(frame_only.clone());
        emit_frames(&app_handle, &session_id, frame_only);
    }

    emit_stream_ended(&app_handle, &session_id, stream_reason, "gvret_usb");
}

/// Setup GVRET binary mode
fn setup_gvret(port: &mut Box<dyn serialport::SerialPort>) -> Result<(), String> {
    // Clear any pending data
    let _ = port.clear(serialport::ClearBuffer::All);

    // Enable binary mode (send 0xE7 twice)
    port.write_all(&BINARY_MODE_ENABLE)
        .map_err(|e| format!("Failed to enable binary mode: {}", e))?;
    let _ = port.flush();
    std::thread::sleep(Duration::from_millis(50));

    // Probe device info (optional, helps ensure device is responsive)
    port.write_all(&DEVICE_INFO_PROBE)
        .map_err(|e| format!("Failed to probe device: {}", e))?;
    let _ = port.flush();
    std::thread::sleep(Duration::from_millis(50));

    Ok(())
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::super::gvret_common::{encode_gvret_frame, parse_gvret_frames};
    use super::*;

    #[test]
    fn test_encode_standard_frame() {
        let frame = CanTransmitFrame {
            frame_id: 0x123,
            data: vec![0x11, 0x22, 0x33, 0x44],
            bus: 0,
            is_extended: false,
            is_fd: false,
            is_brs: false,
            is_rtr: false,
        };

        let encoded = encode_gvret_frame(&frame);

        assert_eq!(encoded[0], 0xF1); // Sync
        assert_eq!(encoded[1], 0x00); // Command
        // Frame ID (little-endian): 0x123 = [0x23, 0x01, 0x00, 0x00]
        assert_eq!(encoded[2], 0x23);
        assert_eq!(encoded[3], 0x01);
        assert_eq!(encoded[4], 0x00);
        assert_eq!(encoded[5], 0x00);
        assert_eq!(encoded[6], 0x00); // Bus
        assert_eq!(encoded[7], 0x04); // Length
        assert_eq!(&encoded[8..], &[0x11, 0x22, 0x33, 0x44]);
    }

    #[test]
    fn test_encode_extended_frame() {
        let frame = CanTransmitFrame {
            frame_id: 0x12345678,
            data: vec![0xAA, 0xBB],
            bus: 1,
            is_extended: true,
            is_fd: false,
            is_brs: false,
            is_rtr: false,
        };

        let encoded = encode_gvret_frame(&frame);

        assert_eq!(encoded[0], 0xF1); // Sync
        assert_eq!(encoded[1], 0x00); // Command
        // Frame ID with extended flag (bit 31): 0x12345678 | 0x80000000 = 0x92345678
        // Little-endian: [0x78, 0x56, 0x34, 0x92]
        assert_eq!(encoded[2], 0x78);
        assert_eq!(encoded[3], 0x56);
        assert_eq!(encoded[4], 0x34);
        assert_eq!(encoded[5], 0x92);
        assert_eq!(encoded[6], 0x01); // Bus
        assert_eq!(encoded[7], 0x02); // Length
        assert_eq!(&encoded[8..], &[0xAA, 0xBB]);
    }

    #[test]
    fn test_encode_empty_frame() {
        let frame = CanTransmitFrame {
            frame_id: 0x7FF,
            data: vec![],
            bus: 0,
            is_extended: false,
            is_fd: false,
            is_brs: false,
            is_rtr: false,
        };

        let encoded = encode_gvret_frame(&frame);

        assert_eq!(encoded.len(), 8); // Header only, no data
        assert_eq!(encoded[0], 0xF1);
        assert_eq!(encoded[1], 0x00);
        assert_eq!(encoded[6], 0x00); // Bus
        assert_eq!(encoded[7], 0x00); // Length = 0
    }

    #[test]
    fn test_parse_single_frame() {
        // F1 00 <ts:4> <id:4> <bus_dlc:1> <data:4>
        // Timestamp: 0x00000000 (not used for host time)
        // ID: 0x123 (standard)
        // Bus+DLC: 0x04 (bus 0, dlc 4)
        // Data: AA BB CC DD
        let mut buffer = vec![
            0xF1, 0x00, // Sync + command
            0x00, 0x00, 0x00, 0x00, // Timestamp
            0x23, 0x01, 0x00, 0x00, // ID 0x123 LE
            0x04, // Bus 0, DLC 4
            0xAA, 0xBB, 0xCC, 0xDD, // Data
        ];

        let frames = parse_gvret_frames(&mut buffer);

        assert_eq!(frames.len(), 1);
        let (frame, _) = &frames[0];
        assert_eq!(frame.frame_id, 0x123);
        assert_eq!(frame.dlc, 4);
        assert_eq!(frame.bytes, vec![0xAA, 0xBB, 0xCC, 0xDD]);
        assert!(!frame.is_extended);
        assert!(buffer.is_empty()); // Buffer should be consumed
    }

    #[test]
    fn test_parse_extended_frame() {
        // Extended frame with ID 0x12345678
        let mut buffer = vec![
            0xF1, 0x00, // Sync + command
            0x00, 0x00, 0x00, 0x00, // Timestamp
            0x78, 0x56, 0x34, 0x92, // ID 0x12345678 | 0x80000000 LE
            0x02, // Bus 0, DLC 2
            0x11, 0x22, // Data
        ];

        let frames = parse_gvret_frames(&mut buffer);

        assert_eq!(frames.len(), 1);
        let (frame, _) = &frames[0];
        assert_eq!(frame.frame_id, 0x12345678);
        assert!(frame.is_extended);
        assert_eq!(frame.bytes, vec![0x11, 0x22]);
    }

    #[test]
    fn test_parse_skips_control_frames() {
        // Mix of control frames and data frame
        let mut buffer = vec![
            0xF1, 0x09, 0xDE, 0xAD, // Keepalive (4 bytes)
            0xF1, 0x00, // Data frame start
            0x00, 0x00, 0x00, 0x00, // Timestamp
            0x7F, 0x00, 0x00, 0x00, // ID 0x7F
            0x01, // Bus 0, DLC 1
            0xFF, // Data
        ];

        let frames = parse_gvret_frames(&mut buffer);

        assert_eq!(frames.len(), 1);
        let (frame, _) = &frames[0];
        assert_eq!(frame.frame_id, 0x7F);
    }

    #[test]
    fn test_parse_incomplete_frame() {
        // Incomplete frame - not enough bytes
        let mut buffer = vec![
            0xF1, 0x00, // Sync + command
            0x00, 0x00, // Only 2 timestamp bytes
        ];

        let frames = parse_gvret_frames(&mut buffer);

        assert!(frames.is_empty());
        assert_eq!(buffer.len(), 4); // Buffer should be preserved
    }
}

// ============================================================================
// Device Probing
// ============================================================================

/// Probe a GVRET USB device to discover its capabilities
///
/// This function opens the serial port, queries the number of available buses,
/// and returns device information. The connection is closed after probing.
pub fn probe_gvret_usb(port: &str, baud_rate: u32) -> Result<GvretDeviceInfo, String> {
    eprintln!(
        "[probe_gvret_usb] Probing GVRET device at {} (baud: {})",
        port, baud_rate
    );

    // Open serial port
    let mut serial_port = serialport::new(port, baud_rate)
        .timeout(Duration::from_millis(500))
        .open()
        .map_err(|e| format!("Failed to open {}: {}", port, e))?;

    eprintln!("[probe_gvret_usb] Opened serial port {}", port);

    // Clear any pending data
    let _ = serial_port.clear(serialport::ClearBuffer::All);

    // Enter binary mode
    serial_port
        .write_all(&BINARY_MODE_ENABLE)
        .map_err(|e| format!("Failed to enable binary mode: {}", e))?;
    let _ = serial_port.flush();

    // Wait for device to process
    std::thread::sleep(Duration::from_millis(100));

    // Query number of buses
    serial_port
        .write_all(&GVRET_CMD_NUMBUSES)
        .map_err(|e| format!("Failed to send NUMBUSES command: {}", e))?;
    let _ = serial_port.flush();

    // Read response with timeout
    // Response format: [0xF1][0x0C][bus_count]
    let mut buf = vec![0u8; 256];
    let mut total_read = 0;
    let deadline = std::time::Instant::now() + Duration::from_secs(2);

    loop {
        if std::time::Instant::now() >= deadline {
            break;
        }

        match serial_port.read(&mut buf[total_read..]) {
            Ok(0) => break, // No data
            Ok(n) => {
                total_read += n;

                // Look for NUMBUSES response: [0xF1][0x0C][bus_count]
                for i in 0..total_read.saturating_sub(2) {
                    if buf[i] == GVRET_SYNC && buf[i + 1] == 0x0C && i + 2 < total_read {
                        let bus_count = buf[i + 2];
                        // Sanity check: GVRET devices have 1-5 buses
                        let bus_count = if bus_count == 0 || bus_count > 5 {
                            // Default to 5 if response is invalid
                            eprintln!(
                                "[probe_gvret_usb] Invalid bus count {}, defaulting to 5",
                                bus_count
                            );
                            5
                        } else {
                            bus_count
                        };

                        eprintln!(
                            "[probe_gvret_usb] SUCCESS: Device at {} has {} buses available",
                            port, bus_count
                        );
                        return Ok(GvretDeviceInfo { bus_count });
                    }
                }

                // If we've read enough data without finding the response, give up
                if total_read > 128 {
                    break;
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                // Timeout on this read, continue if we still have time
            }
            Err(e) => {
                return Err(format!("Failed to read response: {}", e));
            }
        }
    }

    // If we didn't get a response, assume 5 buses (standard GVRET)
    eprintln!(
        "[probe_gvret_usb] No NUMBUSES response received, defaulting to 5 buses"
    );
    Ok(GvretDeviceInfo { bus_count: 5 })
}
