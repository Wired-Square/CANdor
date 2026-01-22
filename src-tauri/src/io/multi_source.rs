// ui/src-tauri/src/io/multi_source.rs
//
// Multi-source reader that combines frames from multiple IO devices.
// Used for multi-bus capture where frames from diverse sources are merged.

use async_trait::async_trait;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc as std_mpsc, Arc, Mutex};
use tauri::AppHandle;
use tokio::sync::mpsc;

use std::collections::HashMap;

use super::gvret_common::{apply_bus_mapping, emit_stream_ended, encode_gvret_frame, validate_gvret_frame, BusMapping};
use super::{
    emit_frames, emit_to_session, CanTransmitFrame,
    FrameMessage, IOCapabilities, IODevice, IOState, TransmitResult,
};
use crate::buffer_store::{self, BufferType};

// ============================================================================
// Transmit Types
// ============================================================================

/// Transmit request sent through the channel
struct TransmitRequest {
    /// Encoded frame bytes ready to send
    data: Vec<u8>,
    /// Sync oneshot channel to send the result back
    result_tx: std_mpsc::SyncSender<Result<(), String>>,
}

/// Sender type for transmit requests (sync-safe)
type TransmitSender = std_mpsc::SyncSender<TransmitRequest>;

// ============================================================================
// Types
// ============================================================================

/// Configuration for a single source in a multi-source session
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct SourceConfig {
    /// Profile ID for this source
    pub profile_id: String,
    /// Profile kind (gvret_tcp, gvret_usb, gs_usb, socketcan, slcan)
    pub profile_kind: String,
    /// Display name for this source
    pub display_name: String,
    /// Bus mappings for this source (device bus -> output bus)
    pub bus_mappings: Vec<BusMapping>,
}

/// Internal message from sub-readers to the merge task
enum SourceMessage {
    /// Frames from a source (source_index, frames)
    Frames(usize, Vec<FrameMessage>),
    /// Source ended (source_index, reason)
    Ended(usize, String),
    /// Source error (source_index, error)
    Error(usize, String),
    /// Transmit channel is ready (source_index, transmit_sender)
    TransmitReady(usize, TransmitSender),
}

// ============================================================================
// Multi-Source Reader
// ============================================================================

/// Transmit routing info: maps output bus to source and device bus
#[derive(Clone, Debug)]
struct TransmitRoute {
    /// Source index in the sources array
    source_idx: usize,
    /// Profile ID for logging
    profile_id: String,
    /// Profile kind for frame encoding (gvret_tcp, gvret_usb, gs_usb, socketcan, slcan)
    profile_kind: String,
    /// Device bus number to use when transmitting
    device_bus: u8,
}

/// Shared transmit channels by source index
type TransmitChannels = Arc<Mutex<HashMap<usize, TransmitSender>>>;

/// Reader that combines frames from multiple IO devices
pub struct MultiSourceReader {
    app: AppHandle,
    session_id: String,
    sources: Vec<SourceConfig>,
    state: IOState,
    stop_flag: Arc<AtomicBool>,
    /// Handles to sub-reader tasks
    task_handles: Vec<tokio::task::JoinHandle<()>>,
    /// Channel to receive messages from sub-readers
    rx: Option<mpsc::Receiver<SourceMessage>>,
    /// Sender for sub-readers to send messages (kept for cloning)
    tx: mpsc::Sender<SourceMessage>,
    /// Mapping from output bus number to transmit route (source_idx, device_bus)
    transmit_routes: HashMap<u8, TransmitRoute>,
    /// Transmit channels by source index (populated when sources connect)
    transmit_channels: TransmitChannels,
}

