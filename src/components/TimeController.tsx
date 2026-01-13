// ui/src/components/TimeController.tsx

import { useState, useEffect, useCallback } from "react";
import { Play, Pause, Square, Clock, Zap } from "lucide-react";
import type { IOCapabilities } from '../api/io';
import {
  playButtonBase,
  playButtonCompact,
  pauseButtonBase,
  pauseButtonCompact,
  stopButtonBase,
  stopButtonCompact,
} from "../styles";

export type PlaybackSpeed = 0 | 0.25 | 0.5 | 1 | 2 | 10 | 30 | 60;
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

const SPEED_OPTIONS: { value: PlaybackSpeed; label: string }[] = [
  { value: 0, label: "No Limit" },
  { value: 60, label: "60x" },
  { value: 30, label: "30x" },
  { value: 10, label: "10x" },
  { value: 2, label: "2x" },
  { value: 1, label: "1x" },
  { value: 0.5, label: "0.5x" },
  { value: 0.25, label: "0.25x" },
];

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
  const [displayTime, setDisplayTime] = useState<string>("");
  const [displayDate, setDisplayDate] = useState<string>("");

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

  // Format current time for display
  useEffect(() => {
    if (!currentTime) {
      setDisplayTime("--:--:--");
      setDisplayDate("");
      return;
    }

    const updateDisplay = () => {
      let date: Date;
      if (typeof currentTime === "string") {
        try {
          date = new Date(currentTime);
        } catch {
          setDisplayTime(currentTime);
          setDisplayDate("");
          return;
        }
      } else {
        // Epoch seconds
        date = new Date(currentTime * 1000);
      }

      setDisplayTime(date.toLocaleTimeString());
      setDisplayDate(
        date.toLocaleDateString(undefined, {
          weekday: "short",
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      );
    };

    updateDisplay();

    const intervalId = setInterval(updateDisplay, 1000);
    return () => clearInterval(intervalId);
  }, [currentTime]);

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
        <div className="flex flex-col">
          <span className="font-mono text-slate-900 dark:text-slate-100 min-w-[80px] leading-tight">
            {displayTime}
          </span>
          {displayDate && (
            <span
              className={`font-mono text-slate-500 dark:text-slate-400 leading-tight ${compact ? "text-[10px]" : "text-xs"}`}
            >
              {displayDate}
            </span>
          )}
        </div>
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
