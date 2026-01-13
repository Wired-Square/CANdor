// ui/src-tauri/src/io/buffer_reader.rs
//
// Buffer Reader - streams CAN data from the shared in-memory buffer.
// Used for replaying imported CSV files across all apps.

use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering},
    Arc,
};
use std::time::Duration;
use tauri::AppHandle;

use super::{emit_frames, emit_to_session, IODevice, FrameMessage, IOCapabilities, IOState};
use crate::buffer_store;

/// Helper function to read f64 from atomic U64
fn read_speed(speed: &Arc<AtomicU64>) -> f64 {
    f64::from_bits(speed.load(Ordering::Relaxed))
}

/// Sentinel value meaning "no seek requested"
const NO_SEEK: i64 = i64::MIN;

/// Buffer Reader - streams frames from the shared memory buffer
pub struct BufferReader {
    app: AppHandle,
    session_id: String,
    state: IOState,
    cancel_flag: Arc<AtomicBool>,
    pause_flag: Arc<AtomicBool>,
    pacing_enabled: Arc<AtomicBool>,
    speed: Arc<AtomicU64>,
    /// Seek target in microseconds. Set to NO_SEEK when no seek is pending.
    seek_target_us: Arc<AtomicI64>,
    /// Set to true when the stream completes naturally (not cancelled)
    completed_flag: Arc<AtomicBool>,
    task_handle: Option<tauri::async_runtime::JoinHandle<()>>,
}

impl BufferReader {
    pub fn new(app: AppHandle, session_id: String, speed: f64) -> Self {
        let pacing_enabled = speed > 0.0;
        Self {
            app,
            session_id,
            state: IOState::Stopped,
            cancel_flag: Arc::new(AtomicBool::new(false)),
            pause_flag: Arc::new(AtomicBool::new(false)),
            pacing_enabled: Arc::new(AtomicBool::new(pacing_enabled)),
            speed: Arc::new(AtomicU64::new(if pacing_enabled {
                speed.to_bits()
            } else {
                1.0_f64.to_bits()
            })),
            seek_target_us: Arc::new(AtomicI64::new(NO_SEEK)),
            completed_flag: Arc::new(AtomicBool::new(false)),
            task_handle: None,
        }
    }
}

#[async_trait]
impl IODevice for BufferReader {
    fn capabilities(&self) -> IOCapabilities {
        IOCapabilities {
            can_pause: true,
            supports_time_range: false,
            is_realtime: false,
            supports_speed_control: true,
            supports_seek: true,
            can_transmit: false, // Buffer is a replay source
            can_transmit_serial: false,
            supports_canfd: false, // Buffer replays what was captured
            supports_extended_id: true, // Buffer can contain extended IDs
            supports_rtr: false,
            available_buses: vec![], // Single bus (depends on source)
        }
    }

