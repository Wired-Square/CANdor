// ui/src-tauri/src/io/timeline_base.rs
//
// Shared control state for timeline readers (Buffer, CSV, PostgreSQL).
// These readers share identical pause/resume and speed control patterns.

use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc,
};

/// Shared control state for timeline playback.
/// Used by BufferReader, CsvReader, and PostgresReader.
#[derive(Clone)]
pub struct TimelineControl {
    /// Set to true to cancel the stream
    pub cancel_flag: Arc<AtomicBool>,
    /// Set to true to pause playback
    pub pause_flag: Arc<AtomicBool>,
    /// Whether pacing is enabled (speed > 0)
    pub pacing_enabled: Arc<AtomicBool>,
    /// Playback speed as f64 bits (use read_speed/write_speed)
    pub speed: Arc<AtomicU64>,
}

impl TimelineControl {
    /// Create new timeline control with the given initial speed.
    /// Speed of 0 means no pacing (unlimited speed).
    /// Speed > 0 enables pacing at that multiplier (1.0 = realtime).
    pub fn new(initial_speed: f64) -> Self {
        let pacing_enabled = initial_speed > 0.0;
        Self {
            cancel_flag: Arc::new(AtomicBool::new(false)),
            pause_flag: Arc::new(AtomicBool::new(false)),
            pacing_enabled: Arc::new(AtomicBool::new(pacing_enabled)),
            speed: Arc::new(AtomicU64::new(if pacing_enabled {
                initial_speed.to_bits()
            } else {
                1.0_f64.to_bits()
            })),
        }
    }

    /// Reset control flags for a new stream
    pub fn reset(&self) {
        self.cancel_flag.store(false, Ordering::Relaxed);
        self.pause_flag.store(false, Ordering::Relaxed);
    }

    /// Signal cancellation
    pub fn cancel(&self) {
        self.cancel_flag.store(true, Ordering::Relaxed);
    }

    /// Check if cancelled
    pub fn is_cancelled(&self) -> bool {
        self.cancel_flag.load(Ordering::Relaxed)
    }

    /// Pause playback
    pub fn pause(&self) {
        self.pause_flag.store(true, Ordering::Relaxed);
    }

    /// Resume playback
    pub fn resume(&self) {
        self.pause_flag.store(false, Ordering::Relaxed);
    }

    /// Check if paused
    pub fn is_paused(&self) -> bool {
        self.pause_flag.load(Ordering::Relaxed)
    }

    /// Read the current playback speed
    pub fn read_speed(&self) -> f64 {
        f64::from_bits(self.speed.load(Ordering::Relaxed))
    }

    /// Check if pacing is enabled
    pub fn is_pacing_enabled(&self) -> bool {
        self.pacing_enabled.load(Ordering::Relaxed)
    }

    /// Set playback speed. Returns error if speed is negative.
    /// Speed of 0 disables pacing (unlimited speed).
    /// Speed > 0 enables pacing at that multiplier.
    pub fn set_speed(&self, speed: f64) -> Result<(), String> {
        if speed < 0.0 {
            return Err("Speed cannot be negative".to_string());
        }
        if speed == 0.0 {
            self.pacing_enabled.store(false, Ordering::Relaxed);
        } else {
            self.pacing_enabled.store(true, Ordering::Relaxed);
            self.speed.store(speed.to_bits(), Ordering::Relaxed);
        }
        Ok(())
    }
}

impl Default for TimelineControl {
    fn default() -> Self {
        Self::new(0.0) // No pacing by default
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initial_speed_zero_disables_pacing() {
        let ctrl = TimelineControl::new(0.0);
        assert!(!ctrl.is_pacing_enabled());
        assert!((ctrl.read_speed() - 1.0).abs() < 0.001); // Stores 1.0 when disabled
    }

    #[test]
    fn test_initial_speed_nonzero_enables_pacing() {
        let ctrl = TimelineControl::new(2.0);
        assert!(ctrl.is_pacing_enabled());
        assert!((ctrl.read_speed() - 2.0).abs() < 0.001);
    }

    #[test]
    fn test_set_speed_zero_disables_pacing() {
        let ctrl = TimelineControl::new(1.0);
        assert!(ctrl.is_pacing_enabled());

        ctrl.set_speed(0.0).unwrap();
        assert!(!ctrl.is_pacing_enabled());
    }

    #[test]
    fn test_set_speed_nonzero_enables_pacing() {
        let ctrl = TimelineControl::new(0.0);
        assert!(!ctrl.is_pacing_enabled());

        ctrl.set_speed(1.5).unwrap();
        assert!(ctrl.is_pacing_enabled());
        assert!((ctrl.read_speed() - 1.5).abs() < 0.001);
    }

    #[test]
    fn test_set_speed_negative_fails() {
        let ctrl = TimelineControl::new(1.0);
        assert!(ctrl.set_speed(-1.0).is_err());
    }

    #[test]
    fn test_pause_resume() {
        let ctrl = TimelineControl::new(1.0);
        assert!(!ctrl.is_paused());

        ctrl.pause();
        assert!(ctrl.is_paused());

        ctrl.resume();
        assert!(!ctrl.is_paused());
    }

    #[test]
    fn test_cancel() {
        let ctrl = TimelineControl::new(1.0);
        assert!(!ctrl.is_cancelled());

        ctrl.cancel();
        assert!(ctrl.is_cancelled());
    }

    #[test]
    fn test_reset() {
        let ctrl = TimelineControl::new(1.0);
        ctrl.cancel();
        ctrl.pause();
        assert!(ctrl.is_cancelled());
        assert!(ctrl.is_paused());

        ctrl.reset();
        assert!(!ctrl.is_cancelled());
        assert!(!ctrl.is_paused());
    }
}