impl MultiSourceReader {
    /// Create a new multi-source reader
    pub fn new(app: AppHandle, session_id: String, sources: Vec<SourceConfig>) -> Self {
        let (tx, rx) = mpsc::channel(1024);

        // Build transmit routing table: output_bus -> (source_idx, device_bus, kind)
        let mut transmit_routes = HashMap::new();
        for (source_idx, source) in sources.iter().enumerate() {
            for mapping in &source.bus_mappings {
                if mapping.enabled {
                    transmit_routes.insert(
                        mapping.output_bus,
                        TransmitRoute {
                            source_idx,
                            profile_id: source.profile_id.clone(),
                            profile_kind: source.profile_kind.clone(),
                            device_bus: mapping.device_bus,
                        },
                    );
                }
            }
        }

        Self {
            app,
            session_id,
            sources,
            state: IOState::Stopped,
            stop_flag: Arc::new(AtomicBool::new(false)),
            task_handles: Vec::new(),
            rx: Some(rx),
            tx,
            transmit_routes,
            transmit_channels: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Get the source configurations for this multi-source session
    #[allow(dead_code)]
    pub fn sources(&self) -> &[SourceConfig] {
        &self.sources
    }

    /// Get combined capabilities from all sources
    fn combined_capabilities(&self) -> IOCapabilities {
        // Multi-source sessions have limited capabilities
        // - No pause (would need to coordinate all sources)
        // - No time range (real-time only for now)
        // - Real-time since we're combining live sources
        // - Transmit is supported by routing to the appropriate source
        IOCapabilities {
            can_pause: false,
            supports_time_range: false,
            is_realtime: true,
            supports_speed_control: false,
            supports_seek: false,
            // Can transmit if we have any transmit routes configured
            can_transmit: !self.transmit_routes.is_empty(),
            can_transmit_serial: false,
            supports_canfd: true,
            supports_extended_id: true,
            supports_rtr: true,
            // Collect all output bus numbers from all source mappings (sorted)
            available_buses: {
                let mut buses: Vec<u8> = self
                    .sources
                    .iter()
                    .flat_map(|s| s.bus_mappings.iter().filter(|m| m.enabled).map(|m| m.output_bus))
                    .collect::<std::collections::HashSet<_>>()
                    .into_iter()
                    .collect();
                buses.sort();
                buses
            },
        }
    }
}

#[async_trait]
impl IODevice for MultiSourceReader {
    fn capabilities(&self) -> IOCapabilities {
        self.combined_capabilities()
    }

    async fn start(&mut self) -> Result<(), String> {
        if matches!(self.state, IOState::Running | IOState::Starting) {
            return Err("Session already running".to_string());
        }

        // Check that we have a receiver before changing state
        // If rx was consumed and not recreated (e.g., after error), recreate it
        if self.rx.is_none() {
            eprintln!(
                "[MultiSourceReader] Receiver was consumed, recreating channel for session '{}'",
                self.session_id
            );
            let (tx, rx) = mpsc::channel(1024);
            self.tx = tx;
            self.rx = Some(rx);
        }

        self.state = IOState::Starting;
        self.stop_flag.store(false, Ordering::SeqCst);

        // Create a frame buffer for this multi-source session
        let buffer_name = format!("Multi-Source {}", self.session_id);
        let _buffer_id = buffer_store::create_buffer(BufferType::Frames, buffer_name);

        // Clear any stale transmit channels from previous run
        if let Ok(mut channels) = self.transmit_channels.lock() {
            channels.clear();
        }

        let app = self.app.clone();
        let session_id = self.session_id.clone();
        let sources = self.sources.clone();
        let stop_flag = self.stop_flag.clone();
        let tx = self.tx.clone();
        let transmit_channels = self.transmit_channels.clone();

        // Take the receiver - we'll use it in the merge task
        // This should always succeed now since we checked/recreated above
        let rx = self.rx.take().ok_or("Receiver already taken")?;

        // Spawn the merge task that collects frames from all sources
        let merge_handle = tokio::spawn(async move {
            run_merge_task(app, session_id, sources, stop_flag, rx, tx, transmit_channels).await;
        });

        self.task_handles.push(merge_handle);
        self.state = IOState::Running;

        Ok(())
    }

    async fn stop(&mut self) -> Result<(), String> {
        eprintln!(
            "[MultiSourceReader] Stopping session '{}'",
            self.session_id
        );

        self.stop_flag.store(true, Ordering::SeqCst);

        // Wait for all tasks to finish
        for handle in self.task_handles.drain(..) {
            let _ = handle.await;
        }

        // Recreate the channel so the session can be started again
        let (tx, rx) = mpsc::channel(1024);
        self.tx = tx;
        self.rx = Some(rx);

        self.state = IOState::Stopped;
        Ok(())
    }

    async fn pause(&mut self) -> Result<(), String> {
        Err("Multi-source sessions do not support pause".to_string())
    }

    async fn resume(&mut self) -> Result<(), String> {
        Err("Multi-source sessions do not support resume".to_string())
    }

    fn set_speed(&mut self, _speed: f64) -> Result<(), String> {
        Err("Multi-source sessions do not support speed control".to_string())
    }

    fn set_time_range(
        &mut self,
        _start: Option<String>,
        _end: Option<String>,
    ) -> Result<(), String> {
        Err("Multi-source sessions do not support time range".to_string())
    }

    fn transmit_frame(&self, frame: &CanTransmitFrame) -> Result<TransmitResult, String> {
        // Route transmit to the appropriate source based on bus number
        let route = self
            .transmit_routes
            .get(&frame.bus)
            .ok_or_else(|| {
                format!(
                    "No source configured for bus {} (available: {:?})",
                    frame.bus,
                    self.transmit_routes.keys().collect::<Vec<_>>()
                )
            })?;

        // Create a modified frame with the device bus number (reverse the mapping)
        let mut routed_frame = frame.clone();
        routed_frame.bus = route.device_bus;

        // Get the transmit channel for this source
        let channels = self.transmit_channels.lock()
            .map_err(|e| format!("Failed to lock transmit channels: {}", e))?;

        let tx = channels.get(&route.source_idx)
            .ok_or_else(|| {
                format!(
                    "No transmit channel for source {} (profile '{}') - source may not support transmit or not yet connected",
                    route.source_idx, route.profile_id
                )
            })?
            .clone();
        drop(channels); // Release lock before blocking

        // Encode the frame based on the profile kind
        let data = match route.profile_kind.as_str() {
            "gvret_tcp" | "gvret_usb" => {
                // Validate and encode for GVRET protocol
                if let Err(result) = validate_gvret_frame(&routed_frame) {
                    return Ok(result);
                }
                encode_gvret_frame(&routed_frame)
            }
            #[cfg(any(target_os = "windows", target_os = "macos"))]
            "gs_usb" => {
                // Encode for gs_usb protocol (20-byte host frame)
                // Use echo_id = 0, the transmit task will handle incrementing if needed
                encode_gs_usb_frame(&routed_frame, 0).to_vec()
            }
            "slcan" => {
                // Encode for slcan protocol
                encode_slcan_transmit_frame(&routed_frame)
            }
            #[cfg(target_os = "linux")]
            "socketcan" => {
                // Encode for SocketCAN - raw CAN frame bytes
                encode_socketcan_frame(&routed_frame)
            }
            _ => {
                return Err(format!(
                    "Unsupported profile kind '{}' for transmission",
                    route.profile_kind
                ));
            }
        };

        // Create a sync channel to receive the result
        let (result_tx, result_rx) = std_mpsc::sync_channel(1);

        // Send the transmit request
        tx.try_send(TransmitRequest { data, result_tx })
            .map_err(|e| format!("Failed to queue transmit request: {}", e))?;

        // Wait for the result with a timeout
        let result = result_rx
            .recv_timeout(std::time::Duration::from_millis(500))
            .map_err(|e| format!("Transmit timeout or channel closed: {}", e))?;

        result?;

        Ok(TransmitResult::success())
    }

    fn state(&self) -> IOState {
        self.state.clone()
    }

    fn session_id(&self) -> &str {
        &self.session_id
    }

    fn device_type(&self) -> &'static str {
        "multi_source"
    }

    fn multi_source_configs(&self) -> Option<Vec<SourceConfig>> {
        Some(self.sources.clone())
    }
}

// ============================================================================
// Merge Task
// ============================================================================

/// Main merge task that spawns sub-readers and combines their frames
async fn run_merge_task(
    app: AppHandle,
    session_id: String,
    sources: Vec<SourceConfig>,
    stop_flag: Arc<AtomicBool>,
    mut rx: mpsc::Receiver<SourceMessage>,
    tx: mpsc::Sender<SourceMessage>,
    transmit_channels: TransmitChannels,
) {
    use crate::settings;

    // Load settings to get profile configurations
    let settings = match settings::load_settings(app.clone()).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[MultiSourceReader] Failed to load settings: {}", e);
            emit_stream_ended(&app, &session_id, "error", "MultiSourceReader");
            return;
        }
    };

    // Spawn a sub-reader task for each source
    let mut source_handles = Vec::new();
    for (index, source_config) in sources.iter().enumerate() {
        let profile = match settings.io_profiles.iter().find(|p| p.id == source_config.profile_id) {
            Some(p) => p.clone(),
            None => {
                eprintln!(
                    "[MultiSourceReader] Profile '{}' not found",
                    source_config.profile_id
                );
                continue;
            }
        };

        let app_clone = app.clone();
        let session_id_clone = session_id.clone();
        let stop_flag_clone = stop_flag.clone();
        let tx_clone = tx.clone();
        let bus_mappings = source_config.bus_mappings.clone();
        let display_name = source_config.display_name.clone();

        let handle = tokio::spawn(async move {
            run_source_reader(
                app_clone,
                session_id_clone,
                index,
                profile,
                bus_mappings,
                display_name,
                stop_flag_clone,
                tx_clone,
            )
            .await;
        });

        source_handles.push(handle);
    }

    // Track which sources are still active
    let mut active_sources = sources.len();
    let mut pending_frames: Vec<FrameMessage> = Vec::new();
    let mut last_emit = std::time::Instant::now();

    // Track frames per bus for periodic logging
    let mut frames_per_bus: std::collections::HashMap<u8, usize> = std::collections::HashMap::new();
    let mut last_bus_log = std::time::Instant::now();

    // Main merge loop
    while !stop_flag.load(Ordering::SeqCst) && active_sources > 0 {
        // Use timeout to allow periodic emission even with slow sources
        match tokio::time::timeout(std::time::Duration::from_millis(50), rx.recv()).await {
            Ok(Some(msg)) => match msg {
                SourceMessage::Frames(_source_idx, frames) => {
                    // Track frames per bus
                    for frame in &frames {
                        *frames_per_bus.entry(frame.bus).or_insert(0) += 1;
                    }
                    pending_frames.extend(frames);
                }
                SourceMessage::Ended(source_idx, reason) => {
                    eprintln!(
                        "[MultiSourceReader] Source {} ended: {}",
                        source_idx, reason
                    );
                    // Remove transmit channel for this source
                    if let Ok(mut channels) = transmit_channels.lock() {
                        channels.remove(&source_idx);
                    }
                    active_sources = active_sources.saturating_sub(1);
                }
                SourceMessage::Error(source_idx, error) => {
                    eprintln!(
                        "[MultiSourceReader] Source {} error: {}",
                        source_idx, error
                    );
                    // Remove transmit channel for this source
                    if let Ok(mut channels) = transmit_channels.lock() {
                        channels.remove(&source_idx);
                    }
                    emit_to_session(&app, "can-bytes-error", &session_id, error);
                    active_sources = active_sources.saturating_sub(1);
                }
                SourceMessage::TransmitReady(source_idx, tx_sender) => {
                    eprintln!(
                        "[MultiSourceReader] Source {} transmit channel ready",
                        source_idx
                    );
                    if let Ok(mut channels) = transmit_channels.lock() {
                        channels.insert(source_idx, tx_sender);
                    }
                }
            },
            Ok(None) => {
                // Channel closed
                break;
            }
            Err(_) => {
                // Timeout - emit any pending frames
            }
        }

        // Periodically log frames per bus (every 5 seconds)
        if last_bus_log.elapsed().as_secs() >= 5 && !frames_per_bus.is_empty() {
            let mut bus_counts: Vec<_> = frames_per_bus.iter().collect();
            bus_counts.sort_by_key(|(bus, _)| *bus);
            let counts_str: Vec<String> = bus_counts
                .iter()
                .map(|(bus, count)| format!("bus {}: {}", bus, count))
                .collect();
            eprintln!(
                "[MultiSourceReader] Frame counts per bus: {}",
                counts_str.join(", ")
            );
            last_bus_log = std::time::Instant::now();
        }

        // Emit frames if we have any and either:
        // - We have a decent batch (>= 100 frames)
        // - It's been more than 50ms since last emit
        if !pending_frames.is_empty()
            && (pending_frames.len() >= 100 || last_emit.elapsed().as_millis() >= 50)
        {
            // Sort by timestamp for proper ordering
            pending_frames.sort_by_key(|f| f.timestamp_us);

            // Append to buffer
            buffer_store::append_frames(pending_frames.clone());

            // Emit to frontend
            emit_frames(&app, &session_id, pending_frames);
            pending_frames = Vec::new();
            last_emit = std::time::Instant::now();
        }
    }

    // Emit any remaining frames
    if !pending_frames.is_empty() {
        pending_frames.sort_by_key(|f| f.timestamp_us);
        buffer_store::append_frames(pending_frames.clone());
        emit_frames(&app, &session_id, pending_frames);
    }

    // Wait for all source tasks to finish
    for handle in source_handles {
        let _ = handle.await;
    }

    // Emit stream ended (uses helper from gvret_common which finalizes the buffer)
    let reason = if stop_flag.load(Ordering::SeqCst) {
        "stopped"
    } else {
        "complete"
    };
    emit_stream_ended(&app, &session_id, reason, "MultiSourceReader");

}

