// ui/src/components/TimeController.tsx

import { useState, useEffect, useCallback } from "react";
import { Play, Pause, Square, Clock, Zap } from "lucide-react";
import TimeDisplay from "./TimeDisplay";
import type { IOCapabilities } from '../api/io';
import {
  playButtonBase,
  playButtonCompact,
  pauseButtonBase,
  pauseButtonCompact,
  stopButtonBase,
  stopButtonCompact,
} from "../styles";

export type PlaybackSpeed = 0.25 | 0.5 | 1 | 2 | 10 | 30 | 60;
export type PlaybackState = "stopped" | "playing" | "paused";

export interface TimeControllerProps {
  /** Current playback state */
  state: PlaybackState;

  /** Current playback time (ISO-8601 string or epoch seconds) */
  currentTime?: string | number;

  /** Playback speed multiplier */
  speed: PlaybackSpeed;

  /** Start time for replay (ISO-8601 string) */
  startTime?: string;

  /** End time for replay (ISO-8601 string) */
  endTime?: string;

  /** Callback when play is clicked */
  onPlay?: () => void;

  /** Callback when pause is clicked */
  onPause?: () => void;

  /** Callback when stop is clicked */
  onStop?: () => void;

  /** Callback when speed changes */
  onSpeedChange?: (speed: PlaybackSpeed) => void;

  /** Callback when start time changes */
  onStartTimeChange?: (time: string) => void;

  /** Callback when end time changes */
  onEndTimeChange?: (time: string) => void;

  /** Whether controls are disabled */
  disabled?: boolean;

  /** Show time range inputs (for PostgreSQL replay) */
  showTimeRange?: boolean;

  /** Compact mode (smaller UI) */
  compact?: boolean;

  /** IO capabilities - used to conditionally show controls */
  capabilities?: IOCapabilities | null;
}

import { SPEED_OPTIONS } from "../dialogs/io-reader-picker/utils";

export default function TimeController({
  state,
  currentTime,
  speed,
  startTime,
  endTime,
  onPlay,
  onPause,
  onStop,
  onSpeedChange,
  onStartTimeChange,
  onEndTimeChange,
  disabled = false,
  showTimeRange = false,
  compact = false,
  capabilities,
}: TimeControllerProps) {
  const [localStartTime, setLocalStartTime] = useState(startTime || "");
  const [localEndTime, setLocalEndTime] = useState(endTime || "");

  // Determine what to show based on capabilities
  const showPauseButton = capabilities?.can_pause ?? true;
  const showSpeedControl = capabilities?.supports_speed_control ?? true;
  const showTimeRangeInputs =
    showTimeRange || (capabilities?.supports_time_range ?? false);

  // Sync local time inputs with props
  useEffect(() => {
    setLocalStartTime(startTime || "");
  }, [startTime]);

  useEffect(() => {
    setLocalEndTime(endTime || "");
  }, [endTime]);

  const handleStartTimeBlur = useCallback(() => {
    if (onStartTimeChange && localStartTime !== startTime) {
      onStartTimeChange(localStartTime);
    }
  }, [localStartTime, startTime, onStartTimeChange]);

  const handleEndTimeBlur = useCallback(() => {
    if (onEndTimeChange && localEndTime !== endTime) {
      onEndTimeChange(localEndTime);
    }
  }, [localEndTime, endTime, onEndTimeChange]);

  const isPlaying = state === "playing";
  const isPaused = state === "paused";
  const isStopped = state === "stopped";

  return (
    <div className={`flex items-center gap-3 ${compact ? "text-sm" : ""}`}>
      {/* Playback controls */}
      <div className="flex items-center gap-2 border-r border-slate-300 dark:border-slate-600 pr-3">
        {isStopped ? (
          <button
            onClick={onPlay}
            disabled={disabled}
            className={compact ? playButtonCompact : playButtonBase}
            title="Start playback"
          >
            <Play className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
            {!compact && "Play"}
          </button>
        ) : isPaused ? (
          <button
            onClick={onPlay}
            disabled={disabled}
            className={compact ? playButtonCompact : playButtonBase}
            title="Resume playback"
          >
            <Play className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
            {!compact && "Resume"}
          </button>
        ) : showPauseButton ? (
          <button
            onClick={onPause}
            disabled={disabled}
            className={compact ? pauseButtonCompact : pauseButtonBase}
            title="Pause playback"
          >
            <Pause className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
            {!compact && "Pause"}
          </button>
        ) : (
          // For realtime sources that can't pause, show disabled play button
          <button
            disabled
            className={`flex items-center gap-2 rounded-lg transition-colors bg-green-600/50 text-white/70 cursor-not-allowed ${
              compact ? "px-2 py-1" : "px-3 py-1.5"
            }`}
            title="Streaming..."
          >
            <Play className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
            {!compact && "Live"}
          </button>
        )}

        <button
          onClick={onStop}
          disabled={disabled || isStopped}
          className={compact ? stopButtonCompact : stopButtonBase}
          title="Stop playback"
        >
          <Square className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
          {!compact && "Stop"}
        </button>
      </div>

      {/* Current time display */}
      <div className="flex items-center gap-2">
        <Clock
          className={`${compact ? "w-4 h-4" : "w-5 h-5"} text-slate-600 dark:text-slate-400 ${
            isPlaying ? "animate-pulse" : ""
          }`}
        />
        <TimeDisplay
          timestamp={currentTime ?? null}
          showDate={true}
          showTime={true}
          compact={compact}
          allowOverride={true}
        />
      </div>

      {/* Speed control - only show if supported */}
      {showSpeedControl && (
        <div className="flex items-center gap-2 border-l border-slate-300 dark:border-slate-600 pl-3">
          <Zap
            className={`${compact ? "w-4 h-4" : "w-5 h-5"} text-orange-600 dark:text-orange-400`}
          />
          <select
            value={speed}
            onChange={(e) =>
              onSpeedChange?.(Number(e.target.value) as PlaybackSpeed)
            }
            disabled={disabled}
            className={`${
              compact ? "px-2 py-0.5 text-xs" : "px-3 py-1"
            } rounded border bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {SPEED_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Time range inputs - only show if supported */}
      {showTimeRangeInputs && (
        <div className="flex items-center gap-2 border-l border-slate-300 dark:border-slate-600 pl-3">
          <label className="text-xs text-slate-600 dark:text-slate-400">
            From:
          </label>
          <input
            type="datetime-local"
            value={localStartTime}
            onChange={(e) => setLocalStartTime(e.target.value)}
            onBlur={handleStartTimeBlur}
            disabled={disabled || !isStopped}
            className={`${
              compact ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
            } rounded border bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed font-mono`}
          />
          <label className="text-xs text-slate-600 dark:text-slate-400">
            To:
          </label>
          <input
            type="datetime-local"
            value={localEndTime}
            onChange={(e) => setLocalEndTime(e.target.value)}
            onBlur={handleEndTimeBlur}
            disabled={disabled || !isStopped}
            className={`${
              compact ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
            } rounded border bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed font-mono`}
          />
        </div>
      )}
    </div>
  );
}
