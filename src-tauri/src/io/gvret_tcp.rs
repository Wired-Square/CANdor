// ui/src-tauri/src/io/gvret_tcp.rs
//
// GVRET TCP Reader - streams live CAN data over TCP using the GVRET binary protocol.
// Supports both reading and transmitting CAN frames through the same TCP connection.
//
// NOTE: The standalone GvretReader is now legacy code. All real-time devices now use
// MultiSourceReader which has its own gvret_tcp source implementation. The GvretReader
// struct and related functions are kept for reference but not actively used.
//
// Transmit Architecture:
// Since the IODevice trait has a synchronous transmit_frame method but TCP I/O is async,
// we use a standard sync channel (std::sync::mpsc) to send frames to the async stream task.
// The stream task checks for transmit requests during each read timeout iteration and
// processes them using async I/O.

#![allow(dead_code)]

use async_trait::async_trait;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc as std_mpsc,
    Arc, Mutex,
};
use tauri::AppHandle;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt, WriteHalf},
    net::TcpStream,
    sync::Mutex as TokioMutex,
    time::Duration,
};

use super::gvret_common::{
    encode_gvret_frame, emit_stream_ended, gvret_capabilities, parse_gvret_frames,
    validate_gvret_frame, BINARY_MODE_ENABLE, DEVICE_INFO_PROBE, GVRET_CMD_NUMBUSES,
    GvretDeviceInfo, GVRET_SYNC,
};
use super::{
    emit_frames, emit_to_session, now_ms, CanBytesPayload, CanTransmitFrame, FrameMessage, IOCapabilities,
    IODevice, IOState, TransmitResult,
};
use crate::buffer_store::{self, BufferType};

/// Shared TCP write half for GVRET reader/transmitter access
pub type SharedTcpWriter = Arc<TokioMutex<Option<WriteHalf<TcpStream>>>>;

/// Transmit request sent through the channel
struct TransmitRequest {
    /// Encoded frame bytes ready to send
    data: Vec<u8>,
    /// Sync oneshot channel to send the result back
    result_tx: std_mpsc::SyncSender<Result<(), String>>,
}

/// Sender for transmit requests - uses std sync channel for simplicity
/// The dedicated transmit task polls this channel independently of the read loop
type TransmitSender = Arc<Mutex<Option<std_mpsc::SyncSender<TransmitRequest>>>>;

/// GVRET TCP Reader - streams live CAN data over TCP with transmit support
pub struct GvretReader {
    app: AppHandle,
    session_id: String,
    host: String,
    port: u16,
    timeout_sec: f64,
    limit: Option<i64>,
    /// Optional bus number override - if set, all frames will use this bus number
    /// instead of the device-reported bus number
    bus_override: Option<u8>,
    state: IOState,
    cancel_flag: Arc<AtomicBool>,
    task_handle: Option<tauri::async_runtime::JoinHandle<()>>,
    /// Shared TCP write half - allows transmit while reading
    writer: SharedTcpWriter,
    /// Channel sender for transmit requests (allows sync transmit_frame calls)
    transmit_tx: TransmitSender,
}

impl GvretReader {
    pub fn new(
        app: AppHandle,
        session_id: String,
        host: String,
        port: u16,
        timeout_sec: f64,
        limit: Option<i64>,
        bus_override: Option<u8>,
    ) -> Self {
        Self {
            app,
            session_id,
            host,
            port,
            timeout_sec,
            limit,
            bus_override,
            state: IOState::Stopped,
            cancel_flag: Arc::new(AtomicBool::new(false)),
            task_handle: None,
            writer: Arc::new(TokioMutex::new(None)),
            transmit_tx: Arc::new(Mutex::new(None)),
        }
    }

