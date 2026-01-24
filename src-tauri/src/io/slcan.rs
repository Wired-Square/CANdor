// ui/src-tauri/src/io/slcan.rs
//
// slcan (Serial Line CAN) protocol device for CANable, CANable Pro, and other
// USB-CAN adapters using the Lawicel/slcan ASCII protocol.
//
// Protocol reference: http://www.can232.com/docs/can232_v3.pdf
//
// Frame formats:
//   Standard: t<ID:3hex><DLC:1hex><DATA:2hex*DLC>\r
//   Extended: T<ID:8hex><DLC:1hex><DATA:2hex*DLC>\r
//   RTR:      r<ID:3hex><DLC:1hex>\r / R<ID:8hex><DLC:1hex>\r
//
// NOTE: The standalone SlcanReader is now legacy code. All real-time devices now use
// MultiSourceReader which has its own slcan source implementation. The SlcanReader
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

use super::{
    emit_frames, emit_to_session, now_us, serial_utils, CanTransmitFrame, FrameMessage, IOCapabilities, IODevice, IOState,
    StreamEndedPayload, TransmitResult,
};
use crate::buffer_store::{self, BufferType};

// ============================================================================
// Constants
// ============================================================================

/// slcan bitrate commands (S0-S8)
const SLCAN_BITRATES: [(u32, &str); 9] = [
    (10_000, "S0"),     // 10 Kbit/s
    (20_000, "S1"),     // 20 Kbit/s
    (50_000, "S2"),     // 50 Kbit/s
    (100_000, "S3"),    // 100 Kbit/s
    (125_000, "S4"),    // 125 Kbit/s
    (250_000, "S5"),    // 250 Kbit/s
    (500_000, "S6"),    // 500 Kbit/s
    (750_000, "S7"),    // 750 Kbit/s
    (1_000_000, "S8"),  // 1 Mbit/s
];

// ============================================================================
// Types and Configuration
// ============================================================================

/// slcan reader configuration
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SlcanConfig {
    /// Serial port path (e.g., "/dev/cu.usbmodem1101", "COM3")
    pub port: String,
    /// Serial baud rate (typically 115200 for CANable)
    pub baud_rate: u32,
    /// CAN bus bitrate in bits/second (e.g., 500000 for 500 Kbit/s)
    pub bitrate: u32,
    /// Silent mode (M1) - does not ACK frames or participate in bus arbitration
    pub silent_mode: bool,
    /// Maximum number of frames to read (None = unlimited)
    pub limit: Option<i64>,
    /// Display name for the reader (used in buffer names)
    pub display_name: Option<String>,
    /// Data bits (5, 6, 7, 8) - defaults to 8
    #[serde(default = "default_data_bits")]
    pub data_bits: u8,
    /// Stop bits (1, 2) - defaults to 1
    #[serde(default = "default_stop_bits")]
    pub stop_bits: u8,
    /// Parity ("none", "odd", "even") - defaults to "none"
    #[serde(default = "default_parity")]
    pub parity: String,
    /// Bus number override - assigns a specific bus number to all frames from this device.
    /// Used for multi-bus capture where multiple single-bus devices are combined.
    /// If None, defaults to bus 0.
    #[serde(default)]
    pub bus_override: Option<u8>,
}

fn default_data_bits() -> u8 { 8 }
fn default_stop_bits() -> u8 { 1 }
fn default_parity() -> String { "none".to_string() }

// ============================================================================
// Utility Functions
// ============================================================================

/// Find the slcan bitrate command for a given bitrate
pub fn find_bitrate_command(bitrate: u32) -> Result<&'static str, String> {
    SLCAN_BITRATES
        .iter()
        .find(|(rate, _)| *rate == bitrate)
        .map(|(_, cmd)| *cmd)
        .ok_or_else(|| {
            let valid: Vec<String> = SLCAN_BITRATES.iter().map(|(r, _)| format!("{}", r)).collect();
            format!(
                "Invalid CAN bitrate {}. Valid bitrates: {}",
                bitrate,
                valid.join(", ")
            )
        })
}

