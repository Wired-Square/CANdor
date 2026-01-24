// ui/src/apps/discovery/hooks/handlers/useDiscoverySessionHandlers.ts
//
// Session-related handlers for Discovery: start, stop, resume, detach, rejoin, multi-bus, IO profile change.

import { useCallback } from "react";
import type { PlaybackSpeed } from "../../../../stores/discoveryStore";
import type { IngestOptions } from "../../../../dialogs/IoReaderPickerDialog";
import type { BufferMetadata } from "../../../../api/buffer";

export interface UseDiscoverySessionHandlersParams {
  // Session manager state
  isStreaming: boolean;
  isPaused: boolean;
  sessionReady: boolean;

  // Session manager actions
  setMultiBusMode: (mode: boolean) => void;
  setMultiBusProfiles: (profiles: string[]) => void;
  setIoProfile: (profileId: string | null) => void;
  setSourceProfileId: (profileId: string | null) => void;
  setShowBusColumn: (show: boolean) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  reinitialize: (profileId?: string, options?: any) => Promise<void>;

  // Store actions
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
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
  resetWatchFrameCount: () => void;
  showError: (title: string, message: string, details?: string) => void;

  // Detach/rejoin handlers (from manager)
  handleDetach: () => Promise<void>;
  handleRejoin: () => Promise<void>;

  // Multi-bus handlers (from manager)
  startMultiBusSession: (profileIds: string[], options: any) => Promise<void>;
  joinExistingSession: (sessionId: string, sourceProfileIds?: string[]) => Promise<void>;

  // API functions
  getBufferMetadata: () => Promise<BufferMetadata | null>;
  getBufferFrameInfo: () => Promise<any[]>;
  getBufferBytesById: (id: string) => Promise<any[]>;
  setActiveBuffer: (id: string) => Promise<void>;
  setBufferMetadata: (meta: BufferMetadata | null) => void;

  // Dialog controls
  closeIoReaderPicker: () => void;

  // Constants
  BUFFER_PROFILE_ID: string;
}

