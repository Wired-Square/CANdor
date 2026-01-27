// ui/src/apps/decoder/hooks/useDecoderHandlers.ts
//
// Orchestrator hook that composes all Decoder domain handlers.

import {
  useDecoderSessionHandlers,
  type DecoderSessionHandlers,
} from "./handlers/useDecoderSessionHandlers";
import {
  useDecoderPlaybackHandlers,
  type DecoderPlaybackHandlers,
} from "./handlers/useDecoderPlaybackHandlers";
import {
  useDecoderTimeHandlers,
  type DecoderTimeHandlers,
} from "./handlers/useDecoderTimeHandlers";
import {
  useDecoderSelectionHandlers,
  type DecoderSelectionHandlers,
} from "./handlers/useDecoderSelectionHandlers";
import {
  useDecoderCatalogHandlers,
  type DecoderCatalogHandlers,
} from "./handlers/useDecoderCatalogHandlers";
import type { PlaybackSpeed } from "../../../components/TimeController";
import type { IOCapabilities } from "../../../api/io";
import type { BufferMetadata } from "../../../api/buffer";
import type { FrameDetail } from "../../../types/decoder";
import type { SerialFrameConfig } from "../../../utils/frameExport";
import type { SelectionSet } from "../../../utils/selectionSets";

export interface UseDecoderHandlersParams {
  // Session manager actions
  reinitialize: (
    profileId?: string,
    options?: {
      useBuffer?: boolean;
      speed?: number;
      startTime?: string;
      endTime?: string;
      limit?: number;
      framingEncoding?: "slip" | "modbus_rtu" | "delimiter" | "raw";
      frameIdStartByte?: number;
      frameIdBytes?: number;
      frameIdBigEndian?: boolean;
      sourceAddressStartByte?: number;
      sourceAddressBytes?: number;
      sourceAddressBigEndian?: boolean;
      minFrameLength?: number;
      emitRawBytes?: boolean;
    }
  ) => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  leave: () => Promise<void>;
  setSpeed: (speed: number) => Promise<void>;
  setTimeRange: (start?: string, end?: string) => Promise<void>;
  seek: (timeUs: number) => Promise<void>;

  // Reader state
  sessionId: string;
  isPaused: boolean;
  isStreaming: boolean;
  sessionReady: boolean;
  capabilities: IOCapabilities | null;
  currentFrameIndex?: number | null;
  currentTimestampUs?: number | null;

  // Store actions (decoder)
  setIoProfile: (profileId: string | null) => void;
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  clearFrames: () => void;
  setStartTime: (time: string) => void;
  setEndTime: (time: string) => void;
  updateCurrentTime: (time: number) => void;
  setCurrentFrameIndex: (index: number) => void;
  loadCatalog: (path: string) => Promise<void>;
  clearDecoded: () => void;
  clearUnmatchedFrames: () => void;
  clearFilteredFrames: () => void;
  setActiveSelectionSet: (id: string | null) => void;
  setSelectionSetDirty: (dirty: boolean) => void;
  applySelectionSet: (selectionSet: SelectionSet) => void;

  // Store state (decoder)
  frames: Map<number, FrameDetail>;
  selectedFrames: Set<number>;
  activeSelectionSetId: string | null;
  selectionSetDirty: boolean;
  startTime: string;
  endTime: string;
  playbackSpeed: PlaybackSpeed;
  serialConfig: SerialFrameConfig | null;

  // Multi-bus state
  setMultiBusMode: (mode: boolean) => void;
  setMultiBusProfiles: (profiles: string[]) => void;

  // Ingest session
  startIngest: (params: {
    profileId: string;
    speed?: number;
    startTime?: string;
    endTime?: string;
    maxFrames?: number;
    frameIdStartByte?: number;
    frameIdBytes?: number;
    sourceAddressStartByte?: number;
    sourceAddressBytes?: number;
    sourceAddressBigEndian?: boolean;
    minFrameLength?: number;
  }) => Promise<void>;
  stopIngest: () => Promise<void>;
  isIngesting: boolean;

  // Watch state
  isWatching: boolean;
  setIsWatching: (watching: boolean) => void;
  resetWatchFrameCount: () => void;
  streamCompletedRef: React.MutableRefObject<boolean>;

  // Detach/rejoin handlers (from manager)
  handleDetach: () => Promise<void>;
  handleRejoin: () => Promise<void>;

  // Multi-bus handlers (from manager)
  startMultiBusSession: (profileIds: string[], options: import("../../../hooks/useIOSessionManager").IngestOptions) => Promise<void>;
  joinExistingSession: (sessionId: string, sourceProfileIds?: string[]) => Promise<void>;

  // Ingest speed
  ingestSpeed: number;
  setIngestSpeed: (speed: number) => void;

  // Dialog controls
  closeIoReaderPicker: () => void;
  openSaveSelectionSet: () => void;

  // Active tab
  activeTab: string;

