// ui/src-tauri/src/replay.rs
//
// Time-accurate frame replay — plays back a set of captured frames to a target
// session, preserving the original inter-frame timing scaled by a speed multiplier.
//
// Each replay is ephemeral: results appear in transmit history via the existing
// `transmit-history` and `repeat-stopped` events so the frontend needs no new
// event listeners.

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

use crate::io::{self, CanTransmitFrame};
use crate::transmit::RepeatStoppedEvent;

// ============================================================================
// Progress Events
// ============================================================================

/// Emitted once when a replay task starts.
#[derive(Clone, Serialize)]
pub struct ReplayStartedEvent {
    pub replay_id: String,
    pub total_frames: u64,
    pub speed: f64,
    pub loop_replay: bool,
}

/// Emitted periodically (~250 ms) during a replay to report progress.
#[derive(Clone, Serialize)]
pub struct ReplayProgressEvent {
    pub replay_id: String,
    pub frames_sent: u64,
    pub total_frames: u64,
}

// ============================================================================
// Types
// ============================================================================

/// A single frame with its original capture timestamp, used for time-accurate replay.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReplayFrame {
    /// Original capture timestamp (microseconds since UNIX epoch).
    pub timestamp_us: u64,
    /// The CAN frame to transmit.
    pub frame: CanTransmitFrame,
}

/// Active replay task handle.
struct ReplayTask {
    cancel_flag: std::sync::Arc<AtomicBool>,
    #[allow(dead_code)]
    handle: tauri::async_runtime::JoinHandle<()>,
}

/// Map of replay_id -> ReplayTask for active replay operations.
static IO_REPLAY_TASKS: Lazy<tokio::sync::Mutex<HashMap<String, ReplayTask>>> =
    Lazy::new(|| tokio::sync::Mutex::new(HashMap::new()));

// Maximum inter-frame sleep to avoid hanging on large timestamp gaps (5 seconds).
const MAX_SLEEP_US: u64 = 5_000_000;

// ============================================================================
// Tauri Commands
// ============================================================================

/// Start a time-accurate replay of a sequence of frames.
///
/// Frames are transmitted in order with delays derived from their original timestamps
/// divided by `speed`. A speed of 1.0 is realtime; 2.0 is twice as fast.
///
/// History events are emitted as `transmit-history` (one per frame). A `repeat-stopped`
/// event is emitted when the replay finishes or is cancelled.
#[tauri::command]
pub async fn io_start_replay(
    app: AppHandle,
    session_id: String,
    replay_id: String,
    frames: Vec<ReplayFrame>,
    speed: f64,
    loop_replay: bool,
) -> Result<(), String> {
    if frames.is_empty() {
        return Err("No frames to replay".to_string());
    }

    let speed = speed.max(0.001); // Guard against zero/negative speed

    // Stop any existing replay with the same ID
    io_stop_replay(replay_id.clone()).await?;

    let cancel_flag = std::sync::Arc::new(AtomicBool::new(false));
    let cancel_flag_clone = cancel_flag.clone();
    let session_id_clone = session_id.clone();
    let replay_id_for_task = replay_id.clone();

    let handle = tauri::async_runtime::spawn(async move {
        let total_frames = frames.len() as u64;
        let mut frames_sent: u64 = 0;
        let mut frames_failed: u64 = 0;
        let mut cancelled = false;

        // Notify frontend that replay has started
        let _ = app.emit("replay-started", ReplayStartedEvent {
            replay_id: replay_id_for_task.clone(),
            total_frames,
            speed,
            loop_replay,
        });

        let mut last_progress = std::time::Instant::now();
        const PROGRESS_INTERVAL: std::time::Duration = std::time::Duration::from_millis(250);

        'outer: loop {
            for i in 0..frames.len() {
                if cancel_flag_clone.load(Ordering::Relaxed) {
                    cancelled = true;
                    break 'outer;
                }

                let frame = &frames[i].frame;

                // Transmit the frame (no per-frame history event — replay is a bulk
                // operation and emitting one event per frame at high replay rates floods
                // the JS event queue and causes the frontend to freeze).
                let result = io::transmit_frame(&session_id_clone, frame).await;

                // Stop on permanent device errors
                let is_permanent = match &result {
                    Ok(r) => r.error.as_deref().map(crate::transmit::is_permanent_error_pub).unwrap_or(false) && !r.success,
                    Err(e) => crate::transmit::is_permanent_error_pub(e),
                };
                if is_permanent {
                    let err_msg = match &result {
                        Ok(r) => r.error.clone().unwrap_or_else(|| "Device error".to_string()),
                        Err(e) => e.clone(),
                    };
                    tlog!("[replay] Stopping replay '{}' due to permanent error: {}", replay_id_for_task, err_msg);
                    let _ = app.emit("repeat-stopped", RepeatStoppedEvent {
                        queue_id: replay_id_for_task.clone(),
                        reason: err_msg,
                    });
                    return;
                }

                match result {
                    Ok(r) if r.success => frames_sent += 1,
                    _ => frames_failed += 1,
                }

                // Throttled progress update (~250 ms)
                if last_progress.elapsed() >= PROGRESS_INTERVAL {
                    let _ = app.emit("replay-progress", ReplayProgressEvent {
                        replay_id: replay_id_for_task.clone(),
                        frames_sent,
                        total_frames,
                    });
                    last_progress = std::time::Instant::now();
                }

                // Sleep until the next frame's timestamp (scaled by speed)
                if i + 1 < frames.len() {
                    let next_ts = frames[i + 1].timestamp_us;
                    let curr_ts = frames[i].timestamp_us;
                    let delta_us = next_ts.saturating_sub(curr_ts);
                    let sleep_us = ((delta_us as f64) / speed).round() as u64;
                    let capped_us = sleep_us.min(MAX_SLEEP_US);
                    if capped_us > 0 {
                        tokio::time::sleep(tokio::time::Duration::from_micros(capped_us)).await;
                    }
                }
            }

            if !loop_replay {
                break;
            }
        }

        tlog!("[replay] '{}' complete: {} sent, {} failed", replay_id_for_task, frames_sent, frames_failed);

        // Notify frontend that replay has finished or was cancelled
        let reason = if cancelled {
            format!("Replay stopped ({} frames)", frames_sent)
        } else {
            format!("Replay complete ({} frames)", frames_sent)
        };
        let _ = app.emit("repeat-stopped", RepeatStoppedEvent {
            queue_id: replay_id_for_task.clone(),
            reason,
        });

        // Remove from active tasks map
        let mut tasks = IO_REPLAY_TASKS.lock().await;
        tasks.remove(&replay_id_for_task);
    });

    let mut tasks = IO_REPLAY_TASKS.lock().await;
    tasks.insert(replay_id.clone(), ReplayTask { cancel_flag, handle });

    Ok(())
}

/// Stop an active replay by ID.
#[tauri::command]
pub async fn io_stop_replay(replay_id: String) -> Result<(), String> {
    let mut tasks = IO_REPLAY_TASKS.lock().await;
    if let Some(task) = tasks.remove(&replay_id) {
        task.cancel_flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

/// Stop all active replays.
#[tauri::command]
pub async fn io_stop_all_replays() -> Result<(), String> {
    let mut tasks = IO_REPLAY_TASKS.lock().await;
    for (_, task) in tasks.drain() {
        task.cancel_flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}