/// Parse a single slcan frame line
///
/// Format examples:
///   t1234AABBCCDD  -> Standard frame, ID=0x123, DLC=4, data=AA BB CC DD
///   T123456788AABBCCDD112233445566 -> Extended frame, ID=0x12345678, DLC=8
///   r1230          -> Standard RTR, ID=0x123, DLC=0
///   R123456780     -> Extended RTR, ID=0x12345678, DLC=0
pub fn parse_slcan_frame(line: &str) -> Option<FrameMessage> {
    let bytes = line.as_bytes();
    if bytes.is_empty() {
        return None;
    }

    // Determine frame type from first character
    let (is_extended, is_rtr) = match bytes[0] {
        b't' => (false, false), // Standard data frame
        b'T' => (true, false),  // Extended data frame
        b'r' => (false, true),  // Standard RTR
        b'R' => (true, true),   // Extended RTR
        _ => return None,       // Not a frame (could be response like 'z', '\r', etc.)
    };

    let id_len = if is_extended { 8 } else { 3 };
    let min_len = 1 + id_len + 1; // prefix + ID + DLC

    if bytes.len() < min_len {
        return None;
    }

    // Parse frame ID (hex ASCII)
    let id_str = std::str::from_utf8(&bytes[1..1 + id_len]).ok()?;
    let frame_id = u32::from_str_radix(id_str, 16).ok()?;

    // Parse DLC (single hex digit)
    let dlc_char = bytes[1 + id_len] as char;
    let dlc = dlc_char.to_digit(16)? as u8;

    // Validate DLC (max 8 for classic CAN)
    if dlc > 8 {
        return None;
    }

    // Parse data bytes (pairs of hex characters)
    let mut data = Vec::with_capacity(dlc as usize);
    if !is_rtr && dlc > 0 {
        let data_start = 1 + id_len + 1;
        let expected_len = data_start + (dlc as usize * 2);

        if bytes.len() < expected_len {
            return None;
        }

        for i in 0..dlc as usize {
            let byte_str = std::str::from_utf8(&bytes[data_start + i * 2..data_start + i * 2 + 2]).ok()?;
            let byte = u8::from_str_radix(byte_str, 16).ok()?;
            data.push(byte);
        }
    }

    Some(FrameMessage {
        protocol: "can".to_string(),
        timestamp_us: now_us(),
        frame_id,
        bus: 0,
        dlc,
        bytes: data,
        is_extended,
        is_fd: false,
        source_address: None,
        incomplete: None,
        direction: None, // Received frames don't have direction set
    })
}

/// Encode a CAN frame to slcan format for transmission
///
/// Returns the ASCII command string including trailing \r
pub fn encode_slcan_frame(frame: &FrameMessage) -> String {
    let mut cmd = String::with_capacity(32);

    // Frame type prefix
    if frame.is_extended {
        cmd.push('T');
        cmd.push_str(&format!("{:08X}", frame.frame_id));
    } else {
        cmd.push('t');
        cmd.push_str(&format!("{:03X}", frame.frame_id & 0x7FF));
    }

    // DLC
    cmd.push_str(&format!("{:X}", frame.dlc.min(8)));

    // Data bytes
    for byte in &frame.bytes {
        cmd.push_str(&format!("{:02X}", byte));
    }

    cmd.push('\r');
    cmd
}

// ============================================================================
// slcan Reader
// ============================================================================

/// Shared serial port type for slcan reader/writer access
pub type SharedSerialPort = Arc<Mutex<Option<Box<dyn serialport::SerialPort>>>>;

/// slcan protocol reader implementing CanReader trait
pub struct SlcanReader {
    app: AppHandle,
    session_id: String,
    config: SlcanConfig,
    state: IOState,
    cancel_flag: Arc<AtomicBool>,
    task_handle: Option<tauri::async_runtime::JoinHandle<()>>,
    /// Shared serial port - allows transmit while reading
    port: SharedSerialPort,
}