    async fn start(&mut self) -> Result<(), String> {
        // If the stream completed naturally, reset state so we can restart
        if self.completed_flag.load(Ordering::Relaxed) {
            self.state = IOState::Stopped;
            self.completed_flag.store(false, Ordering::Relaxed);
        }

        if self.state == IOState::Running || self.state == IOState::Paused {
            return Err("Reader is already running".to_string());
        }

        // Check if buffer has data
        if !buffer_store::has_data() {
            return Err("No data in buffer. Please import a CSV file first.".to_string());
        }

        self.state = IOState::Starting;
        self.cancel_flag.store(false, Ordering::Relaxed);
        self.pause_flag.store(false, Ordering::Relaxed);

        let app = self.app.clone();
        let session_id = self.session_id.clone();
        let cancel_flag = self.cancel_flag.clone();
        let pause_flag = self.pause_flag.clone();
        let pacing_enabled = self.pacing_enabled.clone();
        let speed = self.speed.clone();
        let seek_target_us = self.seek_target_us.clone();
        let completed_flag = self.completed_flag.clone();

        let handle = spawn_buffer_stream(
            app,
            session_id,
            cancel_flag,
            pause_flag,
            pacing_enabled,
            speed,
            seek_target_us,
            completed_flag,
        );
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

    fn set_speed(&mut self, speed: f64) -> Result<(), String> {
        if speed < 0.0 {
            return Err("Speed cannot be negative".to_string());
        }
        if speed == 0.0 {
            eprintln!(
                "[Buffer:{}] set_speed: disabling pacing (speed=0)",
                self.session_id
            );
            self.pacing_enabled.store(false, Ordering::Relaxed);
        } else {
            eprintln!(
                "[Buffer:{}] set_speed: enabling pacing at {}x",
                self.session_id, speed
            );
            self.pacing_enabled.store(true, Ordering::Relaxed);
            self.speed.store(speed.to_bits(), Ordering::Relaxed);
        }
        Ok(())
    }

    fn set_time_range(
        &mut self,
        _start: Option<String>,
        _end: Option<String>,
    ) -> Result<(), String> {
        Err("Buffer reader does not support time range filtering".to_string())
    }

    fn seek(&mut self, timestamp_us: i64) -> Result<(), String> {
        eprintln!(
            "[Buffer:{}] Seek requested to {}us",
            self.session_id, timestamp_us
        );
        self.seek_target_us.store(timestamp_us, Ordering::Relaxed);
        Ok(())
    }

    fn state(&self) -> IOState {
        self.state.clone()
    }

    fn session_id(&self) -> &str {
        &self.session_id
    }
}

/// Build a snapshot of the most recent frame for each unique frame ID
/// up to and including the given index. This is used when seeking while paused
/// to show the decoder what the state would be at that point in time.
///
/// The algorithm walks backwards from the seek position, collecting frames until
/// we've seen all unique frame IDs that appear in the buffer, or we've walked
/// back far enough (limited by a time window to avoid excessive work).
fn build_snapshot(frames: &[FrameMessage], up_to_index: usize) -> Vec<FrameMessage> {
    if frames.is_empty() || up_to_index >= frames.len() {
        return Vec::new();
    }

    // First, find all unique frame IDs in the entire buffer
    let mut all_frame_ids: std::collections::HashSet<u32> = std::collections::HashSet::new();
    for f in frames.iter() {
        all_frame_ids.insert(f.frame_id);
    }

    // Now walk backwards from up_to_index, collecting the most recent instance of each frame ID
    let mut snapshot: HashMap<u32, FrameMessage> = HashMap::new();
    let target_time_us = frames[up_to_index].timestamp_us;

    // Walk backwards until we've found all frame IDs or hit the beginning
    // Limit how far back we look to avoid pathological cases
    let max_lookback_us: u64 = 120_000_000; // 2 minutes max lookback

    for i in (0..=up_to_index).rev() {
        let frame = &frames[i];

        // Stop if we've gone back too far in time
        if target_time_us > frame.timestamp_us
            && target_time_us - frame.timestamp_us > max_lookback_us
        {
            break;
        }

        // Only keep the first (most recent) occurrence of each frame ID
        snapshot.entry(frame.frame_id).or_insert_with(|| frame.clone());

        // Early exit if we've found all frame IDs
        if snapshot.len() == all_frame_ids.len() {
            break;
        }
    }

    // Convert to Vec, sorted by frame_id for consistent ordering
    let mut result: Vec<FrameMessage> = snapshot.into_values().collect();
    result.sort_by_key(|f| f.frame_id);
    result
}

/// Spawn a buffer reader task
fn spawn_buffer_stream(
    app_handle: AppHandle,
    session_id: String,
    cancel_flag: Arc<AtomicBool>,
    pause_flag: Arc<AtomicBool>,
    pacing_enabled: Arc<AtomicBool>,
    speed: Arc<AtomicU64>,
    seek_target_us: Arc<AtomicI64>,
    completed_flag: Arc<AtomicBool>,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        run_buffer_stream(
            app_handle,
            session_id,
            cancel_flag,
            pause_flag,
            pacing_enabled,
            speed,
            seek_target_us,
            completed_flag,
        )
        .await;
    })
}

