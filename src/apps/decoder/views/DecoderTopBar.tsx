// ui/src/apps/decoder/views/DecoderTopBar.tsx

import { Activity, ChevronRight, ListFilter, Star, FileText, Square, Glasses, Unplug, Plug, Trash2, Users, User, Filter, Eye, EyeOff, Play, Type } from "lucide-react";
import type { CatalogMetadata } from "../../../api/catalog";
import type { IOProfile } from "../../../types/common";
import type { PlaybackSpeed } from "../../../components/TimeController";
import type { BufferMetadata } from "../../../api/buffer";
import { BUFFER_PROFILE_ID } from "../../../dialogs/IoReaderPickerDialog";
import FlexSeparator from "../../../components/FlexSeparator";
import { buttonBase, iconButtonBase, dangerButtonBase, warningButtonBase, successButtonBase, successIconButton, toggleButtonClass } from "../../../styles/buttonStyles";

type Props = {
  // Catalog selection
  catalogs: CatalogMetadata[];
  catalogPath: string | null;
  onCatalogChange: (path: string) => void;
  defaultCatalogFilename?: string | null;

  // IO profile selection
  ioProfiles: IOProfile[];
  ioProfile: string | null;
  onIoProfileChange: (id: string | null) => void;
  defaultReadProfileId?: string | null;
  bufferMetadata?: BufferMetadata | null;

  // Speed (for top bar display, not playback controls)
  speed: PlaybackSpeed;
  supportsSpeed?: boolean;

  // Streaming state (Watch is initiated via data source dialog)
  isStreaming?: boolean;
  onStopStream?: () => void;
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

  // Dialogs
  onOpenIoReaderPicker: () => void;
  onOpenSpeedPicker: () => void;
  onOpenCatalogPicker: () => void;

  // Raw bytes toggle
  showRawBytes?: boolean;
  onToggleRawBytes?: () => void;

  // Clear decoded values
  onClear?: () => void;

  // View mode toggle (single vs per-source)
  viewMode?: 'single' | 'per-source';
  onToggleViewMode?: () => void;

  // Min frame length filter
  minFrameLength?: number;
  onOpenFilterDialog?: () => void;

  // Hide unseen frames toggle
  hideUnseen?: boolean;
  onToggleHideUnseen?: () => void;

  // ASCII gutter toggle (for unmatched/filtered tabs)
  showAsciiGutter?: boolean;
  onToggleAsciiGutter?: () => void;

  // Frame ID filter (for coloring the filter button when active)
  frameIdFilter?: string;
};

export default function DecoderTopBar({
  catalogs,
  catalogPath,
  defaultCatalogFilename,
  ioProfiles,
  ioProfile,
  defaultReadProfileId,
  bufferMetadata,
  speed,
  supportsSpeed = false,
  isStreaming = false,
  onStopStream,
  isStopped = false,
  onResume,
  joinerCount = 1,
  onDetach,
  isDetached = false,
  onRejoin,
  frameCount,
  selectedFrameCount,
  onOpenFramePicker,
  onOpenIoReaderPicker,
  onOpenSpeedPicker,
  onOpenCatalogPicker,
  showRawBytes = false,
  onToggleRawBytes,
  onClear,
  viewMode = 'single',
  onToggleViewMode,
  minFrameLength = 0,
  onOpenFilterDialog,
  hideUnseen = true,
  onToggleHideUnseen,
  showAsciiGutter = false,
  onToggleAsciiGutter,
  frameIdFilter = '',
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

  const selectedCatalog = catalogs.find((c) => c.path === catalogPath);
  const hasCatalog = !!selectedCatalog;
  const catalogName = selectedCatalog?.name || "No catalog";
  const isDefaultCatalog = selectedCatalog?.filename === defaultCatalogFilename;

  return (
    <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Decoder icon */}
        <Activity className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />

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

        {/* Speed button - only show if reader supports speed */}
        {supportsSpeed && (
          <button
            onClick={onOpenSpeedPicker}
            className={buttonBase}
            title="Set playback speed"
          >
            <span>{speed === 0 ? "No Limit" : `${speed}x`}</span>
          </button>
        )}

        {/* Stop button - only shown when actively streaming */}
        {isStreaming && (
          <button
            onClick={onStopStream}
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

        {/* Frames Button - icon with count */}
        <button
          onClick={onOpenFramePicker}
          className={buttonBase}
          title="Select frames to decode"
        >
          <ListFilter className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-slate-500 dark:text-slate-400">
            {selectedFrameCount}/{frameCount}
          </span>
        </button>

        {/* Right arrow icon */}
        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

        {/* Catalog Selection */}
        {hasCatalog ? (
          <button
            onClick={onOpenCatalogPicker}
            className={buttonBase}
            title="Select Decoder Catalog"
          >
            {isDefaultCatalog && (
              <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="currentColor" />
            )}
            <span className="max-w-32 truncate">{catalogName}</span>
          </button>
        ) : (
          <button
            onClick={onOpenCatalogPicker}
            className={buttonBase}
            title="Select Decoder Catalog"
          >
            <span className="text-slate-400 dark:text-slate-500 italic">No catalog</span>
          </button>
        )}

        {/* Raw bytes toggle */}
        {onToggleRawBytes && (
          <button
            onClick={onToggleRawBytes}
            className={toggleButtonClass(showRawBytes, "purple")}
            title={showRawBytes ? "Hide raw bytes" : "Show raw bytes"}
          >
            <Glasses className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Clear decoded values */}
        {onClear && (
          <button
            onClick={onClear}
            className={buttonBase}
            title="Clear decoded values"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}

        {/* View mode toggle (single vs per-source) */}
        {onToggleViewMode && (
          <button
            onClick={onToggleViewMode}
            className={toggleButtonClass(viewMode === 'per-source', 'blue')}
            title={viewMode === 'single' ? 'Show per source address' : 'Show single (most recent)'}
          >
            {viewMode === 'per-source' ? (
              <Users className="w-3.5 h-3.5" />
            ) : (
              <User className="w-3.5 h-3.5" />
            )}
          </button>
        )}

        {/* Frame filters button - colored when any filter is active */}
        {onOpenFilterDialog && (() => {
          const hasFilters = minFrameLength > 0 || frameIdFilter.trim() !== '';
          const filterParts: string[] = [];
          if (minFrameLength > 0) filterParts.push(`min ${minFrameLength}B`);
          if (frameIdFilter.trim()) filterParts.push(`ID: ${frameIdFilter}`);
          return (
            <button
              onClick={onOpenFilterDialog}
              className={toggleButtonClass(hasFilters, 'yellow')}
              title={hasFilters ? `Filters: ${filterParts.join(', ')}` : 'Set frame filters'}
            >
              <Filter className="w-3.5 h-3.5" />
            </button>
          );
        })()}

        {/* Hide unseen frames toggle */}
        {onToggleHideUnseen && (
          <button
            onClick={onToggleHideUnseen}
            className={toggleButtonClass(hideUnseen, 'blue')}
            title={hideUnseen ? 'Showing only seen frames' : 'Showing all frames'}
          >
            {hideUnseen ? (
              <EyeOff className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
          </button>
        )}

        {/* ASCII toggle */}
        {onToggleAsciiGutter && (
          <button
            onClick={onToggleAsciiGutter}
            className={`${iconButtonBase} ${
              showAsciiGutter
                ? "!bg-yellow-600 !text-white hover:!bg-yellow-500"
                : ""
            }`}
            title={showAsciiGutter ? "Hide ASCII column" : "Show ASCII column"}
          >
            <Type className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