    /// Transmit a CAN frame through this reader's TCP connection
    ///
    /// This sends the frame through a sync channel to the stream task, which handles
    /// the actual async TCP write. This allows transmit_frame to be called from
    /// any context (sync or async) without blocking issues.
    pub fn transmit_frame(&self, frame: &CanTransmitFrame) -> Result<TransmitResult, String> {
        // Validate frame using shared validation
        if let Err(result) = validate_gvret_frame(frame) {
            return Ok(result);
        }

        // Encode frame using shared encoder
        let data = encode_gvret_frame(frame);

        // Get the transmit sender
        let tx = {
            let guard = self
                .transmit_tx
                .lock()
                .map_err(|e| format!("Failed to lock transmit channel: {}", e))?;
            guard.clone().ok_or("Not connected (no transmit channel)")?
        };

        // Create a sync channel to receive the result (bounded to 1 for oneshot semantics)
        let (result_tx, result_rx) = std_mpsc::sync_channel(1);

        // Send the transmit request
        // With channel capacity 32, try_send should rarely fail
        tx.try_send(TransmitRequest { data, result_tx })
            .map_err(|e| match e {
                std_mpsc::TrySendError::Full(_) => {
                    "Transmit channel full (too many pending requests)".to_string()
                }
                std_mpsc::TrySendError::Disconnected(_) => {
                    "Transmit channel closed".to_string()
                }
            })?;

        // Wait for the result with a timeout
        // Dedicated transmit task processes requests immediately, so 500ms is plenty
        let result = result_rx
            .recv_timeout(std::time::Duration::from_millis(500))
            .map_err(|e| format!("Transmit timeout or channel closed: {}", e))?;

        result?;

        let transmit_result = TransmitResult::success();

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
impl IODevice for GvretReader {
    fn capabilities(&self) -> IOCapabilities {
        gvret_capabilities()
    }

    async fn start(&mut self) -> Result<(), String> {
        if self.state == IOState::Running {
            return Err("Reader is already running".to_string());
        }

        self.state = IOState::Starting;
        self.cancel_flag.store(false, Ordering::Relaxed);

        // Create the transmit channel with capacity 32.
        // Using std sync channel - a dedicated transmit task will poll this
        // independently of the read loop, ensuring immediate processing.
        let (transmit_tx, transmit_rx) = std_mpsc::sync_channel::<TransmitRequest>(32);

        // Store the sender for transmit_frame calls
        {
            let mut guard = self
                .transmit_tx
                .lock()
                .map_err(|e| format!("Failed to lock transmit_tx: {}", e))?;
            *guard = Some(transmit_tx);
        }

        let app = self.app.clone();
        let session_id = self.session_id.clone();
        let host = self.host.clone();
        let port = self.port;
        let timeout_sec = self.timeout_sec;
        let limit = self.limit;
        let bus_override = self.bus_override;
        let cancel_flag = self.cancel_flag.clone();
        let writer = self.writer.clone();

        let handle = spawn_gvret_stream(
            app,
            session_id,
            host,
            port,
            timeout_sec,
            limit,
            bus_override,
            cancel_flag,
            writer,
            transmit_rx,
        );
        self.task_handle = Some(handle);
        self.state = IOState::Running;

        Ok(())
    }

    async fn stop(&mut self) -> Result<(), String> {
        self.cancel_flag.store(true, Ordering::Relaxed);

        // Clear the transmit sender first to unblock any pending transmits
        if let Ok(mut guard) = self.transmit_tx.lock() {
            *guard = None;
        }

        if let Some(handle) = self.task_handle.take() {
            let _ = handle.await;
        }

        // Clear the writer
        {
            let mut writer_guard = self.writer.lock().await;
            *writer_guard = None;
        }

        self.state = IOState::Stopped;
        Ok(())
    }

    async fn pause(&mut self) -> Result<(), String> {
        Err("GVRET is a live stream and cannot be paused. Data would be lost.".to_string())
    }

    async fn resume(&mut self) -> Result<(), String> {
        Err("GVRET is a live stream and does not support pause/resume.".to_string())
    }

    fn set_speed(&mut self, _speed: f64) -> Result<(), String> {
        Err("GVRET is a live stream and does not support speed control.".to_string())
    }

    fn set_time_range(
        &mut self,
        _start: Option<String>,
        _end: Option<String>,
    ) -> Result<(), String> {
        Err("GVRET is a live stream and does not support time range filtering.".to_string())
    }

    fn state(&self) -> IOState {
        self.state.clone()
    }

    fn session_id(&self) -> &str {
        &self.session_id
    }

    fn transmit_frame(&self, frame: &CanTransmitFrame) -> Result<TransmitResult, String> {
        // Delegate to the impl method
        GvretReader::transmit_frame(self, frame)
    }
}

/// Spawn a GVRET TCP reader task with scoped events.
fn spawn_gvret_stream(
    app_handle: AppHandle,
    session_id: String,
    host: String,
    port: u16,
    timeout_sec: f64,
    limit: Option<i64>,
    bus_override: Option<u8>,
    cancel_flag: Arc<AtomicBool>,
    shared_writer: SharedTcpWriter,
    transmit_rx: std_mpsc::Receiver<TransmitRequest>,
) -> tauri::async_runtime::JoinHandle<()> {
    let source = format!("{host}:{port}");

    tauri::async_runtime::spawn(async move {
        let mut total_frames: i64 = 0;

        // Create a new frame buffer for this GVRET session
        let buffer_name = format!("GVRET {}", source);
        let _buffer_id = buffer_store::create_buffer(BufferType::Frames, buffer_name);

        let mut stream_reason = "disconnected";

        // Resolve and connect (allow DNS hostnames)
        let connect_res = tokio::time::timeout(
            Duration::from_secs_f64(timeout_sec),
            TcpStream::connect((host.as_str(), port)),
        )
        .await;

        let stream = match connect_res {
            Ok(Ok(s)) => s,
            Ok(Err(e)) => {
                emit_to_session(
                    &app_handle,
                    "can-bytes-error",
                    &session_id,
                    format!("Connect failed: {e}"),
                );
                stream_reason = "error";
                emit_stream_ended(&app_handle, &session_id, stream_reason, "GVRET");
                return;
            }
            Err(_) => {
                emit_to_session(
                    &app_handle,
                    "can-bytes-error",
                    &session_id,
                    "Connect timed out".to_string(),
                );
                stream_reason = "error";
                emit_stream_ended(&app_handle, &session_id, stream_reason, "GVRET");
                return;
            }
        };

        // Split the stream for concurrent read/write
        let (mut reader, writer) = tokio::io::split(stream);

        // Store the writer for transmit access
        {
            let mut writer_guard = shared_writer.lock().await;
            *writer_guard = Some(writer);
        }

        // Basic GVRET binary handshake (enter binary mode + a probe)
        {
            let mut writer_guard = shared_writer.lock().await;
            if let Some(ref mut w) = *writer_guard {
                let _ = w.write_all(&BINARY_MODE_ENABLE).await;
                let _ = w.write_all(&DEVICE_INFO_PROBE).await;
                let _ = w.flush().await;
            }
        }

        eprintln!(
            "[GVRET:{}] Starting stream (host: {}:{}, limit: {:?})",
            session_id, host, port, limit
        );

        // Spawn a dedicated transmit task that runs independently of the read loop.
        // This ensures transmits are processed immediately without waiting for reads.
        let cancel_flag_for_transmit = cancel_flag.clone();
        let shared_writer_for_transmit = shared_writer.clone();
        let transmit_task = tokio::spawn(async move {
            while !cancel_flag_for_transmit.load(Ordering::Relaxed) {
                // Check for transmit requests with a short timeout to avoid busy loop
                match transmit_rx.recv_timeout(std::time::Duration::from_millis(10)) {
                    Ok(req) => {
                        let result = {
                            let mut writer_guard = shared_writer_for_transmit.lock().await;
                            if let Some(ref mut w) = *writer_guard {
                                w.write_all(&req.data).await
                                    .map_err(|e| format!("Write failed: {}", e))
                            } else {
                                Err("Not connected".to_string())
                            }
                        };
                        // Send result back (ignore errors - caller may have timed out)
                        let _ = req.result_tx.try_send(result);
                    }
                    Err(std_mpsc::RecvTimeoutError::Timeout) => {
                        // No request, continue loop
                    }
                    Err(std_mpsc::RecvTimeoutError::Disconnected) => {
                        // Channel closed, exit
                        break;
                    }
                }
            }
        });

        // Read loop - only handles reading, transmit is handled by the dedicated task
        let mut read_buf = vec![0u8; 4096];
        let mut parse_buf: Vec<u8> = Vec::with_capacity(4096);

        'stream_loop: while !cancel_flag.load(Ordering::Relaxed) {
            // Read with a timeout for periodic cancel check
            let read_result = tokio::time::timeout(
                Duration::from_millis(50),
                reader.read(&mut read_buf)
            ).await;

            match read_result {
                Ok(Ok(0)) => break 'stream_loop, // Connection closed
                Ok(Ok(n)) if n > 0 => {
                    parse_buf.extend_from_slice(&read_buf[..n]);
                    let frames = parse_gvret_frames(&mut parse_buf);
                    if !frames.is_empty() {
                        // Calculate how many frames to emit based on limit
                        let frames_to_emit = if let Some(max) = limit {
                            let remaining = max - total_frames;
                            if remaining <= 0 {
                                0
                            } else {
                                (remaining as usize).min(frames.len())
                            }
                        } else {
                            frames.len()
                        };

                        // Skip if no frames to emit (already at limit)
                        if frames_to_emit == 0 {
                            stream_reason = "complete";
                            break 'stream_loop;
                        }

                        // Take only the frames we need
                        let frames_subset: Vec<_> =
                            frames.into_iter().take(frames_to_emit).collect();

                        // Emit per-frame raw payloads (scoped to session)
                        for (_, raw_hex) in &frames_subset {
                            let payload = CanBytesPayload {
                                hex: raw_hex.clone(),
                                len: raw_hex.len() / 2,
                                timestamp_ms: now_ms(),
                                source: source.clone(),
                            };
                            emit_to_session(&app_handle, "can-bytes", &session_id, payload);
                        }
                        // Emit parsed frames (scoped to session)
                        // Apply bus_override if set
                        let frame_only: Vec<FrameMessage> =
                            frames_subset.into_iter().map(|(mut f, _)| {
                                if let Some(bus) = bus_override {
                                    f.bus = bus;
                                }
                                f
                            }).collect();

                        // Buffer frames for replay
                        buffer_store::append_frames(frame_only.clone());

                        // Track total frames
                        total_frames += frame_only.len() as i64;
                        // Debug: log every 1000 frames
                        if total_frames % 1000 == 0
                            || limit.map(|l| total_frames >= l).unwrap_or(false)
                        {
                            eprintln!(
                                "[GVRET:{}] Emitted {} frames total, limit: {:?}",
                                session_id, total_frames, limit
                            );
                        }
                        emit_frames(&app_handle, &session_id, frame_only);

                        // Check if we've reached the frame limit
                        if let Some(max) = limit {
                            if total_frames >= max {
                                eprintln!(
                                    "[GVRET:{}] Reached limit of {} frames, stopping",
                                    session_id, max
                                );
                                stream_reason = "complete";
                                break 'stream_loop;
                            }
                        }
                    }
                }
                Ok(Ok(_)) => {} // n == 0 but not EOF, continue
                Ok(Err(e)) => {
                    emit_to_session(
                        &app_handle,
                        "can-bytes-error",
                        &session_id,
                        format!("Read failed: {e}"),
                    );
                    stream_reason = "error";
                    break 'stream_loop;
                }
                Err(_) => {} // Timeout - loop back to check cancel flag
            }
        }

        // Abort the transmit task when the read loop exits
        transmit_task.abort();

        // Check if we were stopped by user (but not if we hit the limit)
        if cancel_flag.load(Ordering::Relaxed) && stream_reason == "disconnected" {
            stream_reason = "stopped";
        }

        // Clear the writer and close the connection
        {
            let mut writer_guard = shared_writer.lock().await;
            if let Some(mut w) = writer_guard.take() {
                let _ = w.shutdown().await;
            }
        }

        // Emit stream-ended event
        emit_stream_ended(&app_handle, &session_id, stream_reason, "GVRET");
    })
}

// ============================================================================
// Device Probing
// ============================================================================

/// Probe a GVRET TCP device to discover its capabilities
///
/// This function connects to the device, queries the number of available buses,
/// and returns device information. The connection is closed after probing.
pub async fn probe_gvret_tcp(
    host: &str,
    port: u16,
    timeout_sec: f64,
) -> Result<GvretDeviceInfo, String> {
    eprintln!(
        "[probe_gvret_tcp] Probing GVRET device at {}:{} (timeout: {}s)",
        host, port, timeout_sec
    );

    // Connect with timeout
    let connect_res = tokio::time::timeout(
        Duration::from_secs_f64(timeout_sec),
        TcpStream::connect((host, port)),
    )
    .await;

    let mut stream = match connect_res {
        Ok(Ok(s)) => {
            eprintln!("[probe_gvret_tcp] Connected to {}:{}", host, port);
            s
        }
        Ok(Err(e)) => return Err(format!("Failed to connect to {}:{}: {}", host, port, e)),
        Err(_) => return Err(format!("Connection to {}:{} timed out", host, port)),
    };

    // Enter binary mode
    stream
        .write_all(&BINARY_MODE_ENABLE)
        .await
        .map_err(|e| format!("Failed to enable binary mode: {}", e))?;

    // Wait a moment for the device to process
    tokio::time::sleep(Duration::from_millis(50)).await;

    // Query number of buses
    stream
        .write_all(&GVRET_CMD_NUMBUSES)
        .await
        .map_err(|e| format!("Failed to send NUMBUSES command: {}", e))?;

    stream
        .flush()
        .await
        .map_err(|e| format!("Failed to flush: {}", e))?;

    // Read response with timeout
    // Response format: [0xF1][0x0C][bus_count]
    let mut buf = vec![0u8; 256];
    let mut total_read = 0;
    let read_timeout = Duration::from_millis((timeout_sec * 1000.0) as u64);

    let deadline = tokio::time::Instant::now() + read_timeout;

    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break;
        }