/// Run a single source reader and send frames to the merge task
async fn run_source_reader(
    app: AppHandle,
    _session_id: String,
    source_idx: usize,
    profile: crate::settings::IOProfile,
    bus_mappings: Vec<BusMapping>,
    _display_name: String,
    stop_flag: Arc<AtomicBool>,
    tx: mpsc::Sender<SourceMessage>,
) {
    match profile.kind.as_str() {
        "gvret_tcp" | "gvret-tcp" => {
            let host = profile
                .connection
                .get("host")
                .and_then(|v| v.as_str())
                .unwrap_or("127.0.0.1")
                .to_string();
            let port = profile
                .connection
                .get("port")
                .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                .unwrap_or(23) as u16;
            let timeout_sec = profile
                .connection
                .get("timeout")
                .and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                .unwrap_or(5.0);

            run_gvret_tcp_source(
                app,
                source_idx,
                host,
                port,
                timeout_sec,
                bus_mappings,
                stop_flag,
                tx,
            )
            .await;
        }
        "gvret_usb" | "gvret-usb" => {
            let port = match profile.connection.get("port").and_then(|v| v.as_str()) {
                Some(p) => p.to_string(),
                None => {
                    let _ = tx
                        .send(SourceMessage::Error(
                            source_idx,
                            "Serial port is required".to_string(),
                        ))
                        .await;
                    return;
                }
            };
            let baud_rate = profile
                .connection
                .get("baud_rate")
                .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                .unwrap_or(115200) as u32;

            run_gvret_usb_source(
                app,
                source_idx,
                port,
                baud_rate,
                bus_mappings,
                stop_flag,
                tx,
            )
            .await;
        }
        "slcan" => {
            let port = match profile.connection.get("port").and_then(|v| v.as_str()) {
                Some(p) => p.to_string(),
                None => {
                    let _ = tx
                        .send(SourceMessage::Error(
                            source_idx,
                            "Serial port is required".to_string(),
                        ))
                        .await;
                    return;
                }
            };
            let baud_rate = profile
                .connection
                .get("baud_rate")
                .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                .unwrap_or(115200) as u32;
            let bitrate = profile
                .connection
                .get("bitrate")
                .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                .unwrap_or(500_000) as u32;
            let silent_mode = profile
                .connection
                .get("silent_mode")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            run_slcan_source(
                app,
                source_idx,
                port,
                baud_rate,
                bitrate,
                silent_mode,
                bus_mappings,
                stop_flag,
                tx,
            )
            .await;
        }
        #[cfg(any(target_os = "windows", target_os = "macos"))]
        "gs_usb" => {
            let device_index = profile
                .connection
                .get("device_index")
                .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                .unwrap_or(0) as usize;
            let bitrate = profile
                .connection
                .get("bitrate")
                .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
                .unwrap_or(500_000) as u32;
            let listen_only = profile
                .connection
                .get("listen_only")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);

            run_gs_usb_source(
                app,
                source_idx,
                device_index,
                bitrate,
                listen_only,
                bus_mappings,
                stop_flag,
                tx,
            )
            .await;
        }
        #[cfg(target_os = "linux")]
        "socketcan" => {
            let interface = match profile.connection.get("interface").and_then(|v| v.as_str()) {
                Some(i) => i.to_string(),
                None => {
                    let _ = tx
                        .send(SourceMessage::Error(
                            source_idx,
                            "SocketCAN interface is required".to_string(),
                        ))
                        .await;
                    return;
                }
            };

            run_socketcan_source(
                app,
                source_idx,
                interface,
                bus_mappings,
                stop_flag,
                tx,
            )
            .await;
        }
        kind => {
            let _ = tx
                .send(SourceMessage::Error(
                    source_idx,
                    format!("Unsupported source type for multi-bus: {}", kind),
                ))
                .await;
        }
    }
}

