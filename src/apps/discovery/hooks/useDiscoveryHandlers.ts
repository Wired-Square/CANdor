// ui/src/apps/discovery/hooks/useDiscoveryHandlers.ts
//
// Orchestrator hook that composes all Discovery domain handlers.

import { useCallback } from "react";
import {
  useDiscoverySessionHandlers,
  type DiscoverySessionHandlers,
} from "./handlers/useDiscoverySessionHandlers";
import {
  useDiscoveryPlaybackHandlers,
  type DiscoveryPlaybackHandlers,
} from "./handlers/useDiscoveryPlaybackHandlers";
import {
  useDiscoveryExportHandlers,
  type DiscoveryExportHandlers,
} from "./handlers/useDiscoveryExportHandlers";
import {
  useDiscoveryBookmarkHandlers,
  type DiscoveryBookmarkHandlers,
} from "./handlers/useDiscoveryBookmarkHandlers";
import {
  useDiscoverySelectionHandlers,
  type DiscoverySelectionHandlers,
} from "./handlers/useDiscoverySelectionHandlers";
import type { PlaybackSpeed, FrameMessage } from "../../../stores/discoveryStore";
import type { BufferMetadata, TimestampedByte } from "../../../api/buffer";
import type { ExportDataMode } from "../../../dialogs/ExportFramesDialog";
import type { SelectionSet } from "../../../utils/selectionSets";
import { isBufferProfileId } from "../../../hooks/useIOSessionManager";

export interface UseDiscoveryHandlersParams {
  // Session state
  sessionId: string;
  multiBusMode: boolean;
  isStreaming: boolean;
  isPaused: boolean;
  sessionReady: boolean;
  ioProfile: string | null;
  sourceProfileId: string | null;
  playbackSpeed: PlaybackSpeed;
  bufferModeEnabled: boolean;
  bufferModeTotalFrames: number;

  // Frame state
  frames: FrameMessage[];
  framedData: FrameMessage[];
  framedBufferId: string | null;
  frameInfoMap: Map<number, any>;
  selectedFrames: Set<number>;

  // Serial state
  isSerialMode: boolean;
  backendByteCount: number;
  backendFrameCount: number;
  serialBytesBufferLength: number;

  // Time state
  startTime: string;
  endTime: string;
  currentFrameIndex?: number | null;
  currentTimestampUs?: number | null;

  // Selection set state
  activeSelectionSetId: string | null;
  selectionSetDirty: boolean;

  // Export state
  exportDataMode: ExportDataMode;
  decoderDir: string;
  saveFrameIdFormat: 'hex' | 'decimal';
  dumpDir: string;

  // Local state
  pendingSpeed: PlaybackSpeed | null;
  setPendingSpeed: (speed: PlaybackSpeed | null) => void;
  setActiveBookmarkId: (id: string | null) => void;
  setBookmarkFrameId: (id: number) => void;
  setBookmarkFrameTime: (time: string) => void;
  resetWatchFrameCount: () => void;
  setBufferMetadata: (meta: BufferMetadata | null) => void;

  // Detach/rejoin handlers (from manager)
  handleDetach: () => Promise<void>;
  handleRejoin: () => Promise<void>;

  // Multi-bus handlers (from manager)
  startMultiBusSession: (profileIds: string[], options: any) => Promise<void>;
  joinExistingSession: (sessionId: string, sourceProfileIds?: string[]) => Promise<void>;

  // Session actions
  setMultiBusMode: (mode: boolean) => void;
  setMultiBusProfiles: (profiles: string[]) => void;
  setIoProfile: (profileId: string | null) => void;
  setSourceProfileId: (profileId: string | null) => void;
  setShowBusColumn: (show: boolean) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  leave: () => Promise<void>;
  reinitialize: (profileId?: string, options?: any) => Promise<void>;
  setSpeed: (speed: number) => Promise<void>;
  setTimeRange: (start: string, end: string) => Promise<void>;