        match tokio::time::timeout(remaining.min(Duration::from_millis(100)), stream.read(&mut buf[total_read..])).await {
            Ok(Ok(0)) => break, // EOF
            Ok(Ok(n)) => {
                total_read += n;

                // Look for NUMBUSES response: [0xF1][0x0C][bus_count]
                for i in 0..total_read.saturating_sub(2) {
                    if buf[i] == GVRET_SYNC && buf[i + 1] == 0x0C && i + 2 < total_read {
                        let bus_count = buf[i + 2];
                        // Sanity check: GVRET devices have 1-5 buses
                        let bus_count = if bus_count == 0 || bus_count > 5 {
                            // Default to 5 if response is invalid
                            eprintln!(
                                "[probe_gvret_tcp] Invalid bus count {}, defaulting to 5",
                                bus_count
                            );
                            5
                        } else {
                            bus_count
                        };

                        eprintln!(
                            "[probe_gvret_tcp] SUCCESS: Device at {}:{} has {} buses available",
                            host, port, bus_count
                        );
                        return Ok(GvretDeviceInfo { bus_count });
                    }
                }

                // If we've read enough data without finding the response, give up
                if total_read > 128 {
                    break;
                }
            }
            Ok(Err(e)) => {
                return Err(format!("Failed to read response: {}", e));
            }
            Err(_) => {
                // Timeout on this read, continue if we still have time
            }
        }
    }

    // If we didn't get a response, assume 5 buses (standard GVRET)
    eprintln!(
        "[probe_gvret_tcp] No NUMBUSES response received, defaulting to 5 buses"
    );
    Ok(GvretDeviceInfo { bus_count: 5 })
}
