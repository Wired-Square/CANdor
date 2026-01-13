// ui/src/apps/discovery/Discovery.tsx

import { useEffect, useMemo, useCallback, useState, useRef } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { useSettings, getDisplayFrameIdFormat, getSaveFrameIdFormat } from "../../hooks/useSettings";
import { useIOSession } from '../../hooks/useIOSession';
import { useDiscoveryStore, type FrameMessage, type PlaybackSpeed, type SerialRawBytesPayload } from "../../stores/discoveryStore";
import DiscoveryTopBar from "./views/DiscoveryTopBar";
import DiscoveryFramesView from "./views/DiscoveryFramesView";
import SerialDiscoveryView from "./views/SerialDiscoveryView";
import SaveFramesDialog from "../../dialogs/SaveFramesDialog";
import DecoderInfoDialog from "../../dialogs/DecoderInfoDialog";
import ErrorDialog from "../../dialogs/ErrorDialog";
import AddBookmarkDialog from "../../dialogs/AddBookmarkDialog";
import NoLimitProgressDialog from "../../dialogs/NoLimitProgressDialog";
import AnalysisProgressDialog from "./dialogs/AnalysisProgressDialog";
import ConfirmDeleteDialog from "../../dialogs/ConfirmDeleteDialog";
import ExportFramesDialog, { type ExportFormat, type ExportDataMode } from "../../dialogs/ExportFramesDialog";
import BookmarkEditorDialog from "../../dialogs/BookmarkEditorDialog";
import SaveSelectionSetDialog from "../../dialogs/SaveSelectionSetDialog";
import SelectionSetPickerDialog from "../../dialogs/SelectionSetPickerDialog";
import IoReaderPickerDialog, { BUFFER_PROFILE_ID, INGEST_SESSION_ID, type IngestOptions } from "../../dialogs/IoReaderPickerDialog";
import {
  createIOSession,
  startReaderSession,
  stopReaderSession,
  destroyReaderSession,
  type StreamEndedPayload,
} from '../../api/io';
import { clearBuffer as clearBackendBuffer, getBufferMetadata, getBufferMetadataById, getBufferFramesPaginated, getBufferBytesPaginated, getBufferFrameInfo, getBufferBytesById, setActiveBuffer, type BufferMetadata, type TimestampedByte } from "../../api/buffer";
import { WINDOW_EVENTS, type BufferChangedPayload } from "../../events/registry";
import FramePickerDialog from "../../dialogs/FramePickerDialog";
import ToolboxDialog from "../../dialogs/ToolboxDialog";
import { addFavorite, markFavoriteUsed, type TimeRangeFavorite } from "../../utils/favorites";
import { addSelectionSet, updateSelectionSet, markSelectionSetUsed, type SelectionSet } from "../../utils/selectionSets";
import { pickFileToSave } from "../../api/dialogs";
import { saveCatalog } from "../../api/catalog";
import { localToUtc, microsToDatetimeLocal, formatFilenameDate } from "../../utils/timeFormat";