impl SlcanReader {
    pub fn new(app: AppHandle, session_id: String, config: SlcanConfig) -> Self {
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

    /// Check if this reader can transmit (requires non-silent mode)
    #[allow(dead_code)]
    pub fn can_transmit(&self) -> bool {
        !self.config.silent_mode
    }

    /// Transmit a CAN frame through this reader's serial port
    ///
    /// This acquires the port lock briefly to write the frame, allowing
    /// the read task to continue receiving frames between transmissions.
    pub fn transmit_frame(&self, frame: &CanTransmitFrame) -> Result<TransmitResult, String> {
        if self.config.silent_mode {
            return Err("Cannot transmit in silent mode (M1). Change to normal mode (M0) in IO profile settings.".to_string());
        }

        // Acquire lock on the shared port
        let mut port_guard = self.port.lock().map_err(|e| format!("Failed to lock port: {}", e))?;
        let port = port_guard.as_mut().ok_or("Port not open")?;

        let transmit_result = TransmitResult::success();

        // Convert CanTransmitFrame to FrameMessage for encoding
        let frame_msg = FrameMessage {
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

        // Encode and send
        let cmd = encode_slcan_frame(&frame_msg);
        port.write_all(cmd.as_bytes())
            .map_err(|e| format!("Failed to write frame: {}", e))?;
        port.flush()
            .map_err(|e| format!("Failed to flush port: {}", e))?;

        eprintln!(
            "[slcan:{}] Transmit succeeded, emitting TX frame for ID 0x{:X}",
            self.session_id, frame.frame_id
        );

        // Buffer the TX frame for replay
        buffer_store::append_frames(vec![frame_msg.clone()]);

        // Emit as a single-frame batch with active listener filtering
        emit_frames(&self.app, &self.session_id, vec![frame_msg]);

        Ok(transmit_result)
    }
}

#[async_trait]
impl IODevice for SlcanReader {
    fn capabilities(&self) -> IOCapabilities {
        IOCapabilities {
            can_pause: false,        // Live stream, would lose data
            supports_time_range: false,
            is_realtime: true,
            supports_speed_control: false,
            supports_seek: false,
            can_transmit: !self.config.silent_mode,  // Can transmit in normal mode (M0)
            can_transmit_serial: false,
            supports_canfd: false, // slcan is classic CAN only
            supports_extended_id: true, // slcan supports extended IDs (T/R prefix)
            supports_rtr: true, // slcan supports RTR frames (r/R prefix)
            available_buses: vec![0], // Single bus
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
        let port = self.port.clone();

        let handle = spawn_slcan_stream(app, session_id, config, cancel_flag, port);
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
        Err("slcan is a live stream and cannot be paused. Data would be lost.".to_string())
    }

    async fn resume(&mut self) -> Result<(), String> {
        Err("slcan is a live stream and does not support pause/resume.".to_string())
    }

    fn set_speed(&mut self, _speed: f64) -> Result<(), String> {
        Err("slcan is a live stream and does not support speed control.".to_string())
    }

    fn set_time_range(&mut self, _start: Option<String>, _end: Option<String>) -> Result<(), String> {
        Err("slcan is a live stream and does not support time range filtering.".to_string())
    }

    fn state(&self) -> IOState {
        self.state.clone()
    }

    fn session_id(&self) -> &str {
        &self.session_id
    }

    fn transmit_frame(&self, frame: &CanTransmitFrame) -> Result<TransmitResult, String> {
        // Delegate to the impl method
        SlcanReader::transmit_frame(self, frame)
    }
}

// ============================================================================
// Stream Implementation
// ============================================================================

/// Helper to emit stream-ended event with buffer info
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
        "[slcan:{}] Stream ended (reason: {}, count: {})",
        session_id, reason, count
    );
}

/// Spawn the slcan stream task
fn spawn_slcan_stream(
    app_handle: AppHandle,
    session_id: String,
    config: SlcanConfig,
    cancel_flag: Arc<AtomicBool>,
    shared_port: SharedSerialPort,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        // Run blocking serial I/O in a dedicated thread
        let result = tokio::task::spawn_blocking(move || {
            run_slcan_stream_blocking(app_handle, session_id, config, cancel_flag, shared_port)
        })
        .await;

        if let Err(e) = result {
            eprintln!("[slcan] Task panicked: {:?}", e);
        }
    })
}