export function useDiscoverySessionHandlers({
  isStreaming,
  isPaused,
  sessionReady,
  setMultiBusMode,
  setMultiBusProfiles,
  setIoProfile,
  setSourceProfileId,
  setShowBusColumn,
  start,
  stop,
  pause,
  resume,
  reinitialize,
  setPlaybackSpeed,
  clearBuffer,
  clearFramePicker,
  clearAnalysisResults,
  enableBufferMode,
  disableBufferMode,
  setFrameInfoFromBuffer,
  clearSerialBytes,
  resetFraming,
  setBackendByteCount,
  setBackendFrameCount,
  addSerialBytes,
  setSerialConfig,
  setFramingConfig,
  resetWatchFrameCount,
  showError,
  handleDetach,
  handleRejoin,
  startMultiBusSession,
  joinExistingSession,
  getBufferMetadata,
  getBufferFrameInfo,
  getBufferBytesById,
  setActiveBuffer,
  setBufferMetadata,
  closeIoReaderPicker,
  BUFFER_PROFILE_ID,
}: UseDiscoverySessionHandlersParams) {
  // Handle IO profile change
  const handleIoProfileChange = useCallback(async (profileId: string | null) => {
    console.log(`[DiscoverySessionHandlers] handleIoProfileChange called - profileId=${profileId}`);
    setIoProfile(profileId);

    // Clear analysis results when switching readers
    clearAnalysisResults();

    // Clear ALL data when switching readers
    clearBuffer();
    clearFramePicker();
    disableBufferMode();
    clearSerialBytes();
    resetFraming();
    setBackendByteCount(0);

    // Check if switching to the buffer reader
    if (profileId === BUFFER_PROFILE_ID) {
      console.log(`[DiscoverySessionHandlers] Switching to buffer mode`);
      const meta = await getBufferMetadata();
      setBufferMetadata(meta);

      if (meta && meta.count > 0) {
        console.log(`[DiscoverySessionHandlers] Buffer has ${meta.count} items, type=${meta.buffer_type}`);
        if (meta.buffer_type === "bytes") {
          console.log(`[DiscoverySessionHandlers] Bytes mode - loading bytes`);
          await setActiveBuffer(meta.id);
          try {
            const bytes = await getBufferBytesById(meta.id);
            const entries = bytes.map((b: any) => ({
              byte: b.byte,
              timestampUs: b.timestamp_us,
            }));
            addSerialBytes(entries);
            setBackendByteCount(meta.count);
          } catch (e) {
            console.error("Failed to load bytes from buffer:", e);
          }
          console.log(`[DiscoverySessionHandlers] Bytes mode - calling reinitialize(${BUFFER_PROFILE_ID})`);
          // Explicitly pass BUFFER_PROFILE_ID to leave the old session and switch properly
          await reinitialize(BUFFER_PROFILE_ID, { useBuffer: true });
          console.log(`[DiscoverySessionHandlers] Bytes mode - reinitialize complete`);
          // Stop the session immediately - bytes are already loaded into the store, no streaming needed
          console.log(`[DiscoverySessionHandlers] Bytes mode - stopping session (data already loaded)`);
          await stop();
          console.log(`[DiscoverySessionHandlers] Bytes mode - session stopped`);
        } else {
          console.log(`[DiscoverySessionHandlers] Frames mode - calling reinitialize(${BUFFER_PROFILE_ID})`);
          // Explicitly pass BUFFER_PROFILE_ID to avoid stale closure capturing old profile ID
          await reinitialize(BUFFER_PROFILE_ID, { useBuffer: true });
          console.log(`[DiscoverySessionHandlers] Frames mode - reinitialize complete`);

          const BUFFER_MODE_THRESHOLD = 100000;

          if (meta.count > BUFFER_MODE_THRESHOLD) {
            enableBufferMode(meta.count);
            try {
              const frameInfoList = await getBufferFrameInfo();
              setFrameInfoFromBuffer(frameInfoList);
            } catch (e) {
              console.error("Failed to load frame info from buffer:", e);
            }
          } else {
            enableBufferMode(meta.count);
            try {
              const frameInfoList = await getBufferFrameInfo();
              setFrameInfoFromBuffer(frameInfoList);
            } catch (e) {
              console.error("Failed to load frame info from buffer:", e);
            }
          }
        }
      }
    }
  }, [
    setIoProfile,
    clearAnalysisResults,
    clearBuffer,
    clearFramePicker,
    disableBufferMode,
    clearSerialBytes,
    resetFraming,
    setBackendByteCount,
    BUFFER_PROFILE_ID,
    getBufferMetadata,
    setBufferMetadata,
    setActiveBuffer,
    getBufferBytesById,
    addSerialBytes,
    reinitialize,
    stop,
    enableBufferMode,
    getBufferFrameInfo,
    setFrameInfoFromBuffer,
  ]);

  // Handle Watch/Ingest from IoReaderPickerDialog
  const handleDialogStartIngest = useCallback(async (
    profileId: string,
    closeDialog: boolean,
    options: IngestOptions
  ) => {
    console.log(`[DiscoverySessionHandlers] handleDialogStartIngest called - profileId=${profileId}, closeDialog=${closeDialog}`);
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
      framingEncoding,
      delimiter,
      maxFrameLength,
      emitRawBytes,
      busOverride,
    } = options;

    // Store serial config for TOML export
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
      // Watch mode
      console.log(`[DiscoverySessionHandlers] Watch mode - calling reinitialize(${profileId})`);

      // Clear ALL data from previous session before starting new one
      clearBuffer();
      clearFramePicker();
      clearAnalysisResults();
      disableBufferMode();
      resetWatchFrameCount();
      clearSerialBytes();
      resetFraming();
      setBackendByteCount(0);
      setBackendFrameCount(0);
      setSourceProfileId(profileId);

      // Sync framing config with discovery store
      if (framingEncoding && framingEncoding !== "raw") {
        const storeFramingConfig =
          framingEncoding === "slip"
            ? { mode: "slip" as const }
            : framingEncoding === "modbus_rtu"
            ? { mode: "modbus_rtu" as const, validateCrc: true }
            : {
                mode: "raw" as const,
                delimiter: delimiter ? delimiter.map((b: number) => b.toString(16).toUpperCase().padStart(2, "0")).join("") : "0A",
                maxLength: maxFrameLength ?? 256,
              };
        setFramingConfig(storeFramingConfig);
      } else {
        setFramingConfig(null);
      }

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
        framingEncoding,
        delimiter,
        maxFrameLength,
        emitRawBytes,
        busOverride,
      });
      console.log(`[DiscoverySessionHandlers] Watch mode - reinitialize complete`);

      setIoProfile(profileId);
      setPlaybackSpeed(speed as PlaybackSpeed);
      setMultiBusMode(false);
      setMultiBusProfiles([]);

      closeIoReaderPicker();
      console.log(`[DiscoverySessionHandlers] Watch mode - complete`);
    }
    // Ingest mode is handled by useIOSessionManager via startIngest
  }, [
    clearBuffer,
    clearFramePicker,
    clearAnalysisResults,
    disableBufferMode,
    resetWatchFrameCount,
    clearSerialBytes,
    resetFraming,
    setBackendByteCount,
    setBackendFrameCount,
    setSourceProfileId,
    setSerialConfig,
    setFramingConfig,
    reinitialize,
    setIoProfile,
    setPlaybackSpeed,
    setMultiBusMode,
    setMultiBusProfiles,
    closeIoReaderPicker,
  ]);

  // Handle Watch/Ingest for multiple profiles (multi-bus mode)
  // Uses manager's startMultiBusSession which creates a proper Rust-side merged session
  const handleDialogStartMultiIngest = useCallback(async (
    profileIds: string[],
    closeDialog: boolean,
    options: IngestOptions
  ) => {
    const { speed } = options;

    if (closeDialog) {
      // Clear ALL data from previous session before starting new one
      clearBuffer();
      clearFramePicker();
      clearAnalysisResults();
      disableBufferMode();
      resetWatchFrameCount();
      clearSerialBytes();
      resetFraming();
      setBackendByteCount(0);
      setBackendFrameCount(0);

      try {
        // Use manager's startMultiBusSession - handles all session creation
        await startMultiBusSession(profileIds, options);

        setShowBusColumn(true);
        setPlaybackSpeed(speed as PlaybackSpeed);
        closeIoReaderPicker();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        showError("Multi-Bus Error", "Failed to start multi-bus session", msg);
      }
    }
  }, [
    clearBuffer,
    clearFramePicker,
    clearAnalysisResults,
    disableBufferMode,
    resetWatchFrameCount,
    clearSerialBytes,
    resetFraming,
    setBackendByteCount,
    setBackendFrameCount,
    startMultiBusSession,
    setShowBusColumn,
    setPlaybackSpeed,
    closeIoReaderPicker,
    showError,
  ]);

  // Handle selecting multiple profiles in multi-bus mode
  const handleSelectMultiple = useCallback((profileIds: string[]) => {
    setMultiBusProfiles(profileIds);
    setIoProfile(null);
  }, [setMultiBusProfiles, setIoProfile]);

  // Handle play/resume button click
  const handlePlay = useCallback(async () => {
    console.log(`[DiscoverySessionHandlers] handlePlay - isPaused=${isPaused}, isStreaming=${isStreaming}, sessionReady=${sessionReady}`);
    if (isPaused) {
      console.log(`[DiscoverySessionHandlers] handlePlay - resuming...`);
      await resume();
      console.log(`[DiscoverySessionHandlers] handlePlay - resume complete`);
    } else if (isStreaming) {
      console.log("[DiscoverySessionHandlers] Ignoring play request - already streaming");
    } else if (!sessionReady) {
      console.log("[DiscoverySessionHandlers] Ignoring play request - session not ready");
    } else {
      console.log(`[DiscoverySessionHandlers] handlePlay - starting...`);
      resetWatchFrameCount();
      await start();
      console.log(`[DiscoverySessionHandlers] handlePlay - start complete`);
    }
  }, [isPaused, isStreaming, sessionReady, resume, start, resetWatchFrameCount]);

  // Handle stop button click
  const handleStop = useCallback(async () => {
    console.log(`[DiscoverySessionHandlers] handleStop - calling stop...`);
    await stop();
    console.log(`[DiscoverySessionHandlers] handleStop - stop complete`);
  }, [stop]);

  // Note: handleDetach and handleRejoin are provided by useIOSessionManager
  // They are passed through from the parent component

  // Handle pause button click
  const handlePause = useCallback(async () => {
    await pause();
  }, [pause]);

  // Handle joining an existing session from the IO picker dialog
  const handleJoinSession = useCallback(async (
    profileId: string,
    sourceProfileIds?: string[]
  ) => {
    // Use manager's joinExistingSession - handles all session joining
    await joinExistingSession(profileId, sourceProfileIds);

    if (sourceProfileIds && sourceProfileIds.length > 1) {
      setShowBusColumn(true);
    }

    closeIoReaderPicker();
  }, [joinExistingSession, setShowBusColumn, closeIoReaderPicker]);

  return {
    handleIoProfileChange,
    handleDialogStartIngest,
    handleDialogStartMultiIngest,
    handleSelectMultiple,
    handlePlay,
    handleStop,
    handleDetach,
    handleRejoin,
    handlePause,
    handleJoinSession,
  };
}

export type DiscoverySessionHandlers = ReturnType<typeof useDiscoverySessionHandlers>;