  // Store actions
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  updateCurrentTime: (time: number) => void;
  setCurrentFrameIndex: (index: number) => void;
  setMaxBuffer: (count: number) => void;
  setStartTime: (time: string) => void;
  setEndTime: (time: string) => void;
  clearBuffer: () => void;
  clearFramePicker: () => void;
  clearAnalysisResults: () => void;
  enableBufferMode: (count: number) => void;
  disableBufferMode: () => void;
  setFrameInfoFromBuffer: (frameInfo: any[]) => void;
  clearSerialBytes: (preserveCount?: boolean) => void;
  resetFraming: () => void;
  setBackendByteCount: (count: number) => void;
  setBackendFrameCount: (count: number) => void;
  addSerialBytes: (entries: { byte: number; timestampUs: number }[]) => void;
  setSerialConfig: (config: any) => void;
  setFramingConfig: (config: any) => void;
  showError: (title: string, message: string, details?: string) => void;
  openSaveDialog: () => void;
  saveFrames: (decoderDir: string, format: 'hex' | 'decimal') => Promise<void>;
  setActiveSelectionSet: (id: string | null) => void;
  setSelectionSetDirty: (dirty: boolean) => void;
  applySelectionSet: (set: SelectionSet) => void;

  // API functions (for export/other features)
  getBufferBytesPaginated: (offset: number, limit: number) => Promise<{ bytes: TimestampedByte[] }>;
  getBufferFramesPaginated: (offset: number, limit: number) => Promise<{ frames: any[] }>;
  getBufferFramesPaginatedById: (id: string, offset: number, limit: number) => Promise<{ frames: any[] }>;
  clearBackendBuffer: () => Promise<void>;
  pickFileToSave: (options: any) => Promise<string | null>;
  saveCatalog: (path: string, content: string) => Promise<void>;

  // Dialog controls
  openBookmarkDialog: () => void;
  closeSpeedChangeDialog: () => void;
  openSaveSelectionSetDialog: () => void;
  closeExportDialog: () => void;
  closeIoReaderPicker: () => void;
}

export type DiscoveryHandlers = DiscoverySessionHandlers &
  DiscoveryPlaybackHandlers &
  DiscoveryExportHandlers &
  DiscoveryBookmarkHandlers &
  DiscoverySelectionHandlers & {
    handleClearDiscoveredFrames: () => Promise<void>;
    handleExportClick: () => void;
  };