  // Bookmark state
  setActiveBookmarkId: (id: string | null) => void;

  // Buffer state
  setBufferMetadata: (meta: BufferMetadata | null) => void;

  // Buffer bounds for frame index calculation during scrub
  minTimeUs?: number | null;
  maxTimeUs?: number | null;
  totalFrames?: number | null;

  // Settings for default speeds
  ioProfiles?: Array<{ id: string; connection?: { default_speed?: string } }>;
}

export type DecoderHandlers = DecoderSessionHandlers &
  DecoderPlaybackHandlers &
  DecoderTimeHandlers &
  DecoderSelectionHandlers &
  DecoderCatalogHandlers;

export function useDecoderHandlers(params: UseDecoderHandlersParams): DecoderHandlers {
  // Session handlers (start ingest, stop watch, detach, rejoin, multi-bus, IO profile change)
  const sessionHandlers = useDecoderSessionHandlers({
    reinitialize: params.reinitialize,
    stop: params.stop,
    leave: params.leave,
    setIoProfile: params.setIoProfile,
    setPlaybackSpeed: params.setPlaybackSpeed,
    clearFrames: params.clearFrames,
    setMultiBusMode: params.setMultiBusMode,
    setMultiBusProfiles: params.setMultiBusProfiles,
    startIngest: params.startIngest,
    stopIngest: params.stopIngest,
    isIngesting: params.isIngesting,
    serialConfig: params.serialConfig,
    isWatching: params.isWatching,
    setIsWatching: params.setIsWatching,
    resetWatchFrameCount: params.resetWatchFrameCount,
    streamCompletedRef: params.streamCompletedRef,
    handleDetach: params.handleDetach,
    handleRejoin: params.handleRejoin,
    startMultiBusSession: params.startMultiBusSession,
    joinExistingSession: params.joinExistingSession,
    ingestSpeed: params.ingestSpeed,
    setIngestSpeed: params.setIngestSpeed,
    closeIoReaderPicker: params.closeIoReaderPicker,
    playbackSpeed: params.playbackSpeed,
    setBufferMetadata: params.setBufferMetadata,
    updateCurrentTime: params.updateCurrentTime,
    setCurrentFrameIndex: params.setCurrentFrameIndex,
    ioProfiles: params.ioProfiles,
  });

  // Playback handlers (play, pause, stop, speed change)
  const playbackHandlers = useDecoderPlaybackHandlers({
    sessionId: params.sessionId,
    start: params.start,
    stop: params.stop,
    pause: params.pause,
    resume: params.resume,
    setSpeed: params.setSpeed,
    isPaused: params.isPaused,
    isStreaming: params.isStreaming,
    sessionReady: params.sessionReady,
    currentFrameIndex: params.currentFrameIndex,
    currentTimestampUs: params.currentTimestampUs,
    selectedFrameIds: params.selectedFrames,
    setPlaybackSpeed: params.setPlaybackSpeed,
    updateCurrentTime: params.updateCurrentTime,
    setCurrentFrameIndex: params.setCurrentFrameIndex,
    streamCompletedRef: params.streamCompletedRef,
  });

  // Time handlers (scrub, start/end time change, load bookmark)
  const timeHandlers = useDecoderTimeHandlers({
    setTimeRange: params.setTimeRange,
    seek: params.seek,
    capabilities: params.capabilities,
    setStartTime: params.setStartTime,
    setEndTime: params.setEndTime,
    updateCurrentTime: params.updateCurrentTime,
    setCurrentFrameIndex: params.setCurrentFrameIndex,
    startTime: params.startTime,
    endTime: params.endTime,
    minTimeUs: params.minTimeUs,
    maxTimeUs: params.maxTimeUs,
    totalFrames: params.totalFrames,
    setActiveBookmarkId: params.setActiveBookmarkId,
  });

  // Selection handlers (save, load, clear selection sets)
  const selectionHandlers = useDecoderSelectionHandlers({
    frames: params.frames,
    selectedFrames: params.selectedFrames,
    activeSelectionSetId: params.activeSelectionSetId,
    selectionSetDirty: params.selectionSetDirty,
    setActiveSelectionSet: params.setActiveSelectionSet,
    setSelectionSetDirty: params.setSelectionSetDirty,
    applySelectionSet: params.applySelectionSet,
    openSaveSelectionSet: params.openSaveSelectionSet,
  });

  // Catalog handlers (catalog change, clear data)
  const catalogHandlers = useDecoderCatalogHandlers({
    loadCatalog: params.loadCatalog,
    clearDecoded: params.clearDecoded,
    clearUnmatchedFrames: params.clearUnmatchedFrames,
    clearFilteredFrames: params.clearFilteredFrames,
    activeTab: params.activeTab,
  });

  // Spread all handlers into a flat object
  return {
    ...sessionHandlers,
    ...playbackHandlers,
    ...timeHandlers,
    ...selectionHandlers,
    ...catalogHandlers,
  };
}