/// Blocking slcan stream implementation
fn run_slcan_stream_blocking(
    app_handle: AppHandle,
    session_id: String,
    config: SlcanConfig,
    cancel_flag: Arc<AtomicBool>,
    shared_port: SharedSerialPort,
) {
    let buffer_name = config.display_name.clone().unwrap_or_else(|| format!("slcan {}", config.port));
    let _buffer_id = buffer_store::create_buffer(BufferType::Frames, buffer_name);

    let stream_reason;
    let mut total_frames: i64 = 0;

    // Convert serial framing parameters
    let data_bits = serial_utils::to_serialport_data_bits(config.data_bits);
    let stop_bits = serial_utils::to_serialport_stop_bits(config.stop_bits);
    let parity = serial_utils::parity_str_to_serialport(&config.parity);

    // Open serial port and store in shared location
    let port = match serialport::new(&config.port, config.baud_rate)
        .data_bits(data_bits)
        .stop_bits(stop_bits)
        .parity(parity)
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
            emit_stream_ended(&app_handle, &session_id, "error");
            return;
        }
    };

    eprintln!(
        "[slcan:{}] Opened {} at {} baud ({}{}{}) (CAN bitrate: {} bit/s, silent: {})",
        session_id, config.port, config.baud_rate,
        config.data_bits, config.parity.chars().next().unwrap_or('N').to_uppercase(), config.stop_bits,
        config.bitrate, config.silent_mode
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
            emit_stream_ended(&app_handle, &session_id, "error");
            return;
        }
    }

    // Wait for USB serial device to be ready
    // CANable and similar devices need a brief delay after port open
    std::thread::sleep(Duration::from_millis(500));

    // Setup slcan interface (acquire lock briefly)
    {
        let setup_result = shared_port.lock().map_err(|e| format!("Lock error: {}", e)).and_then(|mut guard| {
            if let Some(ref mut port) = *guard {
                setup_slcan(port, &config)
            } else {
                Err("Port not available".to_string())
            }
        });

        if let Err(e) = setup_result {
            emit_to_session(
                &app_handle,
                "can-bytes-error",
                &session_id,
                format!("slcan setup failed: {}", e),
            );
            emit_stream_ended(&app_handle, &session_id, "error");
            return;
        }
    }

    eprintln!(
        "[slcan:{}] Starting stream (limit: {:?})",
        session_id, config.limit
    );

    // Read and parse frames
    let mut line_buf = String::with_capacity(64);
    let mut read_buf = [0u8; 256];
    let mut pending_frames: Vec<FrameMessage> = Vec::with_capacity(32);
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
                eprintln!("[slcan:{}] Reached limit of {} frames, stopping", session_id, limit);
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
                for &byte in &read_buf[..n] {
                    if byte == b'\r' || byte == b'\n' {
                        // End of line - try to parse frame
                        if !line_buf.is_empty() {
                            if let Some(mut frame) = parse_slcan_frame(&line_buf) {
                                // Apply bus override if configured
                                if let Some(bus) = config.bus_override {
                                    frame.bus = bus;
                                }
                                pending_frames.push(frame);
                                total_frames += 1;
                            }
                            line_buf.clear();
                        }
                    } else if byte == 0x07 {
                        // Bell character - slcan error response
                        eprintln!("[slcan:{}] Received error (bell)", session_id);
                        line_buf.clear();
                    } else if byte.is_ascii() && !byte.is_ascii_control() {
                        line_buf.push(byte as char);

                        // Prevent line buffer overflow
                        if line_buf.len() > 64 {
                            line_buf.clear();
                        }
                    }
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

    // Close slcan channel (acquire lock briefly)
    if let Ok(mut port_guard) = shared_port.lock() {
        if let Some(ref mut port) = *port_guard {
            let _ = port.write_all(b"C\r");
            let _ = port.flush();
        }
    }

    emit_stream_ended(&app_handle, &session_id, stream_reason);
}