async fn run_buffer_stream(
    app_handle: AppHandle,
    session_id: String,
    cancel_flag: Arc<AtomicBool>,
    pause_flag: Arc<AtomicBool>,
    pacing_enabled: Arc<AtomicBool>,
    speed: Arc<AtomicU64>,
    seek_target_us: Arc<AtomicI64>,
    completed_flag: Arc<AtomicBool>,
) {
    // Get frames from the shared buffer
    let frames = buffer_store::get_frames();
    if frames.is_empty() {
        emit_to_session(
            &app_handle,
            "can-bytes-error",
            &session_id,
            "Buffer is empty".to_string(),
        );
        return;
    }

    let metadata = buffer_store::get_metadata();
    let initial_speed = read_speed(&speed);
    let initial_pacing = pacing_enabled.load(Ordering::Relaxed);
    eprintln!(
        "[Buffer:{}] Starting stream (frames: {}, speed: {}x, pacing: {}, source: '{}')",
        session_id,
        frames.len(),
        initial_speed,
        initial_pacing,
        metadata.as_ref().map(|m| m.name.as_str()).unwrap_or("unknown")
    );

    // Streaming constants
    const HIGH_SPEED_BATCH_SIZE: usize = 50;
    const MIN_DELAY_MS: f64 = 1.0;
    const PACING_INTERVAL_MS: u64 = 50;
    const NO_LIMIT_BATCH_SIZE: usize = 1000;
    const NO_LIMIT_YIELD_MS: u64 = 10;

    let mut total_emitted = 0i64;
    let mut frame_index = 0usize;
    let mut total_wait_ms = 0u64;
    let mut wait_count = 0u64;

    // Get stream start time from first frame
    let stream_start_secs = frames
        .first()
        .map(|f| f.timestamp_us as f64 / 1_000_000.0)
        .unwrap_or(0.0);

    let mut last_frame_time_secs: Option<f64> = None;
    let mut batch_buffer: Vec<FrameMessage> = Vec::new();

    // Track wall-clock time vs playback time for proper pacing
    let mut wall_clock_baseline = std::time::Instant::now();
    let mut playback_baseline_secs = stream_start_secs;
    let mut last_speed = read_speed(&speed);
    let mut last_pacing_check = std::time::Instant::now();

    eprintln!(
        "[Buffer:{}] Starting frame-by-frame loop (stream_start: {:.3}s)",
        session_id, stream_start_secs
    );

    while frame_index < frames.len() {
        // Check if cancelled
        if cancel_flag.load(Ordering::Relaxed) {
            eprintln!(
                "[Buffer:{}] Stream cancelled, stopping immediately ({} remaining frames)",
                session_id,
                frames.len() - frame_index
            );
            break;
        }

        // Check for seek request BEFORE pause check so seek works while paused
        let seek_target = seek_target_us.load(Ordering::Relaxed);
        if seek_target != NO_SEEK {
            // Clear the seek request
            seek_target_us.store(NO_SEEK, Ordering::Relaxed);

            // Binary search to find the frame closest to the target timestamp
            let target_idx = frames
                .binary_search_by(|f| (f.timestamp_us as i64).cmp(&seek_target))
                .unwrap_or_else(|i| i.min(frames.len().saturating_sub(1)));

            let is_paused = pause_flag.load(Ordering::Relaxed);
            eprintln!(
                "[Buffer:{}] Seeking to frame {} (timestamp {}us, paused={})",
                session_id, target_idx, seek_target, is_paused
            );

            frame_index = target_idx;

            // Flush any pending batch
            if !batch_buffer.is_empty() {
                emit_to_session(
                    &app_handle,
                    "frame-message",
                    &session_id,
                    batch_buffer.clone(),
                );
                batch_buffer.clear();
            }

            // Reset timing baselines after seek
            if let Some(f) = frames.get(target_idx) {
                let seek_time_secs = f.timestamp_us as f64 / 1_000_000.0;
                playback_baseline_secs = seek_time_secs;
                wall_clock_baseline = std::time::Instant::now();
                last_frame_time_secs = None;

                // Emit the new playback position
                emit_to_session(&app_handle, "playback-time", &session_id, f.timestamp_us as i64);

                // When paused, emit a snapshot of the most recent frame for each frame ID
                // up to and including the seek position. This allows the decoder to show
                // the state at this point in time.
                if is_paused {
                    let snapshot = build_snapshot(&frames, target_idx);
                    if !snapshot.is_empty() {
                        eprintln!(
                            "[Buffer:{}] Emitting snapshot of {} unique frames at seek position",
                            session_id,
                            snapshot.len()
                        );
                        emit_frames(&app_handle, &session_id, snapshot);
                    }
                }
            }

            continue;
        }

        // Check if paused (after seek check so seek works while paused)
        if pause_flag.load(Ordering::Relaxed) {
            tokio::time::sleep(Duration::from_millis(50)).await;
            continue;
        }

        let frame = frames[frame_index].clone();
        frame_index += 1;

        let is_pacing = pacing_enabled.load(Ordering::Relaxed);
        let current_speed = read_speed(&speed);

        // Check for speed change and reset timing baseline
        if is_pacing && (current_speed - last_speed).abs() > 0.001 {
            if let Some(last_time) = last_frame_time_secs {
                playback_baseline_secs = last_time;
                wall_clock_baseline = std::time::Instant::now();
            }
            last_speed = current_speed;
        }

        // Proactive pacing check
        if is_pacing {
            if let Some(last_time) = last_frame_time_secs {
                let playback_elapsed_secs = last_time - playback_baseline_secs;
                let expected_wall_time_ms = (playback_elapsed_secs * 1000.0 / current_speed) as u64;
                let actual_wall_time_ms = wall_clock_baseline.elapsed().as_millis() as u64;

                if expected_wall_time_ms > actual_wall_time_ms + 100 {
                    let wait_ms = expected_wall_time_ms - actual_wall_time_ms;
                    let capped_wait = wait_ms.min(500);
                    total_wait_ms += capped_wait;
                    wait_count += 1;
                    tokio::time::sleep(Duration::from_millis(capped_wait)).await;
                }
            }
        }

        let frame_time_secs = frame.timestamp_us as f64 / 1_000_000.0;
        let playback_time_us = (frame_time_secs * 1_000_000.0) as i64;

        // When pacing is disabled, use maximum batch size
        if !is_pacing {
            batch_buffer.push(frame);
            total_emitted += 1;
            last_frame_time_secs = Some(frame_time_secs);

            if batch_buffer.len() >= NO_LIMIT_BATCH_SIZE {
                emit_to_session(
                    &app_handle,
                    "frame-message",
                    &session_id,
                    batch_buffer.clone(),
                );
                batch_buffer.clear();

                emit_to_session(&app_handle, "playback-time", &session_id, playback_time_us);

                tokio::time::sleep(Duration::from_millis(NO_LIMIT_YIELD_MS)).await;
            }
            continue;
        }

        // Calculate delay based on inter-frame timing (pacing enabled)
        let delay_ms = if let Some(last_time) = last_frame_time_secs {
            let delta_secs = frame_time_secs - last_time;
            (delta_secs * 1000.0 / current_speed).max(0.0)
        } else {
            0.0
        };

        last_frame_time_secs = Some(frame_time_secs);

        if delay_ms < MIN_DELAY_MS {
            // High-speed mode: batch frames
            batch_buffer.push(frame);
            total_emitted += 1;

            let time_since_pacing = last_pacing_check.elapsed().as_millis() as u64;
            let should_emit = batch_buffer.len() >= HIGH_SPEED_BATCH_SIZE
                || time_since_pacing >= PACING_INTERVAL_MS;

            if should_emit && !batch_buffer.is_empty() {
                let playback_elapsed_secs = frame_time_secs - playback_baseline_secs;
                let expected_wall_time_ms = (playback_elapsed_secs * 1000.0 / current_speed) as u64;
                let actual_wall_time_ms = wall_clock_baseline.elapsed().as_millis() as u64;

                if expected_wall_time_ms > actual_wall_time_ms {
                    let wait_ms = expected_wall_time_ms - actual_wall_time_ms;
                    if wait_ms > 0 {
                        let capped_wait = wait_ms.min(1000);
                        total_wait_ms += capped_wait;
                        wait_count += 1;
                        tokio::time::sleep(Duration::from_millis(capped_wait)).await;
                    }
                }

                last_pacing_check = std::time::Instant::now();

                emit_to_session(
                    &app_handle,
                    "frame-message",
                    &session_id,
                    batch_buffer.clone(),
                );
                batch_buffer.clear();

                emit_to_session(&app_handle, "playback-time", &session_id, playback_time_us);

                tokio::task::yield_now().await;
            }
        } else {
            // Normal speed: emit any pending batch first
            if !batch_buffer.is_empty() {
                emit_to_session(
                    &app_handle,
                    "frame-message",
                    &session_id,
                    batch_buffer.clone(),
                );
                batch_buffer.clear();
            }

            // Sleep for inter-frame delay (cap at 10 seconds)
            let capped_delay_ms = delay_ms.min(10000.0);
            if capped_delay_ms >= 1.0 {
                total_wait_ms += capped_delay_ms as u64;
                wait_count += 1;
                tokio::time::sleep(Duration::from_millis(capped_delay_ms as u64)).await;
            }

            // Re-check pause after sleeping
            if pause_flag.load(Ordering::Relaxed) {
                frame_index -= 1; // Re-process this frame after resume
                continue;
            }

            // Emit single frame with active listener filtering
            emit_frames(&app_handle, &session_id, vec![frame]);
            total_emitted += 1;

            emit_to_session(&app_handle, "playback-time", &session_id, playback_time_us);
        }
    }

    // Emit any remaining frames in batch buffer with active listener filtering
    if !batch_buffer.is_empty() {
        emit_frames(&app_handle, &session_id, batch_buffer);
    }

    // Check if we completed naturally (not cancelled)
    let was_cancelled = cancel_flag.load(Ordering::Relaxed);
    let reason = if was_cancelled { "stopped" } else { "complete" };

    if !was_cancelled {
        // Mark as completed so start() knows it can restart
        completed_flag.store(true, Ordering::Relaxed);
        // Emit stream-complete event so frontend knows playback finished
        emit_to_session(&app_handle, "stream-complete", &session_id, true);
    }

    // Calculate stats
    let total_wall_time_ms = wall_clock_baseline.elapsed().as_millis();
    let data_duration_secs = last_frame_time_secs.unwrap_or(stream_start_secs) - stream_start_secs;
    eprintln!(
        "[Buffer:{}] Stream ended (reason: {}, count: {}, wall_time: {}ms, data_duration: {:.1}s, waits: {} totaling {}ms)",
        session_id, reason, total_emitted, total_wall_time_ms, data_duration_secs, wait_count, total_wait_ms
    );
}
