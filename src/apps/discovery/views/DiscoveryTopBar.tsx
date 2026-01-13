// ui/src/apps/discovery/views/DiscoveryTopBar.tsx

import { Search, ChevronRight, ListFilter, Star, FileText, Save, Trash2, Info, Wrench, Square, Download, Type, Unplug, Plug, Play } from "lucide-react";
import type { IOProfile } from "../../../types/common";
import type { BufferMetadata } from "../../../api/buffer";
import { BUFFER_PROFILE_ID } from "../../../dialogs/IoReaderPickerDialog";
import FlexSeparator from "../../../components/FlexSeparator";
import { buttonBase, iconButtonBase, dangerButtonBase, warningButtonBase, successButtonBase, successIconButton } from "../../../styles/buttonStyles";

type Props = {
  // IO profile selection
  ioProfiles: IOProfile[];
  ioProfile: string | null;
  onIoProfileChange: (id: string | null) => void;
  defaultReadProfileId?: string | null;
  bufferMetadata?: BufferMetadata | null;
  isStreaming: boolean;

  // Stop control (Watch is initiated via data source dialog)
  onStopWatch?: () => void;
  /** Whether the session is stopped (not streaming) but has a profile selected */
  isStopped?: boolean;
  /** Called when user wants to resume a stopped session */
  onResume?: () => void;
  /** Number of apps connected to this session (for Detach button) */
  joinerCount?: number;
  /** Called when user wants to detach from shared session without stopping */
  onDetach?: () => void;
  /** Whether we've detached from the session but still have profile selected */
  isDetached?: boolean;
  /** Called when user wants to rejoin after detaching */
  onRejoin?: () => void;

  // Frame picker
  frameCount: number;
  selectedFrameCount: number;
  onOpenFramePicker: () => void;

  // Serial mode state
  isSerialMode?: boolean;
  serialBytesCount?: number;
  /** True when framing has been accepted in serial mode */
  framingAccepted?: boolean;
  /** Active tab in serial mode: 'raw', 'framed', or 'analysis' */
  serialActiveTab?: 'raw' | 'framed' | 'analysis';

  // ASCII toggle (for serial mode)
  showAscii?: boolean;
  onToggleAscii?: () => void;

  // Dialogs
  onOpenIoReaderPicker: () => void;

  // Actions
  onSave: () => void;
  onExport: () => void;
  onClear: () => void;
  onInfo: () => void;
  onOpenToolbox: () => void;
};

export default function DiscoveryTopBar({
  ioProfiles,
  ioProfile,
  defaultReadProfileId,
  bufferMetadata,
  isStreaming,
  onStopWatch,
  isStopped = false,
  onResume,
  joinerCount = 1,
  onDetach,
  isDetached = false,
  onRejoin,
  frameCount,
  selectedFrameCount,
  onOpenFramePicker,
  isSerialMode = false,
  serialBytesCount = 0,
  framingAccepted = false,
  serialActiveTab = 'raw',
  showAscii = false,
  onToggleAscii,
  onOpenIoReaderPicker,
  onSave,
  onExport,
  onClear,
  onInfo,
  onOpenToolbox,
}: Props) {
  // All profiles are read profiles now (mode field removed)
  const readProfiles = ioProfiles;

  // Get display names - handle buffer profile specially
  const isBufferProfile = ioProfile === BUFFER_PROFILE_ID;
  const selectedProfile = readProfiles.find((p) => p.id === ioProfile);

  // For buffer profile, use the buffer's display name directly
  // Buffer names are now set descriptively by readers (e.g., "GVRET host:port", "PostgreSQL db")
  const getBufferDisplayName = () => {
    return bufferMetadata?.name || "Buffer";
  };

  const ioReaderName = isBufferProfile
    ? `Buffer: ${getBufferDisplayName()}`
    : (selectedProfile?.name || "No reader");
  const isDefaultReader = !isBufferProfile && selectedProfile?.id === defaultReadProfileId;

  // In serial mode, tools are available with raw bytes even without framed data
  const hasFrames = isSerialMode ? (frameCount > 0 || serialBytesCount > 0) : frameCount > 0;

  return (
    <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Discovery icon */}
        <Search className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0" />

        <FlexSeparator />

        {/* IO Reader Selection - shows star/file icon + name */}
        <button
          onClick={onOpenIoReaderPicker}
          disabled={isStreaming}
          className={buttonBase}
          title="Select IO Reader"
        >
          {isBufferProfile ? (
            <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          ) : isDefaultReader ? (
            <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="currentColor" />
          ) : null}
          <span className="max-w-40 truncate">{ioReaderName}</span>
        </button>

        {/* Stop button - only shown when actively streaming */}
        {isStreaming && (
          <button
            onClick={onStopWatch}
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
            title="Detach IO Stream"
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

        {/* Right arrow icon */}
        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

        {/* Frames Button - icon with count. In serial mode, disabled until framing is accepted */}
        <button
          onClick={onOpenFramePicker}
          disabled={isSerialMode && !framingAccepted}
          className={buttonBase}
          title={isSerialMode && !framingAccepted ? "Accept framing first to select frames" : "Select frames"}
        >
          <ListFilter className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-slate-500 dark:text-slate-400">
            {selectedFrameCount}/{frameCount}
          </span>
        </button>

        {/* Right arrow icon */}
        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

        {/* Toolbox button */}
        <button
          onClick={onOpenToolbox}
          disabled={!hasFrames}
          className={buttonBase}
          title="Analysis tools"
        >
          <Wrench className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Tools</span>
        </button>

        {/* Separator */}
        <FlexSeparator />

        {/* Decoder actions */}
        <button
          onClick={onSave}
          disabled={!hasFrames}
          className={iconButtonBase}
          title={isSerialMode ? "Save bytes to decoder" : "Save frames to decoder"}
        >
          <Save className="w-4 h-4" />
        </button>

        <button
          onClick={onExport}
          disabled={!hasFrames}
          className={iconButtonBase}
          title={isSerialMode && serialActiveTab === 'raw' ? "Export bytes to file" : "Export frames to file"}
        >
          <Download className="w-4 h-4" />
        </button>

        <button
          onClick={onClear}
          disabled={!hasFrames}
          className={`${iconButtonBase} hover:!bg-red-600 hover:!text-white`}
          title={isSerialMode ? "Clear all bytes" : "Clear all frames"}
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <button
          onClick={onInfo}
          disabled={!hasFrames}
          className={`${iconButtonBase} ${hasFrames ? "text-purple-600 dark:text-purple-400" : ""}`}
          title="View decoder knowledge"
        >
          <Info className="w-4 h-4" />
        </button>

        {/* ASCII toggle - only shown in serial mode */}
        {isSerialMode && onToggleAscii && (
          <button
            onClick={onToggleAscii}
            className={`${iconButtonBase} ${
              showAscii
                ? "!bg-yellow-600 !text-white hover:!bg-yellow-500"
                : ""
            }`}
            title={showAscii ? "Hide ASCII column" : "Show ASCII column"}
          >
            <Type className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