/// Setup the slcan interface (close, set bitrate, set mode, open)
fn setup_slcan(port: &mut Box<dyn serialport::SerialPort>, config: &SlcanConfig) -> Result<(), String> {
    // Clear any pending data
    let _ = port.clear(serialport::ClearBuffer::All);

    // Close any existing channel (ignore errors - might not be open)
    let _ = port.write_all(b"C\r");
    let _ = port.flush();
    std::thread::sleep(Duration::from_millis(50));

    // Set bitrate
    let bitrate_cmd = find_bitrate_command(config.bitrate)?;
    port.write_all(format!("{}\r", bitrate_cmd).as_bytes())
        .map_err(|e| format!("Failed to set bitrate: {}", e))?;
    let _ = port.flush();
    std::thread::sleep(Duration::from_millis(50));

    // Set mode: M0 = normal, M1 = silent (no ACK, no transmit)
    // Silent mode is recommended for passive monitoring/reverse engineering
    let mode_cmd = if config.silent_mode { "M1" } else { "M0" };
    port.write_all(format!("{}\r", mode_cmd).as_bytes())
        .map_err(|e| format!("Failed to set mode: {}", e))?;
    let _ = port.flush();
    std::thread::sleep(Duration::from_millis(50));

    // Open channel
    port.write_all(b"O\r")
        .map_err(|e| format!("Failed to open channel: {}", e))?;
    let _ = port.flush();

    Ok(())
}

// ============================================================================
// Device Probing
// ============================================================================

/// Result of probing an slcan device
#[derive(Clone, Debug, Serialize)]
pub struct SlcanProbeResult {
    /// Whether the probe was successful (device responded)
    pub success: bool,
    /// Firmware version string (if available)
    pub version: Option<String>,
    /// Hardware version string (if available)
    pub hardware_version: Option<String>,
    /// Serial number (if available)
    pub serial_number: Option<String>,
    /// Error message (if probe failed)
    pub error: Option<String>,
}

/// Probe an slcan device to check if it's responding and get version info.
///
/// This opens the port briefly, sends version query commands, and closes it.
/// The slcan protocol defines:
/// - V: Firmware version
/// - v: Hardware version
/// - N: Serial number
///
/// CANable devices typically respond to V with something like "V1013\r"
///
/// Optional serial framing parameters (defaults: 8N1):
/// - data_bits: 5, 6, 7, or 8 (default: 8)
/// - stop_bits: 1 or 2 (default: 1)
/// - parity: "none", "odd", "even" (default: "none")
#[tauri::command]
pub fn probe_slcan_device(
    port: String,
    baud_rate: u32,
    data_bits: Option<u8>,
    stop_bits: Option<u8>,
    parity: Option<String>,
) -> SlcanProbeResult {
    // Convert serial framing parameters with defaults
    let data_bits = serial_utils::to_serialport_data_bits(data_bits.unwrap_or(8));
    let stop_bits = serial_utils::to_serialport_stop_bits(stop_bits.unwrap_or(1));
    let parity = serial_utils::parity_str_to_serialport(&parity.unwrap_or_else(|| "none".to_string()));

    // Open the port with a short timeout
    let mut serial_port = match serialport::new(&port, baud_rate)
        .data_bits(data_bits)
        .stop_bits(stop_bits)
        .parity(parity)
        .timeout(Duration::from_millis(500))
        .open()
    {
        Ok(p) => p,
        Err(e) => {
            return SlcanProbeResult {
                success: false,
                version: None,
                hardware_version: None,
                serial_number: None,
                error: Some(format!("Failed to open port: {}", e)),
            };
        }
    };

    // Wait for USB device to be ready
    std::thread::sleep(Duration::from_millis(200));

    // Clear any pending data
    let _ = serial_port.clear(serialport::ClearBuffer::All);

    // Close any existing channel first (in case device is in open state)
    let _ = serial_port.write_all(b"C\r");
    let _ = serial_port.flush();
    std::thread::sleep(Duration::from_millis(50));

    // Clear again after close
    let _ = serial_port.clear(serialport::ClearBuffer::All);

    let mut version: Option<String> = None;
    let mut hardware_version: Option<String> = None;
    let mut serial_number: Option<String> = None;
    let mut got_any_response = false;

    // Query firmware version (V command)
    if let Some(response) = send_and_read(&mut serial_port, b"V\r") {
        got_any_response = true;
        // Response format varies, but typically starts with 'V' followed by version digits
        // e.g., "V1013" or "V1234\r"
        let trimmed = response.trim();
        if !trimmed.is_empty() && trimmed != "\x07" {
            // Remove leading 'V' if present
            version = Some(if trimmed.starts_with('V') || trimmed.starts_with('v') {
                format_version(&trimmed[1..])
            } else {
                format_version(trimmed)
            });
        }
    }

    // Query hardware version (v command) - some devices support this
    if let Some(response) = send_and_read(&mut serial_port, b"v\r") {
        got_any_response = true;
        let trimmed = response.trim();
        if !trimmed.is_empty() && trimmed != "\x07" {
            hardware_version = Some(if trimmed.starts_with('v') {
                trimmed[1..].to_string()
            } else {
                trimmed.to_string()
            });
        }
    }

    // Query serial number (N command) - some devices support this
    if let Some(response) = send_and_read(&mut serial_port, b"N\r") {
        got_any_response = true;
        let trimmed = response.trim();
        if !trimmed.is_empty() && trimmed != "\x07" {
            serial_number = Some(if trimmed.starts_with('N') {
                trimmed[1..].to_string()
            } else {
                trimmed.to_string()
            });
        }
    }

    // Close the port
    drop(serial_port);

    if got_any_response {
        SlcanProbeResult {
            success: true,
            version,
            hardware_version,
            serial_number,
            error: None,
        }
    } else {
        SlcanProbeResult {
            success: false,
            version: None,
            hardware_version: None,
            serial_number: None,
            error: Some("No response from device".to_string()),
        }
    }
}

