// src/components/PlaybackControls.tsx
//
// Reusable playback controls for timeline readers (Buffer, CSV, PostgreSQL).
// Used by Discovery and Decoder when viewing recorded/buffered data.

import { ChevronLeft, ChevronRight, FastForward, Play, Rewind, SkipBack, SkipForward, Square } from "lucide-react";
import type { PlaybackSpeed } from "./TimeController";

export type PlaybackState = "playing" | "paused";
export type PlaybackDirection = "forward" | "backward";

export interface PlaybackControlsProps {
  /** Current playback state */
  playbackState: PlaybackState;
  /** Whether the session is ready for playback */
  isReady: boolean;
  /** Whether pause is supported */
  canPause?: boolean;
  /** Whether seek is supported (enables skip buttons) */
  supportsSeek?: boolean;
  /** Whether speed control is supported */
  supportsSpeedControl?: boolean;
  /** Whether reverse playback is supported */
  supportsReverse?: boolean;
  /** Current playback direction (only relevant when playing) */
  playbackDirection?: PlaybackDirection;
  /** Current playback speed */
  playbackSpeed?: PlaybackSpeed;
  /** Available speed options */
  speedOptions?: PlaybackSpeed[];
  /** Timeline bounds for seek operations */
  minTimeUs?: number | null;
  maxTimeUs?: number | null;
  currentTimeUs?: number | null;
  /** Current frame index (0-based) for step display */
  currentFrameIndex?: number | null;
  /** Total frame count for step display */
  totalFrames?: number | null;
  /** Callbacks */
  onPlay: () => void;
  onPlayBackward?: () => void;
  onPause: () => void;
  onStepBackward?: () => void;
  onStepForward?: () => void;
  onScrub?: (timeUs: number) => void;
  onSpeedChange?: (speed: PlaybackSpeed) => void;
}

const DEFAULT_SPEED_OPTIONS: PlaybackSpeed[] = [0.25, 0.5, 1, 2, 10, 30, 60];

/**
 * Playback controls for timeline readers.
 * Renders play/pause/stop buttons with optional seek and speed controls.
 */
