// src/components/SessionControls.tsx
//
// Shared session control components for top bars.
// Handles reader display, stop/resume/detach/rejoin controls.

import { Star, FileText, Square, Unplug, Plug, Play, GitMerge } from "lucide-react";
import type { IOProfile } from "../types/common";
import type { BufferMetadata } from "../api/buffer";
import { BUFFER_PROFILE_ID } from "../dialogs/io-reader-picker/utils";
import {
  buttonBase,
  dangerButtonBase,
  warningButtonBase,
  successButtonBase,
  successIconButton,
} from "../styles/buttonStyles";

// ============================================================================
// Reader Button - displays current reader with appropriate icon
// ============================================================================

export interface ReaderButtonProps {
  /** Current IO profile/session ID */
  ioProfile: string | null;
  /** Available IO profiles */
  ioProfiles: IOProfile[];
  /** Whether multi-bus mode is active */
  multiBusMode?: boolean;
  /** Profile IDs when in multi-bus mode (for display count) */
  multiBusProfiles?: string[];
  /** Buffer metadata (for buffer display name) */
  bufferMetadata?: BufferMetadata | null;
  /** Default read profile ID (for star icon) */
  defaultReadProfileId?: string | null;
  /** Click handler to open reader picker */
  onClick: () => void;
  /** Whether button should be disabled (e.g., while streaming) */
  disabled?: boolean;
}

export function ReaderButton({
  ioProfile,
  ioProfiles,
  multiBusMode = false,
  multiBusProfiles = [],
  bufferMetadata,
  defaultReadProfileId,
  onClick,
  disabled = false,
}: ReaderButtonProps) {
  const isBufferProfile = ioProfile === BUFFER_PROFILE_ID;
  const selectedProfile = ioProfiles.find((p) => p.id === ioProfile);

  // Show as multi-bus if either:
  // 1. multiBusMode is true (creating multi-bus session), OR
  // 2. multiBusProfiles has entries (joined an existing multi-source session)
  const showAsMultiBus = multiBusMode || multiBusProfiles.length > 0;

  // Determine display name
  let displayName: string;
  if (showAsMultiBus) {
    displayName = `Multi-Bus (${multiBusProfiles.length})`;
  } else if (isBufferProfile) {
    displayName = `Buffer: ${bufferMetadata?.name || "Buffer"}`;
  } else {
    displayName = selectedProfile?.name || "No reader";
  }

  const isDefaultReader = !isBufferProfile && !showAsMultiBus && selectedProfile?.id === defaultReadProfileId;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={buttonBase}
      title="Select IO Reader"
    >
      {showAsMultiBus ? (
        <GitMerge className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
      ) : isBufferProfile ? (
        <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
      ) : isDefaultReader ? (
        <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="currentColor" />
      ) : null}
      <span className="max-w-40 truncate">{displayName}</span>
    </button>
  );
}

// ============================================================================
// Session Action Buttons - stop, resume, detach, rejoin
// ============================================================================

export interface SessionActionButtonsProps {
  /** Whether the session is actively streaming */
  isStreaming: boolean;
  /** Whether the session is stopped but can be resumed */
  isStopped?: boolean;
  /** Whether we've detached from the session */
  isDetached?: boolean;
  /** Number of apps connected to this session */
  joinerCount?: number;
  /** Stop the session */
  onStop?: () => void;
  /** Resume a stopped session */
  onResume?: () => void;
  /** Detach from a shared session without stopping */
  onDetach?: () => void;
  /** Rejoin after detaching */
  onRejoin?: () => void;
}

export function SessionActionButtons({
  isStreaming,
  isStopped = false,
  isDetached = false,
  joinerCount = 1,
  onStop,
  onResume,
  onDetach,
  onRejoin,
}: SessionActionButtonsProps) {
  return (
    <>
      {/* Stop button - only shown when actively streaming */}
      {isStreaming && onStop && (
        <button
          onClick={onStop}
          className={dangerButtonBase}
          title="Stop IO Stream"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Resume button - shown when session is stopped but profile is selected */}
      {isStopped && !isDetached && onResume && (
        <button
          onClick={onResume}
          className={successIconButton}
          title="Resume IO Stream"
        >
          <Play className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Detach button - only shown when streaming and multiple apps are connected */}
      {isStreaming && joinerCount > 1 && onDetach && (
        <button
          onClick={onDetach}
          className={warningButtonBase}
          title="Detach from shared session (keeps streaming for other apps)"
        >
          <Unplug className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Rejoin button - shown when detached from a session */}
      {isDetached && onRejoin && (
        <button
          onClick={onRejoin}
          className={successButtonBase}
          title="Rejoin Session"
        >
          <Plug className="w-3.5 h-3.5" />
          <span>Rejoin</span>
        </button>
      )}
    </>
  );
}