/// Format a version string (e.g., "1013" -> "1.0.13" or keep as-is if format unclear)
fn format_version(s: &str) -> String {
    let s = s.trim();
    // Common CANable format: 4 digits like "1013" -> "1.0.13"
    if s.len() == 4 && s.chars().all(|c| c.is_ascii_digit()) {
        let chars: Vec<char> = s.chars().collect();
        format!("{}.{}.{}{}", chars[0], chars[1], chars[2], chars[3])
    } else {
        s.to_string()
    }
}

/// Send a command and read the response
fn send_and_read(port: &mut Box<dyn serialport::SerialPort>, cmd: &[u8]) -> Option<String> {
    // Send command
    if port.write_all(cmd).is_err() {
        return None;
    }
    let _ = port.flush();

    // Wait for response
    std::thread::sleep(Duration::from_millis(100));

    // Read response
    let mut buf = [0u8; 64];
    let mut response = String::new();

    // Try to read with a few attempts
    for _ in 0..3 {
        match port.read(&mut buf) {
            Ok(n) if n > 0 => {
                // Filter out non-printable characters except CR/LF
                for &b in &buf[..n] {
                    if b == 0x07 {
                        // Bell character indicates error
                        return Some("\x07".to_string());
                    }
                    if b.is_ascii() && (b >= 0x20 || b == b'\r' || b == b'\n') {
                        response.push(b as char);
                    }
                }
                if response.contains('\r') || response.contains('\n') {
                    break;
                }
            }
            Ok(_) => break,
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => break,
            Err(_) => break,
        }
    }

    if response.is_empty() {
        None
    } else {
        Some(response)
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_standard_frame() {
        let frame = parse_slcan_frame("t1234AABBCCDD").unwrap();
        assert_eq!(frame.frame_id, 0x123);
        assert_eq!(frame.dlc, 4);
        assert_eq!(frame.bytes, vec![0xAA, 0xBB, 0xCC, 0xDD]);
        assert!(!frame.is_extended);
        assert!(!frame.is_fd);
    }

    #[test]
    fn test_parse_extended_frame() {
        let frame = parse_slcan_frame("T123456782AABB").unwrap();
        assert_eq!(frame.frame_id, 0x12345678);
        assert_eq!(frame.dlc, 2);
        assert_eq!(frame.bytes, vec![0xAA, 0xBB]);
        assert!(frame.is_extended);
    }

    #[test]
    fn test_parse_standard_frame_zero_dlc() {
        let frame = parse_slcan_frame("t1230").unwrap();
        assert_eq!(frame.frame_id, 0x123);
        assert_eq!(frame.dlc, 0);
        assert!(frame.bytes.is_empty());
    }

    #[test]
    fn test_parse_standard_frame_max_dlc() {
        let frame = parse_slcan_frame("t1238AABBCCDD11223344").unwrap();
        assert_eq!(frame.frame_id, 0x123);
        assert_eq!(frame.dlc, 8);
        assert_eq!(frame.bytes.len(), 8);
    }

    #[test]
    fn test_parse_rtr_frame() {
        let frame = parse_slcan_frame("r1234").unwrap();
        assert_eq!(frame.frame_id, 0x123);
        assert_eq!(frame.dlc, 4);
        assert!(frame.bytes.is_empty()); // RTR has no data
    }

    #[test]
    fn test_parse_extended_rtr() {
        let frame = parse_slcan_frame("R123456780").unwrap();
        assert_eq!(frame.frame_id, 0x12345678);
        assert_eq!(frame.dlc, 0);
        assert!(frame.is_extended);
    }

    #[test]
    fn test_parse_invalid_prefix() {
        assert!(parse_slcan_frame("x1234AABB").is_none());
        assert!(parse_slcan_frame("z").is_none());
        assert!(parse_slcan_frame("").is_none());
    }

    #[test]
    fn test_parse_invalid_dlc() {
        // DLC > 8 is invalid for classic CAN
        assert!(parse_slcan_frame("t123FAABBCCDD").is_none());
    }

    #[test]
    fn test_parse_truncated_frame() {
        // Not enough data bytes for DLC
        assert!(parse_slcan_frame("t1234AA").is_none());
    }

    #[test]
    fn test_encode_standard_frame() {
        let frame = FrameMessage {
            protocol: "can".to_string(),
            timestamp_us: 0,
            frame_id: 0x123,
            bus: 0,
            dlc: 3,
            bytes: vec![0x01, 0x02, 0x03],
            is_extended: false,
            is_fd: false,
            source_address: None,
            incomplete: None,
            direction: None,
        };
        assert_eq!(encode_slcan_frame(&frame), "t1233010203\r");
    }

    #[test]
    fn test_encode_extended_frame() {
        let frame = FrameMessage {
            protocol: "can".to_string(),
            timestamp_us: 0,
            frame_id: 0x12345678,
            bus: 0,
            dlc: 2,
            bytes: vec![0xAA, 0xBB],
            is_extended: true,
            is_fd: false,
            source_address: None,
            incomplete: None,
            direction: None,
        };
        assert_eq!(encode_slcan_frame(&frame), "T123456782AABB\r");
    }

    #[test]
    fn test_encode_decode_roundtrip() {
        let original = FrameMessage {
            protocol: "can".to_string(),
            timestamp_us: 0,
            frame_id: 0x7FF,
            bus: 0,
            dlc: 4,
            bytes: vec![0xDE, 0xAD, 0xBE, 0xEF],
            is_extended: false,
            is_fd: false,
            source_address: None,
            incomplete: None,
            direction: None,
        };

        let encoded = encode_slcan_frame(&original);
        // Remove trailing \r for parsing
        let decoded = parse_slcan_frame(&encoded[..encoded.len() - 1]).unwrap();

        assert_eq!(decoded.frame_id, original.frame_id);
        assert_eq!(decoded.dlc, original.dlc);
        assert_eq!(decoded.bytes, original.bytes);
        assert_eq!(decoded.is_extended, original.is_extended);
    }

    #[test]
    fn test_bitrate_mapping() {
        assert_eq!(find_bitrate_command(500_000).unwrap(), "S6");
        assert_eq!(find_bitrate_command(125_000).unwrap(), "S4");
        assert_eq!(find_bitrate_command(1_000_000).unwrap(), "S8");
        assert_eq!(find_bitrate_command(10_000).unwrap(), "S0");
        assert!(find_bitrate_command(123_456).is_err());
    }
}