export default function Discovery() {
  const { settings } = useSettings();

  // Zustand store selectors
  const frames = useDiscoveryStore((state) => state.frames);
  const frameInfoMap = useDiscoveryStore((state) => state.frameInfoMap);
  const selectedFrames = useDiscoveryStore((state) => state.selectedFrames);
  const maxBuffer = useDiscoveryStore((state) => state.maxBuffer);
  const ioProfile = useDiscoveryStore((state) => state.ioProfile);
  const sourceProfileId = useDiscoveryStore((state) => state.sourceProfileId);
  const playbackSpeed = useDiscoveryStore((state) => state.playbackSpeed);
  const showSaveDialog = useDiscoveryStore((state) => state.showSaveDialog);
  const saveMetadata = useDiscoveryStore((state) => state.saveMetadata);
  const showErrorDialog = useDiscoveryStore((state) => state.showErrorDialog);
  const errorDialogTitle = useDiscoveryStore((state) => state.errorDialogTitle);
  const errorDialogMessage = useDiscoveryStore((state) => state.errorDialogMessage);
  const errorDialogDetails = useDiscoveryStore((state) => state.errorDialogDetails);
  const startTime = useDiscoveryStore((state) => state.startTime);
  const endTime = useDiscoveryStore((state) => state.endTime);
  const currentTime = useDiscoveryStore((state) => state.currentTime);
  // Subscribe to noLimitMode fields separately to avoid re-renders from frameCount updates
  const noLimitModeActive = useDiscoveryStore((state) => state.noLimitMode.active);
  const noLimitModeShowProgressDialog = useDiscoveryStore((state) => state.noLimitMode.showProgressDialog);
  const noLimitModeBufferLimitApproaching = useDiscoveryStore((state) => state.noLimitMode.bufferLimitApproaching);
  const toolboxIsRunning = useDiscoveryStore((state) => state.toolbox.isRunning);
  const toolboxActiveView = useDiscoveryStore((state) => state.toolbox.activeView);
  const showInfoView = useDiscoveryStore((state) => state.showInfoView);
  const knowledge = useDiscoveryStore((state) => state.knowledge);
  const activeSelectionSetId = useDiscoveryStore((state) => state.activeSelectionSetId);
  const selectionSetDirty = useDiscoveryStore((state) => state.selectionSetDirty);
  const streamStartTimeUs = useDiscoveryStore((state) => state.streamStartTimeUs);

  // Zustand store actions
  const showError = useDiscoveryStore((state) => state.showError);
  const closeErrorDialog = useDiscoveryStore((state) => state.closeErrorDialog);
  const addFrames = useDiscoveryStore((state) => state.addFrames);
  const clearBuffer = useDiscoveryStore((state) => state.clearBuffer);
  const clearFramePicker = useDiscoveryStore((state) => state.clearFramePicker);
  const toggleFrameSelection = useDiscoveryStore((state) => state.toggleFrameSelection);
  const bulkSelectBus = useDiscoveryStore((state) => state.bulkSelectBus);
  const setMaxBuffer = useDiscoveryStore((state) => state.setMaxBuffer);
  const setIoProfile = useDiscoveryStore((state) => state.setIoProfile);
  const setSourceProfileId = useDiscoveryStore((state) => state.setSourceProfileId);
  const setPlaybackSpeed = useDiscoveryStore((state) => state.setPlaybackSpeed);
  const updateCurrentTime = useDiscoveryStore((state) => state.updateCurrentTime);
  const openSaveDialog = useDiscoveryStore((state) => state.openSaveDialog);
  const closeSaveDialog = useDiscoveryStore((state) => state.closeSaveDialog);
  const updateSaveMetadata = useDiscoveryStore((state) => state.updateSaveMetadata);
  const saveFrames = useDiscoveryStore((state) => state.saveFrames);
  const setStartTime = useDiscoveryStore((state) => state.setStartTime);
  const setEndTime = useDiscoveryStore((state) => state.setEndTime);
  const setNoLimitActive = useDiscoveryStore((state) => state.setNoLimitActive);
  const showNoLimitProgressDialog = useDiscoveryStore((state) => state.showNoLimitProgressDialog);
  const hideNoLimitProgressDialog = useDiscoveryStore((state) => state.hideNoLimitProgressDialog);
  const resetNoLimitMode = useDiscoveryStore((state) => state.resetNoLimitMode);
  const rebuildFramePickerFromBuffer = useDiscoveryStore((state) => state.rebuildFramePickerFromBuffer);
  const openInfoView = useDiscoveryStore((state) => state.openInfoView);
  const closeInfoView = useDiscoveryStore((state) => state.closeInfoView);
  const clearAnalysisResults = useDiscoveryStore((state) => state.clearAnalysisResults);
  const selectAllFrames = useDiscoveryStore((state) => state.selectAllFrames);
  const deselectAllFrames = useDiscoveryStore((state) => state.deselectAllFrames);
  const setActiveSelectionSet = useDiscoveryStore((state) => state.setActiveSelectionSet);
  const setSelectionSetDirty = useDiscoveryStore((state) => state.setSelectionSetDirty);
  const enableBufferMode = useDiscoveryStore((state) => state.enableBufferMode);
  const disableBufferMode = useDiscoveryStore((state) => state.disableBufferMode);
  const setFrameInfoFromBuffer = useDiscoveryStore((state) => state.setFrameInfoFromBuffer);
  const applySelectionSet = useDiscoveryStore((state) => state.applySelectionSet);
  const setSerialConfig = useDiscoveryStore((state) => state.setSerialConfig);
  const isSerialMode = useDiscoveryStore((state) => state.isSerialMode);
  const setSerialMode = useDiscoveryStore((state) => state.setSerialMode);
  const addSerialBytes = useDiscoveryStore((state) => state.addSerialBytes);
  const clearSerialBytes = useDiscoveryStore((state) => state.clearSerialBytes);
  const resetFraming = useDiscoveryStore((state) => state.resetFraming);
  const framedData = useDiscoveryStore((state) => state.framedData);
  const framingAccepted = useDiscoveryStore((state) => state.framingAccepted);
  const serialBytesBuffer = useDiscoveryStore((state) => state.serialBytesBuffer);
  const backendByteCount = useDiscoveryStore((state) => state.backendByteCount);
  const incrementBackendByteCount = useDiscoveryStore((state) => state.incrementBackendByteCount);
  const setBackendByteCount = useDiscoveryStore((state) => state.setBackendByteCount);
  const triggerBufferReady = useDiscoveryStore((state) => state.triggerBufferReady);
  const framedBufferId = useDiscoveryStore((state) => state.framedBufferId);
  const backendFrameCount = useDiscoveryStore((state) => state.backendFrameCount);
  const incrementBackendFrameCount = useDiscoveryStore((state) => state.incrementBackendFrameCount);
  const setBackendFrameCount = useDiscoveryStore((state) => state.setBackendFrameCount);
  const serialActiveTab = useDiscoveryStore((state) => state.serialActiveTab);
  const bufferMode = useDiscoveryStore((state) => state.bufferMode);
  const serialViewConfig = useDiscoveryStore((state) => state.serialViewConfig);
  const toggleShowAscii = useDiscoveryStore((state) => state.toggleShowAscii);
  const setFramingConfig = useDiscoveryStore((state) => state.setFramingConfig);

  const displayFrameIdFormat = getDisplayFrameIdFormat(settings);
  const displayTimeFormat = settings?.display_time_format ?? "human";
  const saveFrameIdFormat = getSaveFrameIdFormat(settings);
  const decoderDir = settings?.decoder_dir ?? "";

  // Bookmark dialog state
  const [showBookmarkDialog, setShowBookmarkDialog] = useState(false);
  const [bookmarkFrameId, setBookmarkFrameId] = useState(0);
  const [bookmarkFrameTime, setBookmarkFrameTime] = useState("");

  // Speed change confirmation dialog state
  const [showSpeedChangeDialog, setShowSpeedChangeDialog] = useState(false);
  const [pendingSpeed, setPendingSpeed] = useState<PlaybackSpeed | null>(null);

  // Export dialog state
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Bookmark picker dialog state
  const [showBookmarkPicker, setShowBookmarkPicker] = useState(false);
  const [_activeBookmarkId, setActiveBookmarkId] = useState<string | null>(null);

  // Selection set dialog state
  const [showSaveSelectionSetDialog, setShowSaveSelectionSetDialog] = useState(false);
  const [showSelectionSetPickerDialog, setShowSelectionSetPickerDialog] = useState(false);

  // Top bar dialog state
  const [showIoReaderPickerDialog, setShowIoReaderPickerDialog] = useState(false);
  const [showFramePickerDialog, setShowFramePickerDialog] = useState(false);
  const [showToolboxDialog, setShowToolboxDialog] = useState(false);

  // Buffer metadata state (for imported CSV files)
  const [bufferMetadata, setBufferMetadata] = useState<BufferMetadata | null>(null);

  // Time range visibility
  const [showTimeRange] = useState(false);

  // Track if we've detached from a session (but profile still selected)
  const [isDetached, setIsDetached] = useState(false);

  // Watch frame count (for top bar display during streaming)
  const [watchFrameCount, setWatchFrameCount] = useState(0);

  // Ingest mode state - uses separate session, no real-time display
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestProfileId, setIngestProfileId] = useState<string | null>(null);
  const [ingestFrameCount, setIngestFrameCount] = useState(0);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const ingestUnlistenRefs = useRef<Array<() => void>>([]);

  // Load buffer metadata on mount (in case a CSV was already imported)
  useEffect(() => {
    const loadBufferOnMount = async () => {
      try {
        const meta = await getBufferMetadata();
        if (meta && meta.count > 0 && meta.buffer_type === 'frames') {
          setBufferMetadata(meta);
          // Enable buffer mode and load frame info for all frame buffers
          enableBufferMode(meta.count);
          const frameInfoList = await getBufferFrameInfo();
          setFrameInfoFromBuffer(frameInfoList);
        }
      } catch (e) {
        // Buffer not available, that's fine
      }
    };
    loadBufferOnMount();
  }, [enableBufferMode, setFrameInfoFromBuffer]);

  // Listen for buffer changes from other windows
  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listen<BufferChangedPayload>(
        WINDOW_EVENTS.BUFFER_CHANGED,
        async (event) => {
          const meta = event.payload.metadata;
          setBufferMetadata(meta);

          // If buffer was deleted (meta is null), clear serial store state
          if (!meta) {
            clearSerialBytes();
            resetFraming();
            return;
          }

          // For frame buffers, enable buffer mode and load frame info
          if (meta.count > 0 && meta.buffer_type === 'frames') {
            enableBufferMode(meta.count);
            try {
              const frameInfoList = await getBufferFrameInfo();
              setFrameInfoFromBuffer(frameInfoList);
            } catch (e) {
              console.error("Failed to load frame info from buffer:", e);
            }
          }
        }
      );
      return unlisten;
    };

    const unlistenPromise = setupListener();
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [enableBufferMode, setFrameInfoFromBuffer, clearSerialBytes, resetFraming]);

  // Callbacks for reader session
  const handleFrames = useCallback((receivedFrames: FrameMessage[]) => {
    if (!receivedFrames || receivedFrames.length === 0) return;
    addFrames(receivedFrames);
    setWatchFrameCount((prev) => prev + receivedFrames.length);
    // Also update backend frame count for serial mode with backend framing
    // This allows the SerialDiscoveryView to show the Framed tab during streaming
    incrementBackendFrameCount(receivedFrames.length);
  }, [addFrames, incrementBackendFrameCount]);

  const handleError = useCallback((error: string) => {
    showError("Stream Error", "An error occurred while streaming CAN data.", error);
  }, [showError]);

  const handleTimeUpdate = useCallback((timeUs: number) => {
    updateCurrentTime(timeUs / 1_000_000); // Convert to seconds
  }, [updateCurrentTime]);

  // Get the profile name for display in session dropdown
  const ioProfileName = useMemo(() => {
    if (!ioProfile || !settings?.io_profiles) return undefined;
    const profile = settings.io_profiles.find((p) => p.id === ioProfile);
    return profile?.name;
  }, [ioProfile, settings?.io_profiles]);

  // Use the reader session hook
  const {
    capabilities,
    state: readerState,
    isReady: sessionReady,
    bufferAvailable,
    bufferId,
    bufferType,
    bufferCount,
    joinerCount,
    stoppedExplicitly,
    start,
    stop,
    leave,
    pause,
    resume,
    setSpeed,
    setTimeRange,
    reinitialize,
    rejoin,
  } = useIOSession({
    appName: "discovery",
    sessionId: ioProfile || undefined, // Session ID = Profile ID
    profileName: ioProfileName,
    onFrames: handleFrames,
    onError: handleError,
    onTimeUpdate: handleTimeUpdate,
  });

  // Track previous buffer state to detect when buffer becomes available
  const prevBufferAvailableRef = useRef(false);

  // Handle stream ended for Watch mode - update buffer metadata and switch to buffer source
  // Only auto-transition to buffer if the user explicitly stopped (not on natural stream end)
  useEffect(() => {
    // Only act when buffer becomes newly available (transition from false to true)
    // AND the user explicitly stopped the session (to avoid pagination flicker on resume)
    if (bufferAvailable && bufferCount > 0 && bufferId && !prevBufferAvailableRef.current && stoppedExplicitly) {
      (async () => {
        // If framing was applied during streaming, prefer the frames buffer over the bytes buffer
        const preferredBufferId = (bufferType === "bytes" && framedBufferId) ? framedBufferId : bufferId;

        // Fetch metadata for the preferred buffer
        const meta = await getBufferMetadataById(preferredBufferId);
        if (meta) {
          setBufferMetadata(meta);
          // Notify other windows about the buffer change
          await emit(WINDOW_EVENTS.BUFFER_CHANGED, {
            metadata: meta,
            action: "streamed",
          });

          // If it's a bytes buffer (and no framing was applied), load bytes into the serial store
          if (meta.buffer_type === "bytes") {
            // Set as active buffer so framing can work on it
            await setActiveBuffer(meta.id);
            try {
              const bytes = await getBufferBytesById(meta.id);
              const entries = bytes.map((b) => ({
                byte: b.byte,
                timestampUs: b.timestamp_us,
              }));
              // Replace frontend serial bytes with bytes from backend buffer (authoritative source)
              // Use triggerBufferReady() to force ByteView to re-fetch after setActiveBuffer() completed.
              // This avoids the race condition where ByteView fetched before active buffer was set.
              clearSerialBytes(true); // Preserve count to avoid flash
              resetFraming();
              addSerialBytes(entries);
              setBackendByteCount(meta.count);
              // Force ByteView to re-fetch now that active buffer is set
              triggerBufferReady();
            } catch (e) {
              console.error("Failed to load bytes from buffer:", e);
            }
            // For bytes buffers, just switch to buffer profile - don't create a BufferReader
            // since bytes are already loaded into the frontend store and BufferReader only handles frames
            setIoProfile(BUFFER_PROFILE_ID);
          } else {
            // For frame buffers (including framed serial data), switch to buffer profile and create a BufferReader
            setIoProfile(BUFFER_PROFILE_ID);
            await reinitialize(undefined, { useBuffer: true });
          }
        }
      })();
    }
    prevBufferAvailableRef.current = bufferAvailable;
  }, [bufferAvailable, bufferId, bufferCount, bufferType, framedBufferId, stoppedExplicitly, setIoProfile, reinitialize, clearSerialBytes, resetFraming, addSerialBytes, triggerBufferReady]);

  // Derive streaming state from reader state
  // When detached, we're no longer "streaming" from the UI perspective (IO picker should be available)
  const isStreaming = !isDetached && (readerState === "running" || readerState === "paused");
  const isPaused = readerState === "paused";
  // Session is "stopped" when it has a non-buffer profile selected but isn't streaming
  const isStopped = !isDetached && readerState === "stopped" && ioProfile !== null && ioProfile !== BUFFER_PROFILE_ID;
  // Only consider realtime if capabilities explicitly say so (default false when unknown)
  const isRealtime = capabilities?.is_realtime === true;

  // For realtime sources, update clock every second while streaming
  const [realtimeClock, setRealtimeClock] = useState<number | null>(null);
  useEffect(() => {
    if (!isStreaming || !isRealtime) {
      setRealtimeClock(null);
      return;
    }
    // Update immediately and then every second
    setRealtimeClock(Date.now() / 1000);
    const interval = setInterval(() => {
      setRealtimeClock(Date.now() / 1000);
    }, 1000);
    return () => clearInterval(interval);
  }, [isStreaming, isRealtime]);

  // Update currentTime when buffer metadata changes (for display clock in buffer mode)
  useEffect(() => {
    if (bufferMetadata?.start_time_us != null && !isStreaming) {
      // Convert microseconds to seconds for the clock display
      updateCurrentTime(bufferMetadata.start_time_us / 1_000_000);
    }
  }, [bufferMetadata?.start_time_us, isStreaming, updateCurrentTime]);

  // Display time: use stored currentTime for non-realtime, realtimeClock for realtime
  // For PostgreSQL, currentTime comes from frame timestamps via onTimeUpdate callback
  const displayTimeSeconds = isRealtime ? realtimeClock : currentTime;

  // Format display time for the clock (like Decoder)
  const displayTime = displayTimeSeconds
    ? new Date(displayTimeSeconds * 1000).toISOString().replace("T", " ").replace("Z", "").slice(0, 19)
    : null;


  // Initialize IO profile and history buffer from settings
  useEffect(() => {
    if (settings?.default_read_profile) {
      setIoProfile(settings.default_read_profile);
    }
    if (settings?.discovery_history_buffer) {
      setMaxBuffer(settings.discovery_history_buffer);
    }
  }, [settings, setIoProfile, setMaxBuffer]);

  // Detect if current profile is serial (or buffer is bytes type) and set serial mode
  // Track previous serial mode to only clear bytes when transitioning FROM serial TO non-serial
  const prevIsSerialModeRef = useRef(false);
  useEffect(() => {
    let newIsSerialMode = false;

    if (!ioProfile) {
      newIsSerialMode = false;
    } else if (ioProfile === BUFFER_PROFILE_ID) {
      // Check if using a buffer - if so, check buffer type
      // Use bufferMetadata first (authoritative), but also check bufferType from hook
      // as a fallback since bufferMetadata may not be set yet due to React state batching
      // Also stay in serial mode if we have a frames buffer created from framing (framedBufferId exists)
      newIsSerialMode = bufferMetadata?.buffer_type === "bytes" || bufferType === "bytes" || framedBufferId !== null;
    } else if (settings?.io_profiles) {
      // Otherwise check if the IO profile is serial
      const profile = settings.io_profiles.find((p) => p.id === ioProfile);
      newIsSerialMode = profile?.kind === "serial";
    }

    setSerialMode(newIsSerialMode);

    // Only clear serial bytes when transitioning FROM serial mode TO non-serial mode
    // Don't clear when entering serial mode (we may have just loaded bytes)
    if (prevIsSerialModeRef.current && !newIsSerialMode) {
      clearSerialBytes();
    }
    prevIsSerialModeRef.current = newIsSerialMode;
  }, [ioProfile, settings?.io_profiles, bufferMetadata, bufferType, framedBufferId, setSerialMode, clearSerialBytes]);

  // Listen for serial-raw-bytes events when in serial mode
  // Bytes are stored in the Rust backend buffer during streaming.
  // We track the count here to know how many bytes are in the backend.
  useEffect(() => {
    if (!isSerialMode) return;

    const setupListener = async () => {
      const unlisten = await listen<SerialRawBytesPayload>(
        `serial-raw-bytes:discovery`,
        (event) => {
          // Convert payload bytes (each with timestamp) to SerialBytesEntry format
          const entries = event.payload.bytes.map((b) => ({
            byte: b.byte,
            timestampUs: b.timestamp_us,
          }));
          // Track how many bytes are in the backend buffer
          incrementBackendByteCount(entries.length);
          // Also keep a local cache for display (limited to MAX_DISPLAY_ENTRIES)
          addSerialBytes(entries);
        }
      );
      return unlisten;
    };

    const unlistenPromise = setupListener();
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [isSerialMode, addSerialBytes, incrementBackendByteCount]);

  // Note: Speed is now always set explicitly via the IoReaderPickerDialog.
  // Previously there was an effect here that defaulted non-realtime readers to "No Limit" (speed=0),
  // but this was causing issues by overriding the user's explicit speed selection from the dialog.

  // Manage no-limit mode dialog visibility
  useEffect(() => {
    const isNoLimitSpeed = playbackSpeed === 0;
    const isRunning = readerState === "running";

    if (isNoLimitSpeed && isRunning && !noLimitModeActive) {
      // Starting no-limit streaming - activate mode (dialog disabled for now)
      setNoLimitActive(true);
      // showNoLimitProgressDialog(); // Disabled - show frames in view instead
    } else if (noLimitModeActive && noLimitModeShowProgressDialog) {
      // Check if we should hide the dialog (paused or stopped)
      if (isPaused || !isStreaming) {
        hideNoLimitProgressDialog();
      }
    }
  }, [
    playbackSpeed,
    readerState,
    isStreaming,
    isPaused,
    noLimitModeActive,
    noLimitModeShowProgressDialog,
    setNoLimitActive,
    showNoLimitProgressDialog,
    hideNoLimitProgressDialog,
  ]);

  // Auto-stop when buffer limit is approaching (90%) in no-limit mode
  // This gives us headroom before the buffer overflows
  useEffect(() => {
    if (noLimitModeBufferLimitApproaching && isStreaming) {
      console.log('[Discovery] Buffer limit approaching 90%, stopping stream proactively');
      stop();
    }
  }, [noLimitModeBufferLimitApproaching, isStreaming, stop]);

  // Rebuild frame picker when no-limit mode streaming stops
  // We skip frame discovery during streaming for performance, so rebuild it after
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = isStreaming;

    // If we just stopped streaming while in no-limit mode, rebuild the frame picker
    if (wasStreaming && !isStreaming && noLimitModeActive) {
      console.log('[Discovery] No-limit streaming stopped, rebuilding frame picker');
      rebuildFramePickerFromBuffer();
    }
  }, [isStreaming, noLimitModeActive, rebuildFramePickerFromBuffer]);

  // Window close is handled by Rust (lib.rs on_window_event) to prevent crashes
  // on macOS 26.2+ (Tahoe). The Rust handler stops the session and waits for
  // WebKit to settle before destroying the window.

  const frameList = useMemo(
    () =>
      Array.from(frameInfoMap.entries()).map(([id, info]) => ({
        id,
        len: info.len,
        isExtended: info.isExtended,
        bus: info.bus,
        lenMismatch: info.lenMismatch,
      })),
    [frameInfoMap]
  );

  // Protocol label - only needs to be computed once when we have frames
  // Use a ref to avoid recalculating on every frames change
  const protocolLabel = frames.length > 0 ? frames[0].protocol : "can";

  // Determine if the data source is recorded (e.g., PostgreSQL, CSV) vs live (GVRET, serial)
  const isRecorded = useMemo(() => {
    if (!ioProfile || !settings?.io_profiles) return false;
    if (ioProfile === BUFFER_PROFILE_ID) return true; // Buffer is always recorded data
    const profile = settings.io_profiles.find((p) => p.id === ioProfile);
    return profile?.kind === 'postgres' || profile?.kind === 'csv_file';
  }, [ioProfile, settings?.io_profiles]);

  // Export dialog computed values
  const exportDataMode: ExportDataMode = useMemo(() => {
    // In serial mode, check active tab to determine export mode
    if (isSerialMode) {
      // On Raw Bytes tab or no framing applied yet -> export bytes
      if (serialActiveTab === 'raw') return "bytes";
      // On Framed Data tab with frames available -> export frames
      if (serialActiveTab === 'framed' && (backendFrameCount > 0 || framedData.length > 0)) return "frames";
      // Default to bytes if no framed data
      return "bytes";
    }
    return "frames";
  }, [isSerialMode, serialActiveTab, backendFrameCount, framedData.length]);

  const exportItemCount = useMemo(() => {
    if (exportDataMode === "bytes") {
      // For bytes: use backend count if available, otherwise local buffer
      return backendByteCount > 0 ? backendByteCount : serialBytesBuffer.length;
    }
    // For frames: check various sources
    if (bufferMode.enabled) return bufferMode.totalFrames;
    // Serial mode with framing (accepted or not) - use backend frame count if available
    if (isSerialMode && framedBufferId && backendFrameCount > 0) return backendFrameCount;
    if (isSerialMode && framedData.length > 0) return framedData.length;
    return frames.length;
  }, [exportDataMode, backendByteCount, serialBytesBuffer.length, bufferMode, isSerialMode, framedBufferId, backendFrameCount, framedData.length, frames.length]);

  const exportDefaultFilename = useMemo(() => {
    const protocol = exportDataMode === "bytes" ? "serial" : (protocolLabel || "can");
    return `${formatFilenameDate()}-${protocol}`;
  }, [exportDataMode, protocolLabel]);

  // Handle IO profile change
  const handleIoProfileChange = async (profileId: string | null) => {
    setIoProfile(profileId);
    setIsDetached(false); // Reset detached state when changing profile

    // Clear analysis results when switching readers - old analysis is no longer valid
    clearAnalysisResults();

    // Clear ALL data when switching readers - both frames and serial bytes
    // The old data is from a different source and should not be shown
    clearBuffer();
    clearFramePicker();
    disableBufferMode();
    clearSerialBytes();
    resetFraming();
    setBackendByteCount(0);

    // Check if switching to the buffer reader
    if (profileId === BUFFER_PROFILE_ID) {
      // First check buffer type to determine how to handle it
      const meta = await getBufferMetadata();
      setBufferMetadata(meta);

      if (meta && meta.count > 0) {
        // Check if this is a bytes buffer (serial data)
        if (meta.buffer_type === "bytes") {
          // Set as active buffer so framing can work on it
          await setActiveBuffer(meta.id);
          // Load bytes into serial store - no BufferReader needed for bytes
          try {
            const bytes = await getBufferBytesById(meta.id);
            const entries = bytes.map((b) => ({
              byte: b.byte,
              timestampUs: b.timestamp_us,
            }));
            addSerialBytes(entries);
            // Set backend byte count so framing knows there are bytes available
            setBackendByteCount(meta.count);
            console.log(`[Discovery] Loaded ${bytes.length} bytes from buffer into serial view`);
          } catch (e) {
            console.error("Failed to load bytes from buffer:", e);
          }
        } else {
          // Frames buffer - create BufferReader for replay and load frames
          await reinitialize(undefined, { useBuffer: true });

          const BUFFER_MODE_THRESHOLD = 100000;

          if (meta.count > BUFFER_MODE_THRESHOLD) {
            // Large buffer: use buffer mode
            enableBufferMode(meta.count);
            try {
              const frameInfoList = await getBufferFrameInfo();
              console.log(`[Discovery] Loaded ${frameInfoList.length} unique frame IDs from buffer`);
              setFrameInfoFromBuffer(frameInfoList);
            } catch (e) {
              console.error("Failed to load frame info from buffer:", e);
            }
          } else {
            // Small buffer: load frames into frontend store
            // For any buffer, use buffer mode + frame info for the picker
            // This ensures frameInfoMap and selectedFrames are properly populated
            enableBufferMode(meta.count);
            try {
              const frameInfoList = await getBufferFrameInfo();
              console.log(`[Discovery] Loaded ${frameInfoList.length} unique frame IDs from buffer`);
              setFrameInfoFromBuffer(frameInfoList);
            } catch (e) {
              console.error("Failed to load frame info from buffer:", e);
            }
          }
        }
      }
    }
    // For regular profiles, don't reinitialize here - useIOSession will handle joining
    // and reinitialize is called from handleDialogStartIngest when Watch is clicked
  };

  // Handle ingest completion - load frames into Discovery view
  const handleIngestComplete = useCallback(async (payload: StreamEndedPayload) => {
    setIsIngesting(false);
    setIngestProfileId(null);

    // Cleanup listeners
    ingestUnlistenRefs.current.forEach((unlisten) => unlisten());
    ingestUnlistenRefs.current = [];

    // Destroy the ingest session
    try {
      await destroyReaderSession(INGEST_SESSION_ID);
    } catch (e) {
      console.error("Failed to destroy ingest session:", e);
    }

    if (payload.buffer_available && payload.count > 0) {
      // Get the updated buffer metadata
      const meta = await getBufferMetadata();
      if (meta) {
        setBufferMetadata(meta);

        // Notify other windows about the buffer change
        await emit(WINDOW_EVENTS.BUFFER_CHANGED, {
          metadata: meta,
          action: "ingested",
        });
      }

      // Close the dialog now that ingest is complete
      setShowIoReaderPickerDialog(false);

      // Check if this is a bytes buffer (serial data) or frames buffer
      if (payload.buffer_type === "bytes" && meta) {
        // Bytes buffer - load into serial store
        console.log(`[Discovery] Loading ${payload.count} bytes from buffer into serial view`);
        try {
          const bytes = await getBufferBytesById(meta.id);
          const entries = bytes.map((b) => ({
            byte: b.byte,
            timestampUs: b.timestamp_us,
          }));
          clearSerialBytes();
          resetFraming();
          addSerialBytes(entries);
          // Set backend byte count so framing knows there are bytes available
          setBackendByteCount(meta.count);
          console.log(`[Discovery] Loaded ${bytes.length} bytes`);
        } catch (e) {
          console.error("Failed to load bytes from buffer:", e);
        }
      } else {
        // Frames buffer - load frames
        const totalFrames = payload.count;
        const BUFFER_MODE_THRESHOLD = 100000; // Use buffer mode for >100k frames

        // Clear existing Discovery frames
        clearBuffer();

        if (totalFrames > BUFFER_MODE_THRESHOLD) {
          // Large ingest: use buffer mode - frames stay in backend, view fetches pages on demand
          console.log(`[Discovery] Large ingest (${totalFrames} frames) - enabling buffer mode`);
          enableBufferMode(totalFrames);

          // Fetch unique frame IDs from buffer to populate the frame picker
          try {
            const frameInfoList = await getBufferFrameInfo();
            console.log(`[Discovery] Loaded ${frameInfoList.length} unique frame IDs from buffer`);
            setFrameInfoFromBuffer(frameInfoList);
          } catch (e) {
            console.error("Failed to load frame info from buffer:", e);
          }
        } else {
          // Small ingest: load all frames into frontend store
          console.log(`[Discovery] Loading ${totalFrames} frames from backend buffer`);

          // Increase maxBuffer to fit all frames
          if (totalFrames > maxBuffer) {
            setMaxBuffer(totalFrames);
          }

          try {
            const response = await getBufferFramesPaginated(0, totalFrames);
            if (response.frames.length > 0) {
              addFrames(response.frames as FrameMessage[]);
            }
            console.log(`[Discovery] Loaded ${response.frames.length} frames`);
          } catch (e) {
            console.error("Failed to load frames from buffer:", e);
          }
        }
      }

      // Switch to buffer profile after successful ingest (like Decoder does)
      // This shows "Buffer: [source name]" in the top bar
      setIoProfile(BUFFER_PROFILE_ID);
      await reinitialize(undefined, { useBuffer: true });
    }
  }, [addFrames, clearBuffer, clearSerialBytes, resetFraming, addSerialBytes, setBackendByteCount, maxBuffer, setMaxBuffer, enableBufferMode, setFrameInfoFromBuffer, setIoProfile, reinitialize]);

  // Start ingesting from a profile (separate session, no real-time display)
  const handleStartIngest = useCallback(async (profileId: string, options: IngestOptions) => {
    setIngestError(null);
    setIngestFrameCount(0);
    // Track original source profile for bookmarks (preserved when switching to buffer mode)
    setSourceProfileId(profileId);

    try {
      // Clear existing backend buffer first
      await clearBackendBuffer();

      // Set up event listeners for the ingest session
      const unlistenStreamEnded = await listen<StreamEndedPayload>(
        `stream-ended:${INGEST_SESSION_ID}`,
        (event) => handleIngestComplete(event.payload)
      );
      const unlistenError = await listen<string>(
        `can-bytes-error:${INGEST_SESSION_ID}`,
        (event) => {
          setIngestError(event.payload);
        }
      );
      const unlistenFrames = await listen<unknown[]>(
        `frame-message:${INGEST_SESSION_ID}`,
        (event) => {
          setIngestFrameCount((prev) => prev + event.payload.length);
        }
      );

      ingestUnlistenRefs.current = [unlistenStreamEnded, unlistenError, unlistenFrames];

      // Create and start the reader session
      await createIOSession({
        sessionId: INGEST_SESSION_ID,
        profileId,
        speed: 0, // Always max speed for ingest
        startTime: options.startTime,
        endTime: options.endTime,
        limit: options.maxFrames,
        frameIdStartByte: options.frameIdStartByte,
        frameIdBytes: options.frameIdBytes,
        sourceAddressStartByte: options.sourceAddressStartByte,
        sourceAddressBytes: options.sourceAddressBytes,
        sourceAddressBigEndian: options.sourceAddressEndianness === "big",
        minFrameLength: options.minFrameLength,
      });

      await startReaderSession(INGEST_SESSION_ID);

      setIsIngesting(true);
      setIngestProfileId(profileId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setIngestError(msg);
      // Cleanup on error
      ingestUnlistenRefs.current.forEach((unlisten) => unlisten());
      ingestUnlistenRefs.current = [];
    }
  }, [handleIngestComplete, setSourceProfileId]);

  // Stop ingesting
  const handleStopIngest = useCallback(async () => {
    try {
      await stopReaderSession(INGEST_SESSION_ID);
      // The stream-ended event will handle the rest
    } catch (e) {
      console.error("Failed to stop ingest:", e);
      // Force cleanup
      setIsIngesting(false);
      setIngestProfileId(null);
      ingestUnlistenRefs.current.forEach((unlisten) => unlisten());
      ingestUnlistenRefs.current = [];
    }
  }, []);

  // Handle Watch/Ingest from IoReaderPickerDialog
  const handleDialogStartIngest = useCallback(async (
    profileId: string,
    closeDialog: boolean,
    options: IngestOptions
  ) => {
    const {
      speed,
      startTime: optStartTime,
      endTime: optEndTime,
      maxFrames,
      frameIdStartByte,
      frameIdBytes,
      sourceAddressStartByte,
      sourceAddressBytes,
      sourceAddressEndianness,
      minFrameLength,
      // Framing options
      framingEncoding,
      delimiter,
      maxFrameLength,
      emitRawBytes,
    } = options;

    // Debug logging for framing options
    console.log("[handleDialogStartIngest] Framing options:", {
      framingEncoding,
      delimiter,
      maxFrameLength,
      emitRawBytes,
    });

    // Store serial config for TOML export (only if serial-related options are set)
    const hasSerialConfig = frameIdStartByte !== undefined || sourceAddressStartByte !== undefined || minFrameLength !== undefined;
    if (hasSerialConfig) {
      setSerialConfig({
        frame_id_start_byte: frameIdStartByte,
        frame_id_bytes: frameIdBytes,
        source_address_start_byte: sourceAddressStartByte,
        source_address_bytes: sourceAddressBytes,
        source_address_byte_order: sourceAddressEndianness,
        min_frame_length: minFrameLength,
      });
    } else {
      setSerialConfig(null);
    }

    if (closeDialog) {
      // Watch mode - uses discovery session for real-time display
      setWatchFrameCount(0);
      // Clear any stale serial state from previous capture before starting new one
      clearSerialBytes();
      // Reset backend frame count for new stream
      setBackendFrameCount(0);
      // Track original source profile for bookmarks (preserved when switching to buffer mode)
      setSourceProfileId(profileId);

      // Sync framing config with discovery store so the framing button shows correct state
      if (framingEncoding && framingEncoding !== "raw") {
        // Convert dialog framing config to discovery store format
        const storeFramingConfig: import("../../stores/discoverySerialStore").FramingConfig =
          framingEncoding === "slip"
            ? { mode: "slip" }
            : framingEncoding === "modbus_rtu"
            ? { mode: "modbus_rtu", validateCrc: true }
            : {
                mode: "raw",
                delimiter: delimiter ? delimiter.map(b => b.toString(16).toUpperCase().padStart(2, "0")).join("") : "0A",
                maxLength: maxFrameLength ?? 256,
              };
        setFramingConfig(storeFramingConfig);
      } else {
        // No framing - clear the store config
        setFramingConfig(null);
      }

      // IMPORTANT: Call reinitialize BEFORE setIoProfile to avoid race condition.
      // setIoProfile triggers useIOSession's useEffect which creates a session WITHOUT limit.
      // reinitialize creates a session WITH the limit. If we setIoProfile first, the useEffect
      // races with reinitialize and the session without limit wins.
      //
      // reinitialize() uses Rust's atomic check - if other listeners exist,
      // it won't destroy and will return the existing session instead.
      // The backend auto-starts the session after creation.
      await reinitialize(profileId, {
        startTime: optStartTime,
        endTime: optEndTime,
        speed,
        limit: maxFrames,
        frameIdStartByte,
        frameIdBytes,
        sourceAddressStartByte,
        sourceAddressBytes,
        sourceAddressBigEndian: sourceAddressEndianness === "big",
        minFrameLength,
        // Framing options
        framingEncoding,
        delimiter,
        maxFrameLength,
        emitRawBytes,
      });
      // Update ioProfile state AFTER session is created with the correct options
      setIoProfile(profileId);
      setPlaybackSpeed(speed as PlaybackSpeed);

      // Reset no-limit mode if starting at speed 0
      if (speed === 0) {
        resetNoLimitMode();
      }

      setShowIoReaderPickerDialog(false);
    } else {
      // Ingest mode - uses separate session, no real-time display
      // Frames go to backend buffer, view updates when complete
      await handleStartIngest(profileId, options);
      // Keep dialog open to show progress
    }
  }, [setIoProfile, setSourceProfileId, reinitialize, setPlaybackSpeed, resetNoLimitMode, handleStartIngest, setSerialConfig, clearSerialBytes, setFramingConfig]);

  // Handle play/resume button click
  const handlePlay = async () => {
    if (isPaused) {
      await resume();
    } else if (isStreaming) {
      // Already streaming - ignore duplicate start request
      console.log("[Discovery] Ignoring play request - already streaming");
    } else if (!sessionReady) {
      // Session is reinitializing - wait for it to be ready
      console.log("[Discovery] Ignoring play request - session not ready");
    } else {
      // Starting fresh - reset counters and no-limit mode if applicable
      setWatchFrameCount(0);
      if (playbackSpeed === 0) {
        resetNoLimitMode();
      }
      await start();
    }
  };

  // Handle stop button click
  const handleStop = async () => {
    await stop();
  };

  // Detach from shared session without stopping it
  // Keep the profile selected so user can rejoin
  const handleDetach = async () => {
    await leave();
    setIsDetached(true);
  };

  // Rejoin a session after detaching
  const handleRejoin = async () => {
    // Determine which profile to rejoin - prefer source profile if we've transitioned to buffer
    const profileToRejoin = (ioProfile === BUFFER_PROFILE_ID && sourceProfileId)
      ? sourceProfileId
      : ioProfile;

    // If we transitioned to buffer mode while detached, switch back to streaming mode
    if (bufferMode.enabled) {
      disableBufferMode();
    }
    // If ioProfile switched to buffer while detached, restore the source profile
    if (ioProfile === BUFFER_PROFILE_ID && sourceProfileId) {
      setIoProfile(sourceProfileId);
    }

    // Pass the profile ID explicitly since state update hasn't happened yet
    await rejoin(profileToRejoin || undefined);
    setIsDetached(false);
  };

  // Handle pause button click
  const handlePause = async () => {
    await pause();
  };

  // Handle speed change
  const handleSpeedChange = async (speed: number) => {
    // Check if switching from No Limit to a normal speed with frames present
    const isLeavingNoLimit = playbackSpeed === 0 && speed !== 0;
    const hasFrames = frames.length > 0 || frameInfoMap.size > 0;

    if (isLeavingNoLimit && hasFrames) {
      // Show confirmation dialog
      setPendingSpeed(speed as PlaybackSpeed);
      setShowSpeedChangeDialog(true);
      return;
    }

    // No confirmation needed, apply directly
    setPlaybackSpeed(speed as PlaybackSpeed);
    await setSpeed(speed);
  };

  // Confirm speed change (clears frames)
  const confirmSpeedChange = async () => {
    if (pendingSpeed !== null) {
      // Clear discovered frames before changing speed
      clearBuffer();
      clearFramePicker();
      setPlaybackSpeed(pendingSpeed);
      await setSpeed(pendingSpeed);
      setPendingSpeed(null);
    }
    setShowSpeedChangeDialog(false);
  };

  // Cancel speed change
  const cancelSpeedChange = () => {
    setPendingSpeed(null);
    setShowSpeedChangeDialog(false);
  };

  // Handle time range changes
  const handleStartTimeChange = async (time: string) => {
    setStartTime(time);
    setActiveBookmarkId(null); // Clear bookmark when time changes
    await setTimeRange(localToUtc(time), localToUtc(endTime));
  };

  const handleEndTimeChange = async (time: string) => {
    setEndTime(time);
    setActiveBookmarkId(null); // Clear bookmark when time changes
    await setTimeRange(localToUtc(startTime), localToUtc(time));
  };

  // Handle timeline scrubber position change
  const handleScrub = (timeUs: number) => {
    updateCurrentTime(timeUs / 1_000_000); // Convert microseconds to seconds
  };

  // Handle loading a bookmark (sets time range and marks bookmark as active)
  const handleLoadBookmark = async (bookmark: TimeRangeFavorite) => {
    setStartTime(bookmark.startTime);
    setEndTime(bookmark.endTime);
    setActiveBookmarkId(bookmark.id);
    await setTimeRange(localToUtc(bookmark.startTime), localToUtc(bookmark.endTime));
    await markFavoriteUsed(bookmark.id);
  };

  const handleSaveFrames = async () => {
    await saveFrames(decoderDir, saveFrameIdFormat);
  };

  // Handle bookmark button click from DiscoveryFramesView
  const handleBookmark = (frameId: number, timestampUs: number) => {
    setBookmarkFrameId(frameId);
    setBookmarkFrameTime(microsToDatetimeLocal(timestampUs));
    setShowBookmarkDialog(true);
  };

  // Handle saving a bookmark
  // Use sourceProfileId (the original data source) rather than ioProfile (which may be BUFFER_PROFILE_ID)
  const handleSaveBookmark = async (name: string, fromTime: string, toTime: string) => {
    const profileId = sourceProfileId || ioProfile;
    if (!profileId) return;
    await addFavorite(name, profileId, fromTime, toTime);
  };

  // Handle export button click
  const handleExportClick = () => {
    setShowExportDialog(true);
  };

  // Handle export dialog confirm
  const handleExport = async (format: ExportFormat, filename: string) => {
    const dumpDir = settings?.dump_dir ?? "";
    if (!dumpDir) {
      showError("Export Error", "Dump directory not configured", "Please set a dump directory in Settings.");
      return;
    }

    try {
      let content: string | Uint8Array;
      let extension: string;

      if (exportDataMode === "bytes") {
        // Export bytes - prefer backend buffer if available (has all bytes)
        const { exportBytes } = await import("../../utils/frameDump");
        let bytesToExport: { byte: number; timestampUs: number }[];

        if (backendByteCount > 0) {
          // Fetch all bytes from backend buffer
          const response = await getBufferBytesPaginated(0, backendByteCount);
          bytesToExport = response.bytes.map((b: TimestampedByte) => ({
            byte: b.byte,
            timestampUs: b.timestamp_us,
          }));
        } else {
          // Fall back to local store (limited to 10k entries)
          const { useDiscoverySerialStore } = await import("../../stores/discoverySerialStore");
          bytesToExport = useDiscoverySerialStore.getState().serialBytes;
        }

        content = exportBytes(bytesToExport, format);
        extension = format === "hex" ? "hex" : format === "bin" ? "bin" : "csv";
      } else {
        // Export frames
        let framesToExport: FrameMessage[];

        if (bufferMode.enabled) {
          // Fetch all frames from backend buffer
          const response = await getBufferFramesPaginated(0, bufferMode.totalFrames);
          framesToExport = response.frames as FrameMessage[];
        } else if (isSerialMode && framedBufferId && backendFrameCount > 0) {
          // Fetch frames from framed buffer (whether accepted or not)
          // When viewing Framed Data tab, export from the framed buffer
          const { getBufferFramesPaginatedById } = await import("../../api/buffer");
          const response = await getBufferFramesPaginatedById(framedBufferId, 0, backendFrameCount);
          framesToExport = response.frames as FrameMessage[];
        } else if (isSerialMode && framedData.length > 0) {
          // Use local framed data if available (before backend buffer created)
          framesToExport = framedData;
        } else {
          framesToExport = frames;
        }

        const { exportFrames } = await import("../../utils/frameDump");
        content = exportFrames(framesToExport, format);
        extension = format === "csv" ? "csv" : format === "json" ? "json" : "log";
      }

      // Build the full path
      const fullPath = `${dumpDir}/${filename}`;

      // Use pickFileToSave to let user confirm/modify the path
      const selectedPath = await pickFileToSave({
        defaultPath: fullPath,
        filters: [{ name: "Export Files", extensions: [extension] }],
      });

      if (selectedPath) {
        if (content instanceof Uint8Array) {
          // Binary data - convert to string for saving via Tauri command
          // Use Latin-1 encoding to preserve byte values
          const binaryString = Array.from(content).map(b => String.fromCharCode(b)).join('');
          await saveCatalog(selectedPath, binaryString);
        } else {
          // Text data
          await saveCatalog(selectedPath, content);
        }
        setShowExportDialog(false);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      showError("Export Error", "Failed to export", errorMessage);
    }
  };

  // Selection set handlers
  const handleSaveSelectionSet = async () => {
    if (activeSelectionSetId && selectionSetDirty) {
      // Already working with a set - save immediately
      // frameIds = all frame IDs in the picker, selectedIds = those that are selected
      const allFrameIds = Array.from(frameInfoMap.keys());
      const selectedIds = Array.from(selectedFrames);
      await updateSelectionSet(activeSelectionSetId, {
        frameIds: allFrameIds,
        selectedIds: selectedIds,
      });
      setSelectionSetDirty(false);
    } else {
      // No active set - open save dialog
      setShowSaveSelectionSetDialog(true);
    }
  };

  const handleSaveNewSelectionSet = async (name: string) => {
    // frameIds = all frame IDs in the picker, selectedIds = those that are selected
    const allFrameIds = Array.from(frameInfoMap.keys());
    const selectedIds = Array.from(selectedFrames);
    const newSet = await addSelectionSet(name, allFrameIds, selectedIds);
    setActiveSelectionSet(newSet.id);
    setSelectionSetDirty(false);
  };

  const handleLoadSelectionSet = async (selectionSet: SelectionSet) => {
    applySelectionSet(selectionSet);
    await markSelectionSetUsed(selectionSet.id);
  };

  const handleClearSelectionSet = () => {
    setActiveSelectionSet(null);
    setSelectionSetDirty(false);
  };

  // Handle clear discovered frames
  const handleClearDiscoveredFrames = async () => {
    if (isSerialMode) {
      // Clear serial data (frontend state)
      clearSerialBytes();
      resetFraming();
      // Also clear any CAN frames that may have been generated from framing
      clearBuffer();
      clearFramePicker();
      // Clear backend buffers (bytes and framing results)
      await clearBackendBuffer();
      // Switch back to the original device if we were viewing a buffer
      if (ioProfile === BUFFER_PROFILE_ID && sourceProfileId) {
        setIoProfile(sourceProfileId);
        // reinitialize uses Rust's atomic check - safe to call even if profile is in use
        await reinitialize(sourceProfileId);
      }
    } else {
      // Clear CAN frames
      clearBuffer();
      clearFramePicker();
      // Clear backend buffers
      await clearBackendBuffer();
      // Switch back to the original device if we were viewing a buffer
      if (ioProfile === BUFFER_PROFILE_ID && sourceProfileId) {
        setIoProfile(sourceProfileId);
        // reinitialize uses Rust's atomic check - safe to call even if profile is in use
        await reinitialize(sourceProfileId);
      }
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <DiscoveryTopBar
        ioProfiles={settings?.io_profiles || []}
        ioProfile={ioProfile}
        onIoProfileChange={handleIoProfileChange}
        defaultReadProfileId={settings?.default_read_profile}
        bufferMetadata={bufferMetadata}
        isStreaming={isStreaming}
        onStopWatch={handleStop}
        isStopped={isStopped}
        onResume={start}
        joinerCount={joinerCount}
        onDetach={handleDetach}
        isDetached={isDetached}
        onRejoin={handleRejoin}
        frameCount={frameList.length}
        selectedFrameCount={selectedFrames.size}
        onOpenFramePicker={() => setShowFramePickerDialog(true)}
        isSerialMode={isSerialMode}
        serialBytesCount={backendByteCount > 0 ? backendByteCount : serialBytesBuffer.length}
        framingAccepted={framingAccepted}
        serialActiveTab={serialActiveTab}
        showAscii={serialViewConfig.showAscii}
        onToggleAscii={toggleShowAscii}
        onOpenIoReaderPicker={() => setShowIoReaderPickerDialog(true)}
        onSave={openSaveDialog}
        onExport={handleExportClick}
        onClear={handleClearDiscoveredFrames}
        onInfo={openInfoView}
        onOpenToolbox={() => setShowToolboxDialog(true)}
      />

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden m-2">
        {/* Show serial view for serial profiles, otherwise show CAN frames view */}
        {isSerialMode ? (
          <SerialDiscoveryView
            isStreaming={isStreaming}
            displayTimeFormat={displayTimeFormat}
            isRecorded={isRecorded}
          />
        ) : (
          /* Only show frames view when NOT showing progress dialog */
          !noLimitModeShowProgressDialog && (
            <DiscoveryFramesView
              frames={frames}
              protocol={protocolLabel}
              displayFrameIdFormat={displayFrameIdFormat}
              displayTimeFormat={displayTimeFormat}
              onBookmark={isRecorded ? handleBookmark : undefined}
              isStreaming={isStreaming}
              displayTime={displayTime}
              streamStartTimeUs={streamStartTimeUs}
              showTimeRange={showTimeRange}
              startTime={startTime}
              endTime={endTime}
              onStartTimeChange={handleStartTimeChange}
              onEndTimeChange={handleEndTimeChange}
              maxBuffer={maxBuffer}
              onMaxBufferChange={setMaxBuffer}
              currentTimeUs={currentTime !== null ? currentTime * 1_000_000 : null}
              onScrub={handleScrub}
              bufferMetadata={bufferMetadata}
              isRecorded={isRecorded}
            />
          )
        )}
      </div>

      <SaveFramesDialog
        open={showSaveDialog}
        meta={saveMetadata}
        decoderDir={decoderDir}
        knowledgeInterval={knowledge.meta.defaultInterval}
        knowledgeEndianness={knowledge.analysisRun ? knowledge.meta.defaultEndianness : null}
        onChange={updateSaveMetadata}
        onCancel={closeSaveDialog}
        onSave={handleSaveFrames}
      />

      <ErrorDialog
        isOpen={showErrorDialog}
        title={errorDialogTitle}
        message={errorDialogMessage}
        details={errorDialogDetails || undefined}
        onClose={closeErrorDialog}
      />

      <AddBookmarkDialog
        isOpen={showBookmarkDialog}
        frameId={bookmarkFrameId}
        frameTime={bookmarkFrameTime}
        onClose={() => setShowBookmarkDialog(false)}
        onSave={handleSaveBookmark}
      />

      <NoLimitProgressDialog
        isOpen={noLimitModeShowProgressDialog}
        isPaused={isPaused}
        onPause={handlePause}
        onResume={handlePlay}
        onStop={handleStop}
      />

      <AnalysisProgressDialog
        isOpen={toolboxIsRunning}
        frameCount={selectedFrames.size > 0 ? frames.filter(f => selectedFrames.has(f.frame_id)).length : 0}
        toolName={toolboxActiveView === 'changes' ? 'Payload Changes' : toolboxActiveView === 'message-order' ? 'Frame Order' : 'Analysis'}
      />

      <ConfirmDeleteDialog
        open={showSpeedChangeDialog}
        onCancel={cancelSpeedChange}
        onConfirm={confirmSpeedChange}
        title="Change Speed Mode?"
        message={`Switching from "No Limit" mode will clear all ${frames.length.toLocaleString()} discovered frames and ${frameInfoMap.size.toLocaleString()} unique frame IDs.`}
        confirmText="Clear & Switch"
        cancelText="Keep Frames"
      />

      <ExportFramesDialog
        open={showExportDialog}
        itemCount={exportItemCount}
        dataMode={exportDataMode}
        defaultFilename={exportDefaultFilename}
        onCancel={() => setShowExportDialog(false)}
        onExport={handleExport}
      />

      <BookmarkEditorDialog
        isOpen={showBookmarkPicker}
        onClose={() => setShowBookmarkPicker(false)}
        onLoad={handleLoadBookmark}
        profileId={ioProfile}
      />

      <SaveSelectionSetDialog
        isOpen={showSaveSelectionSetDialog}
        frameCount={selectedFrames.size}
        onClose={() => setShowSaveSelectionSetDialog(false)}
        onSave={handleSaveNewSelectionSet}
      />

      <SelectionSetPickerDialog
        isOpen={showSelectionSetPickerDialog}
        onClose={() => setShowSelectionSetPickerDialog(false)}
        onLoad={handleLoadSelectionSet}
        onClear={handleClearSelectionSet}
      />

      <IoReaderPickerDialog
        isOpen={showIoReaderPickerDialog}
        onClose={() => setShowIoReaderPickerDialog(false)}
        ioProfiles={settings?.io_profiles || []}
        selectedId={ioProfile}
        defaultId={settings?.default_read_profile}
        onSelect={handleIoProfileChange}
        onImport={setBufferMetadata}
        bufferMetadata={bufferMetadata}
        defaultDir={settings?.dump_dir}
        isIngesting={isIngesting || isStreaming}
        ingestProfileId={isIngesting ? ingestProfileId : (isStreaming ? ioProfile : null)}
        ingestFrameCount={isIngesting ? ingestFrameCount : watchFrameCount}
        ingestSpeed={playbackSpeed}
        onIngestSpeedChange={(speed) => handleSpeedChange(speed)}
        onStartIngest={handleDialogStartIngest}
        onStopIngest={isIngesting ? handleStopIngest : handleStop}
        ingestError={ingestError}
        onJoinSession={(profileId) => {
          setIoProfile(profileId);
          rejoin();
          setShowIoReaderPickerDialog(false);
        }}
      />

      <FramePickerDialog
        isOpen={showFramePickerDialog}
        onClose={() => setShowFramePickerDialog(false)}
        frames={frameList}
        selectedFrames={selectedFrames}
        onToggleFrame={toggleFrameSelection}
        onBulkSelect={bulkSelectBus}
        displayFrameIdFormat={displayFrameIdFormat}
        onSelectAll={selectAllFrames}
        onDeselectAll={deselectAllFrames}
        activeSelectionSetId={activeSelectionSetId}
        selectionSetDirty={selectionSetDirty}
        onSaveSelectionSet={handleSaveSelectionSet}
        onOpenSelectionSetPicker={() => setShowSelectionSetPickerDialog(true)}
      />

      <ToolboxDialog
        isOpen={showToolboxDialog}
        onClose={() => setShowToolboxDialog(false)}
        selectedCount={selectedFrames.size}
        frameCount={frameList.length}
        isSerialMode={isSerialMode}
        serialFrameCount={backendFrameCount > 0 ? backendFrameCount : (framedData.length + frames.length)}
        serialBytesCount={backendByteCount > 0 ? backendByteCount : serialBytesBuffer.length}
      />

      <DecoderInfoDialog
        isOpen={showInfoView}
        onClose={closeInfoView}
      />
    </div>
  );
}