/// Run GVRET TCP source and send frames to merge task
async fn run_gvret_tcp_source(
    _app: AppHandle,
    source_idx: usize,
    host: String,
    port: u16,
    timeout_sec: f64,
    bus_mappings: Vec<BusMapping>,
    stop_flag: Arc<AtomicBool>,
    tx: mpsc::Sender<SourceMessage>,
) {
    use super::gvret_common::{parse_gvret_frames, BINARY_MODE_ENABLE, DEVICE_INFO_PROBE};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpStream;
    use tokio::time::Duration;

    // Connect with timeout
    let connect_result = tokio::time::timeout(
        Duration::from_secs_f64(timeout_sec),
        TcpStream::connect((host.as_str(), port)),
    )
    .await;

    let stream = match connect_result {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => {
            let _ = tx
                .send(SourceMessage::Error(
                    source_idx,
                    format!("Connection failed: {}", e),
                ))
                .await;
            return;
        }
        Err(_) => {
            let _ = tx
                .send(SourceMessage::Error(
                    source_idx,
                    "Connection timed out".to_string(),
                ))
                .await;
            return;
        }
    };

    // Split into read/write halves
    let (mut read_half, mut write_half) = stream.into_split();

    // Enable binary mode
    if let Err(e) = write_half.write_all(&BINARY_MODE_ENABLE).await {
        let _ = tx
            .send(SourceMessage::Error(
                source_idx,
                format!("Failed to enable binary mode: {}", e),
            ))
            .await;
        return;
    }
    let _ = write_half.flush().await;

    tokio::time::sleep(Duration::from_millis(100)).await;

    // Send device info probe
    let _ = write_half.write_all(&DEVICE_INFO_PROBE).await;
    let _ = write_half.flush().await;

    // Create transmit channel and send it to the merge task
    let (transmit_tx, transmit_rx) = std_mpsc::sync_channel::<TransmitRequest>(32);
    let _ = tx.send(SourceMessage::TransmitReady(source_idx, transmit_tx)).await;

    eprintln!(
        "[MultiSourceReader] Source {} GVRET TCP connected to {}:{}, transmit channel ready",
        source_idx, host, port
    );

    // Wrap write_half in Arc<Mutex> so it can be shared with transmit handling
    let write_half = Arc::new(tokio::sync::Mutex::new(write_half));
    let write_half_for_transmit = write_half.clone();

    // Spawn a dedicated task for handling transmit requests
    // This ensures transmits are processed immediately without waiting for read timeouts
    let stop_flag_for_transmit = stop_flag.clone();
    let transmit_task = tokio::spawn(async move {
        while !stop_flag_for_transmit.load(Ordering::SeqCst) {
            // Check for transmit requests with a short sleep to avoid busy loop
            match transmit_rx.recv_timeout(std::time::Duration::from_millis(10)) {
                Ok(req) => {
                    let mut writer = write_half_for_transmit.lock().await;
                    let result = writer.write_all(&req.data).await
                        .map_err(|e| format!("Write error: {}", e));
                    let _ = writer.flush().await;
                    let _ = req.result_tx.send(result);
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

    // Read loop - now only handles reading, transmit is handled by separate task
    let mut buffer = Vec::with_capacity(4096);
    let mut read_buf = [0u8; 2048];

    while !stop_flag.load(Ordering::SeqCst) {
        // Read with timeout
        match tokio::time::timeout(Duration::from_millis(50), read_half.read(&mut read_buf)).await {
            Ok(Ok(0)) => {
                // Connection closed
                let _ = tx
                    .send(SourceMessage::Ended(source_idx, "disconnected".to_string()))
                    .await;
                return;
            }
            Ok(Ok(n)) => {
                buffer.extend_from_slice(&read_buf[..n]);

                // Parse GVRET frames
                let frames = parse_gvret_frames(&mut buffer);
                if !frames.is_empty() {
                    // Apply bus mappings and filter disabled buses
                    let mapped_frames: Vec<FrameMessage> = frames
                        .into_iter()
                        .filter_map(|(mut frame, _raw)| {
                            if apply_bus_mapping(&mut frame, &bus_mappings) {
                                Some(frame)
                            } else {
                                None // Bus is disabled
                            }
                        })
                        .collect();

                    if !mapped_frames.is_empty() {
                        let _ = tx
                            .send(SourceMessage::Frames(source_idx, mapped_frames))
                            .await;
                    }
                }
            }
            Ok(Err(e)) => {
                let _ = tx
                    .send(SourceMessage::Error(
                        source_idx,
                        format!("Read error: {}", e),
                    ))
                    .await;
                return;
            }
            Err(_) => {
                // Timeout - continue
            }
        }
    }

    // Abort the transmit task when the read loop exits
    transmit_task.abort();

    let _ = tx
        .send(SourceMessage::Ended(source_idx, "stopped".to_string()))
        .await;
}

/// Run GVRET USB source and send frames to merge task
async fn run_gvret_usb_source(
    _app: AppHandle,
    source_idx: usize,
    port: String,
    baud_rate: u32,
    bus_mappings: Vec<BusMapping>,
    stop_flag: Arc<AtomicBool>,
    tx: mpsc::Sender<SourceMessage>,
) {
    use super::gvret_common::{parse_gvret_frames, BINARY_MODE_ENABLE, DEVICE_INFO_PROBE};
    use std::io::{Read, Write};
    use std::time::Duration;

    // Open serial port
    let serial_port = match serialport::new(&port, baud_rate)
        .timeout(Duration::from_millis(10))
        .open()
    {
        Ok(p) => p,
        Err(e) => {
            let _ = tx
                .send(SourceMessage::Error(
                    source_idx,
                    format!("Failed to open port: {}", e),
                ))
                .await;
            return;
        }
    };

    // Wrap in Arc<Mutex> for shared access between read and transmit
    let serial_port = Arc::new(std::sync::Mutex::new(serial_port));

    // Clear buffers and initialize (do all sync work without awaiting)
    let init_result: Result<(), String> = (|| {
        let mut port = serial_port.lock().unwrap();
        let _ = port.clear(serialport::ClearBuffer::All);

        // Enable binary mode
        port.write_all(&BINARY_MODE_ENABLE)
            .map_err(|e| format!("Failed to enable binary mode: {}", e))?;
        let _ = port.flush();
        Ok(())
    })();

    if let Err(e) = init_result {
        let _ = tx.send(SourceMessage::Error(source_idx, e)).await;
        return;
    }

    std::thread::sleep(Duration::from_millis(100));

    // Send device info probe
    {
        let mut port = serial_port.lock().unwrap();
        let _ = port.write_all(&DEVICE_INFO_PROBE);
        let _ = port.flush();
    }

    // Create transmit channel and send it to the merge task
    let (transmit_tx, transmit_rx) = std_mpsc::sync_channel::<TransmitRequest>(32);
    let _ = tx.send(SourceMessage::TransmitReady(source_idx, transmit_tx)).await;

    eprintln!(
        "[MultiSourceReader] Source {} GVRET USB connected to {}, transmit channel ready",
        source_idx, port
    );

    // Read loop (blocking, so we run it in a blocking task)
    let tx_clone = tx.clone();
    let stop_flag_clone = stop_flag.clone();
    let serial_port_clone = serial_port.clone();

    // Spawn blocking task for serial reading
    let blocking_handle = tokio::task::spawn_blocking(move || {
        let mut buffer = Vec::with_capacity(4096);
        let mut read_buf = [0u8; 2048];

        while !stop_flag_clone.load(Ordering::SeqCst) {
            // Check for transmit requests (non-blocking)
            while let Ok(req) = transmit_rx.try_recv() {
                let result = {
                    let mut port = serial_port_clone.lock().unwrap();
                    port.write_all(&req.data)
                        .and_then(|_| port.flush())
                        .map_err(|e| format!("Write error: {}", e))
                };
                let _ = req.result_tx.send(result);
            }

            // Read data
            let read_result = {
                let mut port = serial_port_clone.lock().unwrap();
                port.read(&mut read_buf)
            };

            match read_result {
                Ok(0) => {
                    // No data
                    std::thread::sleep(Duration::from_millis(10));
                }
                Ok(n) => {
                    buffer.extend_from_slice(&read_buf[..n]);

                    // Parse GVRET frames
                    let frames = parse_gvret_frames(&mut buffer);
                    if !frames.is_empty() {
                        // Apply bus mappings and filter disabled buses
                        let mapped_frames: Vec<FrameMessage> = frames
                            .into_iter()
                            .filter_map(|(mut frame, _raw)| {
                                if apply_bus_mapping(&mut frame, &bus_mappings) {
                                    Some(frame)
                                } else {
                                    None // Bus is disabled
                                }
                            })
                            .collect();

                        if !mapped_frames.is_empty() {
                            // Use blocking send since we're in a sync context
                            let _ = tx_clone.blocking_send(SourceMessage::Frames(
                                source_idx,
                                mapped_frames,
                            ));
                        }
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    // Timeout - continue
                }
                Err(e) => {
                    let _ = tx_clone.blocking_send(SourceMessage::Error(
                        source_idx,
                        format!("Read error: {}", e),
                    ));
                    return;
                }
            }
        }

        let _ = tx_clone.blocking_send(SourceMessage::Ended(source_idx, "stopped".to_string()));
    });

    // Wait for the blocking task
    let _ = blocking_handle.await;
}

/// Run slcan source and send frames to merge task
async fn run_slcan_source(
    _app: AppHandle,
    source_idx: usize,
    port: String,
    baud_rate: u32,
    bitrate: u32,
    silent_mode: bool,
    bus_mappings: Vec<BusMapping>,
    stop_flag: Arc<AtomicBool>,
    tx: mpsc::Sender<SourceMessage>,
) {
    use super::slcan::{parse_slcan_frame, find_bitrate_command};
    use std::io::{Read, Write};
    use std::time::Duration;

    // Find the bitrate command
    let bitrate_cmd = match find_bitrate_command(bitrate) {
        Ok(cmd) => cmd,
        Err(e) => {
            let _ = tx
                .send(SourceMessage::Error(source_idx, e))
                .await;
            return;
        }
    };

    // Open serial port
    let serial_port = match serialport::new(&port, baud_rate)
        .timeout(Duration::from_millis(10))
        .open()
    {
        Ok(p) => p,
        Err(e) => {
            let _ = tx
                .send(SourceMessage::Error(
                    source_idx,
                    format!("Failed to open port: {}", e),
                ))
                .await;
            return;
        }
    };

    // Wrap in Arc<Mutex> for shared access between read and transmit
    let serial_port = Arc::new(std::sync::Mutex::new(serial_port));

    // Initialize the port (sync setup before spawning tasks)
    {
        let mut port = serial_port.lock().unwrap();

        // Close any existing connection and configure
        let _ = port.write_all(b"C\r");
        let _ = port.flush();
        std::thread::sleep(Duration::from_millis(50));

        // Set bitrate
        let bitrate_with_cr = format!("{}\r", bitrate_cmd);
        if let Err(e) = port.write_all(bitrate_with_cr.as_bytes()) {
            let _ = tx.blocking_send(SourceMessage::Error(
                source_idx,
                format!("Failed to set bitrate: {}", e),
            ));
            return;
        }
        let _ = port.flush();
        std::thread::sleep(Duration::from_millis(50));

        // Set mode (silent or normal)
        let mode_cmd = if silent_mode { b"M1\r" } else { b"M0\r" };
        let _ = port.write_all(mode_cmd);
        let _ = port.flush();
        std::thread::sleep(Duration::from_millis(50));

        // Open CAN channel
        if let Err(e) = port.write_all(b"O\r") {
            let _ = tx.blocking_send(SourceMessage::Error(
                source_idx,
                format!("Failed to open CAN channel: {}", e),
            ));
            return;
        }
        let _ = port.flush();
    }

    // Only create transmit channel if not in silent mode
    let transmit_rx = if !silent_mode {
        let (transmit_tx, transmit_rx) = std_mpsc::sync_channel::<TransmitRequest>(32);
        let _ = tx.send(SourceMessage::TransmitReady(source_idx, transmit_tx)).await;
        eprintln!(
            "[MultiSourceReader] Source {} slcan connected to {}, transmit channel ready",
            source_idx, port
        );
        Some(transmit_rx)
    } else {
        eprintln!(
            "[MultiSourceReader] Source {} slcan connected to {} (silent mode, no transmit)",
            source_idx, port
        );
        None
    };

    let tx_clone = tx.clone();
    let stop_flag_clone = stop_flag.clone();
    let serial_port_clone = serial_port.clone();

    // Spawn blocking task for serial reading and transmit handling
    let blocking_handle = tokio::task::spawn_blocking(move || {
        let mut read_buf = [0u8; 256];
        let mut line_buf = String::new();

        while !stop_flag_clone.load(Ordering::SeqCst) {
            // Check for transmit requests (non-blocking)
            if let Some(ref rx) = transmit_rx {
                while let Ok(req) = rx.try_recv() {
                    let result = {
                        let mut port = serial_port_clone.lock().unwrap();
                        // Data is already in slcan ASCII format with trailing \r
                        port.write_all(&req.data)
                            .and_then(|_| port.flush())
                            .map_err(|e| format!("slcan write error: {}", e))
                    };
                    let _ = req.result_tx.send(result);
                }
            }

            // Read data from serial port
            let read_result = {
                let mut port = serial_port_clone.lock().unwrap();
                port.read(&mut read_buf)
            };

            match read_result {
                Ok(0) => {
                    // EOF
                    break;
                }
                Ok(n) => {
                    // Append to line buffer and parse complete lines
                    if let Ok(s) = std::str::from_utf8(&read_buf[..n]) {
                        line_buf.push_str(s);

                        // Process complete lines (terminated by \r or \n)
                        while let Some(pos) = line_buf.find(|c| c == '\r' || c == '\n') {
                            let line = &line_buf[..pos];
                            let trimmed = line.trim();
                            if !trimmed.is_empty() {
                                if let Some(mut frame) = parse_slcan_frame(trimmed) {
                                    if apply_bus_mapping(&mut frame, &bus_mappings) {
                                        let _ = tx_clone.blocking_send(SourceMessage::Frames(
                                            source_idx,
                                            vec![frame],
                                        ));
                                    }
                                }
                            }
                            // Remove processed line including delimiter
                            line_buf = line_buf[pos + 1..].to_string();
                        }
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    // Timeout - continue
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    // Would block - continue
                }
                Err(e) => {
                    let _ = tx_clone.blocking_send(SourceMessage::Error(
                        source_idx,
                        format!("Read error: {}", e),
                    ));
                    break;
                }
            }
        }

        // Close CAN channel
        {
            let mut port = serial_port_clone.lock().unwrap();
            let _ = port.write_all(b"C\r");
            let _ = port.flush();
        }

        let _ = tx_clone.blocking_send(SourceMessage::Ended(source_idx, "stopped".to_string()));
    });

    let _ = blocking_handle.await;
}

/// Encode a CAN transmit frame to slcan protocol format (ASCII)
fn encode_slcan_transmit_frame(frame: &CanTransmitFrame) -> Vec<u8> {
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
    let dlc = frame.data.len().min(8);
    cmd.push_str(&format!("{:X}", dlc));

    // Data bytes
    for byte in &frame.data[..dlc] {
        cmd.push_str(&format!("{:02X}", byte));
    }

    cmd.push('\r');
    cmd.into_bytes()
}

/// Encode a CAN transmit frame to SocketCAN frame format (16 bytes)
/// struct can_frame layout: can_id (4), dlc (1), padding (3), data (8)
#[cfg(target_os = "linux")]
fn encode_socketcan_frame(frame: &CanTransmitFrame) -> Vec<u8> {
    let mut buf = vec![0u8; 16];

    // can_id (4 bytes, little-endian on most Linux systems but use native for socketcan)
    let mut can_id = frame.frame_id;
    if frame.is_extended {
        can_id |= 0x8000_0000; // CAN_EFF_FLAG
    }
    if frame.is_rtr {
        can_id |= 0x4000_0000; // CAN_RTR_FLAG
    }
    buf[0..4].copy_from_slice(&can_id.to_ne_bytes());

    // dlc (1 byte)
    let dlc = frame.data.len().min(8) as u8;
    buf[4] = dlc;

    // padding (3 bytes) - already zero

    // data (8 bytes)
    let data_len = frame.data.len().min(8);
    buf[8..8 + data_len].copy_from_slice(&frame.data[..data_len]);

    buf
}

/// Encode a CAN frame to gs_usb host frame format (20 bytes)
#[cfg(any(target_os = "windows", target_os = "macos"))]
fn encode_gs_usb_frame(frame: &CanTransmitFrame, echo_id: u32) -> [u8; 20] {
    use super::gs_usb::can_id_flags;

    let mut buf = [0u8; 20];

    // echo_id (4 bytes) - use provided echo_id for TX
    buf[0..4].copy_from_slice(&echo_id.to_le_bytes());

    // can_id (4 bytes) - includes extended flag if needed
    let mut can_id = frame.frame_id;
    if frame.is_extended {
        can_id |= can_id_flags::EXTENDED;
    }
    if frame.is_rtr {
        can_id |= can_id_flags::RTR;
    }
    buf[4..8].copy_from_slice(&can_id.to_le_bytes());

    // can_dlc (1 byte)
    let dlc = frame.data.len().min(8) as u8;
    buf[8] = dlc;

    // channel (1 byte) - always 0 for single-channel devices
    buf[9] = 0;

    // flags (1 byte) - unused for TX
    buf[10] = 0;

    // reserved (1 byte)
    buf[11] = 0;

    // data (8 bytes)
    let data_len = frame.data.len().min(8);
    buf[12..12 + data_len].copy_from_slice(&frame.data[..data_len]);

    buf
}

/// Run gs_usb source and send frames to merge task (Windows/macOS only)
#[cfg(any(target_os = "windows", target_os = "macos"))]
async fn run_gs_usb_source(
    _app: AppHandle,
    source_idx: usize,
    device_index: usize,
    bitrate: u32,
    listen_only: bool,
    bus_mappings: Vec<BusMapping>,
    stop_flag: Arc<AtomicBool>,
    tx: mpsc::Sender<SourceMessage>,
) {
    use super::gs_usb::nusb_driver;
    use super::gs_usb::{GS_USB_VID, GS_USB_PIDS};
    use std::time::Duration;

    // Find and list devices
    let devices = match nusb_driver::list_devices() {
        Ok(d) => d,
        Err(e) => {
            let _ = tx
                .send(SourceMessage::Error(
                    source_idx,
                    format!("Failed to enumerate gs_usb devices: {}", e),
                ))
                .await;
            return;
        }
    };

    if device_index >= devices.len() {
        let _ = tx
            .send(SourceMessage::Error(
                source_idx,
                format!(
                    "Device index {} out of range (found {} devices)",
                    device_index,
                    devices.len()
                ),
            ))
            .await;
        return;
    }

    let device_info = &devices[device_index];
    let bus = device_info.bus;
    let address = device_info.address;

    // Open the device using nusb async API
    let device = match nusb::list_devices().await {
        Ok(mut list) => {
            match list.find(|dev| {
                let dev_bus = dev.bus_id().parse::<u8>().unwrap_or(0);
                dev_bus == bus
                    && dev.device_address() == address
                    && dev.vendor_id() == GS_USB_VID
                    && GS_USB_PIDS.contains(&dev.product_id())
            }) {
                Some(dev) => match dev.open().await {
                    Ok(d) => d,
                    Err(e) => {
                        let _ = tx
                            .send(SourceMessage::Error(
                                source_idx,
                                format!("Failed to open device: {}", e),
                            ))
                            .await;
                        return;
                    }
                },
                None => {
                    let _ = tx
                        .send(SourceMessage::Error(
                            source_idx,
                            "Device not found".to_string(),
                        ))
                        .await;
                    return;
                }
            }
        }
        Err(e) => {
            let _ = tx
                .send(SourceMessage::Error(
                    source_idx,
                    format!("Failed to list devices: {}", e),
                ))
                .await;
            return;
        }
    };

    let interface = match device.claim_interface(0).await {
        Ok(i) => i,
        Err(e) => {
            let _ = tx
                .send(SourceMessage::Error(
                    source_idx,
                    format!("Failed to claim interface: {}", e),
                ))
                .await;
            return;
        }
    };

    // Initialize device using the helper from nusb_driver
    let config = crate::io::GsUsbConfig {
        bus,
        address,
        channel: 0,
        bitrate,
        listen_only,
        limit: None,
        display_name: None,
        bus_override: None,
    };

    if let Err(e) = nusb_driver::initialize_device(&interface, &config).await {
        let _ = tx
            .send(SourceMessage::Error(
                source_idx,
                format!("Failed to initialize device: {}", e),
            ))
            .await;
        return;
    }

    // Setup bulk IN endpoint for receiving
    let mut bulk_in = match interface.endpoint::<nusb::transfer::Bulk, nusb::transfer::In>(0x81) {
        Ok(ep) => ep,
        Err(e) => {
            let _ = tx
                .send(SourceMessage::Error(
                    source_idx,
                    format!("Failed to open IN endpoint: {}", e),
                ))
                .await;
            return;
        }
    };

    // Setup bulk OUT endpoint for transmit (if not in listen-only mode)
    let bulk_out = if !listen_only {
        match interface.endpoint::<nusb::transfer::Bulk, nusb::transfer::Out>(0x02) {
            Ok(ep) => Some(ep),
            Err(e) => {
                eprintln!(
                    "[MultiSourceReader] Source {} gs_usb: Failed to open OUT endpoint: {} (transmit disabled)",
                    source_idx, e
                );
                None
            }
        }
    } else {
        None
    };

    // Create transmit channel if we have an OUT endpoint
    let transmit_task = if let Some(bulk_out) = bulk_out {
        // Create transmit channel and send it to the merge task
        let (transmit_tx, transmit_rx) = std_mpsc::sync_channel::<TransmitRequest>(32);
        let _ = tx.send(SourceMessage::TransmitReady(source_idx, transmit_tx)).await;

        eprintln!(
            "[MultiSourceReader] Source {} gs_usb connected to bus:{} addr:{}, transmit channel ready",
            source_idx, bus, address
        );

        // Create a writer from the endpoint for standard I/O operations
        let writer = bulk_out.writer(64); // Buffer size for gs_usb frames (20 bytes each)
        let writer = Arc::new(std::sync::Mutex::new(writer));
        let writer_for_transmit = writer.clone();
        let stop_flag_for_transmit = stop_flag.clone();

        // Spawn a blocking task for handling transmit requests (writer uses blocking I/O)
        let transmit_handle = tokio::task::spawn_blocking(move || {
            use std::io::Write;
            while !stop_flag_for_transmit.load(Ordering::SeqCst) {
                match transmit_rx.recv_timeout(std::time::Duration::from_millis(10)) {
                    Ok(req) => {
                        // Write the frame data using standard Write trait
                        let result = {
                            let mut w = writer_for_transmit.lock().unwrap();
                            w.write_all(&req.data)
                                .and_then(|_| w.flush())
                                .map_err(|e| format!("USB write error: {}", e))
                        };
                        let _ = req.result_tx.send(result);
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

        Some(transmit_handle)
    } else {
        eprintln!(
            "[MultiSourceReader] Source {} gs_usb connected to bus:{} addr:{} (listen-only, no transmit)",
            source_idx, bus, address
        );
        None
    };

    // Pre-submit read requests
    for _ in 0..4 {
        bulk_in.submit(bulk_in.allocate(64));
    }

    // Read loop - now only handles reading, transmit is handled by separate task
    while !stop_flag.load(Ordering::SeqCst) {
        let read_result = tokio::time::timeout(
            Duration::from_millis(50),
            bulk_in.next_complete(),
        )
        .await;

        match read_result {
            Ok(completion) => {
                match completion.status {
                    Ok(()) => {
                        let len = completion.actual_len;
                        let data = &completion.buffer[..len];
                        if len >= 20 {
                            // Parse gs_usb host frame (20 bytes for classic CAN)
                            if let Some(mut frame) = nusb_driver::parse_host_frame(data) {
                                if apply_bus_mapping(&mut frame, &bus_mappings) {
                                    let _ = tx
                                        .send(SourceMessage::Frames(source_idx, vec![frame]))
                                        .await;
                                }
                            }
                        }
                        // Resubmit for continuous reading
                        bulk_in.submit(bulk_in.allocate(64));
                    }
                    Err(_) => {
                        // Transfer error - continue
                    }
                }
            }
            Err(_) => {
                // Timeout - continue
            }
        }
    }

    // Abort the transmit task when the read loop exits
    if let Some(task) = transmit_task {
        task.abort();
    }

    // Cleanup - stop the device
    let _ = nusb_driver::stop_device(&interface, &config).await;

    let _ = tx
        .send(SourceMessage::Ended(source_idx, "stopped".to_string()))
        .await;
}

/// Run SocketCAN source and send frames to merge task (Linux only)
#[cfg(target_os = "linux")]
async fn run_socketcan_source(
    _app: AppHandle,
    source_idx: usize,
    interface: String,
    bus_mappings: Vec<BusMapping>,
    stop_flag: Arc<AtomicBool>,
    tx: mpsc::Sender<SourceMessage>,
) {
    use super::socketcan::SocketCanReader;

    let reader = match SocketCanReader::new(&interface) {
        Ok(r) => r,
        Err(e) => {
            let _ = tx
                .send(SourceMessage::Error(
                    source_idx,
                    format!("Failed to open SocketCAN interface: {}", e),
                ))
                .await;
            return;
        }
    };

    // Create transmit channel and send it to the merge task
    let (transmit_tx, transmit_rx) = std_mpsc::sync_channel::<TransmitRequest>(32);
    let _ = tx.send(SourceMessage::TransmitReady(source_idx, transmit_tx)).await;

    eprintln!(
        "[MultiSourceReader] Source {} SocketCAN connected to {}, transmit channel ready",
        source_idx, interface
    );

    // Wrap reader in Arc for shared access between read and transmit
    let reader = Arc::new(reader);
    let reader_for_task = reader.clone();

    let tx_clone = tx.clone();
    let stop_flag_clone = stop_flag.clone();

    // Spawn blocking task for socket reading and transmit handling
    let blocking_handle = tokio::task::spawn_blocking(move || {
        while !stop_flag_clone.load(Ordering::SeqCst) {
            // Check for transmit requests (non-blocking)
            while let Ok(req) = transmit_rx.try_recv() {
                let result = reader_for_task.write_frame(&req.data)
                    .map_err(|e| format!("SocketCAN write error: {}", e));
                let _ = req.result_tx.send(result);
            }

            // Read frames
            match reader_for_task.read_frame_timeout(std::time::Duration::from_millis(100)) {
                Ok(Some(mut frame)) => {
                    if apply_bus_mapping(&mut frame, &bus_mappings) {
                        let _ = tx_clone.blocking_send(SourceMessage::Frames(
                            source_idx,
                            vec![frame],
                        ));
                    }
                }
                Ok(None) => {
                    // Timeout - continue
                }
                Err(e) => {
                    let _ = tx_clone.blocking_send(SourceMessage::Error(
                        source_idx,
                        format!("Read error: {}", e),
                    ));
                    break;
                }
            }
        }

        let _ = tx_clone.blocking_send(SourceMessage::Ended(source_idx, "stopped".to_string()));
    });

    let _ = blocking_handle.await;
}