export function useDiscoveryHandlers(params: UseDiscoveryHandlersParams): DiscoveryHandlers {
  // Session handlers
  const sessionHandlers = useDiscoverySessionHandlers({
    sessionId: params.sessionId,
    isStreaming: params.isStreaming,
    isPaused: params.isPaused,
    sessionReady: params.sessionReady,
    currentFrameIndex: params.currentFrameIndex,
    currentTimestampUs: params.currentTimestampUs,
    selectedFrameIds: params.selectedFrames,
    setMultiBusMode: params.setMultiBusMode,
    setMultiBusProfiles: params.setMultiBusProfiles,
    setIoProfile: params.setIoProfile,
    setSourceProfileId: params.setSourceProfileId,
    setShowBusColumn: params.setShowBusColumn,
    start: params.start,
    stop: params.stop,
    pause: params.pause,
    resume: params.resume,
    reinitialize: params.reinitialize,
    setPlaybackSpeed: params.setPlaybackSpeed,
    updateCurrentTime: params.updateCurrentTime,
    setCurrentFrameIndex: params.setCurrentFrameIndex,
    setMaxBuffer: params.setMaxBuffer,
    clearBuffer: params.clearBuffer,
    clearFramePicker: params.clearFramePicker,
    clearAnalysisResults: params.clearAnalysisResults,
    enableBufferMode: params.enableBufferMode,
    disableBufferMode: params.disableBufferMode,
    setFrameInfoFromBuffer: params.setFrameInfoFromBuffer,
    clearSerialBytes: params.clearSerialBytes,
    resetFraming: params.resetFraming,
    setBackendByteCount: params.setBackendByteCount,
    setBackendFrameCount: params.setBackendFrameCount,
    addSerialBytes: params.addSerialBytes,
    setSerialConfig: params.setSerialConfig,
    setFramingConfig: params.setFramingConfig,
    resetWatchFrameCount: params.resetWatchFrameCount,
    showError: params.showError,
    handleDetach: params.handleDetach,
    handleRejoin: params.handleRejoin,
    startMultiBusSession: params.startMultiBusSession,
    joinExistingSession: params.joinExistingSession,
    setBufferMetadata: params.setBufferMetadata,
    closeIoReaderPicker: params.closeIoReaderPicker,
  });

  // Playback handlers
  const playbackHandlers = useDiscoveryPlaybackHandlers({
    startTime: params.startTime,
    endTime: params.endTime,
    pendingSpeed: params.pendingSpeed,
    setPendingSpeed: params.setPendingSpeed,
    setActiveBookmarkId: params.setActiveBookmarkId,
    setPlaybackSpeed: params.setPlaybackSpeed,
    updateCurrentTime: params.updateCurrentTime,
    setStartTime: params.setStartTime,
    setEndTime: params.setEndTime,
    clearBuffer: params.clearBuffer,
    clearFramePicker: params.clearFramePicker,
    setSpeed: params.setSpeed,
    setTimeRange: params.setTimeRange,
    closeSpeedChangeDialog: params.closeSpeedChangeDialog,
  });

  // Export handlers
  const exportHandlers = useDiscoveryExportHandlers({
    frames: params.frames,
    framedData: params.framedData,
    framedBufferId: params.framedBufferId,
    backendByteCount: params.backendByteCount,
    backendFrameCount: params.backendFrameCount,
    serialBytesBufferLength: params.serialBytesBufferLength,
    exportDataMode: params.exportDataMode,
    bufferModeEnabled: params.bufferModeEnabled,
    bufferModeTotalFrames: params.bufferModeTotalFrames,
    isSerialMode: params.isSerialMode,
    decoderDir: params.decoderDir,
    saveFrameIdFormat: params.saveFrameIdFormat,
    dumpDir: params.dumpDir,
    showError: params.showError,
    openSaveDialog: params.openSaveDialog,
    saveFrames: params.saveFrames,
    getBufferBytesPaginated: params.getBufferBytesPaginated,
    getBufferFramesPaginated: params.getBufferFramesPaginated,
    getBufferFramesPaginatedById: params.getBufferFramesPaginatedById,
    pickFileToSave: params.pickFileToSave,
    saveCatalog: params.saveCatalog,
    closeExportDialog: params.closeExportDialog,
  });

  // Bookmark handlers
  const bookmarkHandlers = useDiscoveryBookmarkHandlers({
    ioProfile: params.ioProfile,
    sourceProfileId: params.sourceProfileId,
    bufferModeEnabled: params.bufferModeEnabled,
    setBookmarkFrameId: params.setBookmarkFrameId,
    setBookmarkFrameTime: params.setBookmarkFrameTime,
    setActiveBookmarkId: params.setActiveBookmarkId,
    setStartTime: params.setStartTime,
    setEndTime: params.setEndTime,
    setIoProfile: params.setIoProfile,
    disableBufferMode: params.disableBufferMode,
    setTimeRange: params.setTimeRange,
    reinitialize: params.reinitialize,
    openBookmarkDialog: params.openBookmarkDialog,
  });

  // Selection handlers
  const selectionHandlers = useDiscoverySelectionHandlers({
    frameInfoMap: params.frameInfoMap,
    selectedFrames: params.selectedFrames,
    activeSelectionSetId: params.activeSelectionSetId,
    selectionSetDirty: params.selectionSetDirty,
    setActiveSelectionSet: params.setActiveSelectionSet,
    setSelectionSetDirty: params.setSelectionSetDirty,
    applySelectionSet: params.applySelectionSet,
    openSaveSelectionSetDialog: params.openSaveSelectionSetDialog,
  });

  // Handle clear discovered frames
  const handleClearDiscoveredFrames = useCallback(async () => {
    if (params.isSerialMode) {
      params.clearSerialBytes();
      params.resetFraming();
      params.clearBuffer();
      params.clearFramePicker();
      await params.clearBackendBuffer();
      if (isBufferProfileId(params.ioProfile) && params.sourceProfileId) {
        params.setIoProfile(params.sourceProfileId);
        await params.reinitialize(params.sourceProfileId);
      }
    } else {
      params.clearBuffer();
      params.clearFramePicker();
      await params.clearBackendBuffer();
      if (isBufferProfileId(params.ioProfile) && params.sourceProfileId) {
        params.setIoProfile(params.sourceProfileId);
        await params.reinitialize(params.sourceProfileId);
      }
    }
  }, [
    params.isSerialMode,
    params.clearSerialBytes,
    params.resetFraming,
    params.clearBuffer,
    params.clearFramePicker,
    params.clearBackendBuffer,
    params.ioProfile,
    params.sourceProfileId,
    params.setIoProfile,
    params.reinitialize,
  ]);

  // Handle export click (opens dialog)
  const handleExportClick = useCallback(() => {
    // This is a simple handler that will be connected to the dialog open function
    // in the component. We include it here for consistency.
  }, []);

  return {
    ...sessionHandlers,
    ...playbackHandlers,
    ...exportHandlers,
    ...bookmarkHandlers,
    ...selectionHandlers,
    handleClearDiscoveredFrames,
    handleExportClick,
  };
}