export function PlaybackControls({
  playbackState,
  isReady,
  canPause = false,
  supportsSeek = false,
  supportsSpeedControl = false,
  supportsReverse = false,
  playbackDirection = "forward",
  playbackSpeed = 1,
  speedOptions = DEFAULT_SPEED_OPTIONS,
  minTimeUs,
  maxTimeUs,
  currentTimeUs,
  currentFrameIndex,
  totalFrames,
  onPlay,
  onPlayBackward,
  onPause,
  onStepBackward,
  onStepForward,
  onScrub,
  onSpeedChange,
}: PlaybackControlsProps) {
  const isPlaying = playbackState === "playing";
  const isPaused = playbackState === "paused";
  const isPlayingForward = isPlaying && playbackDirection === "forward";
  const isPlayingBackward = isPlaying && playbackDirection === "backward";

  // Only show if ready and has some control capability
  const showControls = isReady && (supportsSeek || supportsSpeedControl || canPause || supportsReverse);
  if (!showControls) return null;

  // Whether seek controls should be shown
  const showSeekControls = supportsSeek && onScrub && minTimeUs != null && maxTimeUs != null;

  return (
    <div className="flex items-center gap-1">
      {/* Skip to start */}
      {showSeekControls && (
        <button
          type="button"
          onClick={() => onScrub!(minTimeUs!)}
          className="p-1 rounded text-gray-400 hover:bg-gray-700 hover:text-gray-200"
          title="Skip to start"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Skip back 10 seconds */}
      {showSeekControls && (
        <button
          type="button"
          onClick={() => {
            const newTime = Math.max(minTimeUs!, (currentTimeUs ?? minTimeUs!) - 10_000_000);
            onScrub!(newTime);
          }}
          className="p-1 rounded text-gray-400 hover:bg-gray-700 hover:text-gray-200"
          title="Skip back 10 seconds"
        >
          <Rewind className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Play backward */}
      {supportsReverse && onPlayBackward && (
        <button
          type="button"
          onClick={onPlayBackward}
          disabled={isPlayingBackward}
          className={`p-1 rounded ${
            isPlayingBackward
              ? "bg-blue-600/30 text-blue-400"
              : "text-blue-500 hover:bg-gray-700 hover:text-blue-400"
          }`}
          title="Play backward"
        >
          <Play className="w-3.5 h-3.5 rotate-180" fill="currentColor" />
        </button>
      )}

      {/* Pause (shown as stop button) */}
      <button
        type="button"
        onClick={onPause}
        disabled={isPaused}
        className={`p-1 rounded ${
          isPaused
            ? "bg-red-600/30 text-red-400"
            : "text-red-500 hover:bg-gray-700 hover:text-red-400"
        }`}
        title="Pause"
      >
        <Square className="w-3.5 h-3.5" fill="currentColor" />
      </button>

      {/* Step backward (when paused and not at start) */}
      {onStepBackward && (() => {
        const atStart = currentFrameIndex != null && currentFrameIndex <= 0;
        const canStep = isPaused && !atStart;
        return (
          <button
            type="button"
            onClick={onStepBackward}
            disabled={!canStep}
            className={`p-1 rounded ${
              canStep
                ? "text-gray-300 hover:bg-gray-700 hover:text-white"
                : "text-gray-600 cursor-not-allowed"
            }`}
            title={atStart ? "At start of buffer" : "Step backward one frame"}
          >
            <ChevronLeft className="w-3.5 h-3.5" strokeWidth={3} />
          </button>
        );
      })()}

      {/* Frame index display (when stepping is available and we have frame info) */}
      {(onStepBackward || onStepForward) && currentFrameIndex != null && (
        <span className="px-1.5 text-xs font-mono text-gray-400 tabular-nums">
          {totalFrames != null
            ? `${(currentFrameIndex + 1).toLocaleString()} / ${totalFrames.toLocaleString()}`
            : (currentFrameIndex + 1).toLocaleString()}
        </span>
      )}

      {/* Step forward (when paused and not at end) */}
      {onStepForward && (() => {
        const atEnd = currentFrameIndex != null && totalFrames != null && currentFrameIndex >= totalFrames - 1;
        const canStep = isPaused && !atEnd;
        return (
          <button
            type="button"
            onClick={onStepForward}
            disabled={!canStep}
            className={`p-1 rounded ${
              canStep
                ? "text-gray-300 hover:bg-gray-700 hover:text-white"
                : "text-gray-600 cursor-not-allowed"
            }`}
            title={atEnd ? "At end of buffer" : "Step forward one frame"}
          >
            <ChevronRight className="w-3.5 h-3.5" strokeWidth={3} />
          </button>
        );
      })()}

      {/* Play forward */}
      <button
        type="button"
        onClick={onPlay}
        disabled={isPlayingForward}
        className={`p-1 rounded ${
          isPlayingForward
            ? "bg-green-600/30 text-green-400"
            : "text-green-500 hover:bg-gray-700 hover:text-green-400"
        }`}
        title={isPaused ? "Resume forward" : "Play forward"}
      >
        <Play className="w-3.5 h-3.5" fill="currentColor" />
      </button>

      {/* Skip forward 10 seconds */}
      {showSeekControls && (
        <button
          type="button"
          onClick={() => {
            const newTime = Math.min(maxTimeUs!, (currentTimeUs ?? minTimeUs!) + 10_000_000);
            onScrub!(newTime);
          }}
          className="p-1 rounded text-gray-400 hover:bg-gray-700 hover:text-gray-200"
          title="Skip forward 10 seconds"
        >
          <FastForward className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Skip to end */}
      {showSeekControls && (
        <button
          type="button"
          onClick={() => onScrub!(maxTimeUs!)}
          className="p-1 rounded text-gray-400 hover:bg-gray-700 hover:text-gray-200"
          title="Skip to end"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Speed selector */}
      {supportsSpeedControl && onSpeedChange && (
        <select
          value={playbackSpeed}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value) as PlaybackSpeed)}
          className="ml-1 px-2 py-0.5 text-xs rounded border border-gray-600 bg-gray-700 text-gray-200"
          title="Playback speed"
        >
          {speedOptions.map((s) => (
            <option key={s} value={s}>
              {s === 1 ? "1x (realtime)" : `${s}x`}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export default PlaybackControls;
