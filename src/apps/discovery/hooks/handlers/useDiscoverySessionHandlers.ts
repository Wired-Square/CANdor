// ui/src/apps/discovery/hooks/handlers/useDiscoverySessionHandlers.ts
//
// Session-related handlers for Discovery: IO profile change, ingest, multi-bus, join session.
// Delegates session orchestration to useIOSessionManager methods; only adds Discovery-specific logic
// (serial config, framing config, buffer cleanup).
// Note: Playback handlers (play/pause/stop/step) are in useDiscoveryPlaybackHandlers.

import { useCallback } from "react";
import type { IngestOptions } from "../../../../dialogs/IoReaderPickerDialog";
import type { IngestOptions as ManagerIngestOptions } from "../../../../hooks/useIOSessionManager";
import { getBufferFrameInfo, setActiveBuffer, type BufferMetadata } from "../../../../api/buffer";
import { isBufferProfileId } from "../../../../hooks/useIOSessionManager";
import { useBufferSession } from "../../../../hooks/useBufferSession";

export interface UseDiscoverySessionHandlersParams {
  // Session actions
  setSourceProfileId: (profileId: string | null) => void;
  setShowBusColumn: (show: boolean) => void;

  // Manager session switching methods
  watchSingleSource: (profileId: string, options: ManagerIngestOptions, reinitializeOptions?: Record<string, unknown>) => Promise<void>;
  watchMultiSource: (profileIds: string[], options: ManagerIngestOptions) => Promise<void>;
  ingestSingleSource: (profileId: string, options: ManagerIngestOptions) => Promise<void>;
  ingestMultiSource: (profileIds: string[], options: ManagerIngestOptions) => Promise<void>;
  selectProfile: (profileId: string | null) => void;
  selectMultipleProfiles: (profileIds: string[]) => void;
  joinSession: (sessionId: string, sourceProfileIds?: string[]) => Promise<void>;

  // Store actions
  updateCurrentTime?: (timeSeconds: number) => void;
  setCurrentFrameIndex?: (index: number) => void;
  setMaxBuffer?: (count: number) => void;
  clearBuffer: () => void;
  clearFramePicker: () => void;
  clearAnalysisResults: () => void;
  enableBufferMode: (count: number) => void;
  disableBufferMode: () => void;
  setFrameInfoFromBuffer: (frameInfo: any[]) => void;
  clearSerialBytes: (preserveCount?: boolean) => void;
  resetFraming: () => void;
  setBackendByteCount: (count: number) => void;
  addSerialBytes: (entries: { byte: number; timestampUs: number }[]) => void;
  setSerialConfig: (config: any) => void;
  setFramingConfig: (config: any) => void;
  showError: (title: string, message: string, details?: string) => void;

  // Buffer state
  setBufferMetadata: (meta: BufferMetadata | null) => void;

  // Dialog controls
  closeIoReaderPicker: () => void;
}

export function useDiscoverySessionHandlers({
  setSourceProfileId,
  setShowBusColumn,
  watchSingleSource,
  watchMultiSource,
  ingestSingleSource,
  ingestMultiSource,
  selectProfile,
  selectMultipleProfiles,
  joinSession,
  updateCurrentTime,
  setCurrentFrameIndex,
  setMaxBuffer,
  clearBuffer,
  clearFramePicker,
  clearAnalysisResults,
  enableBufferMode,
  disableBufferMode,
  setFrameInfoFromBuffer,
  clearSerialBytes,
  resetFraming,
  setBackendByteCount,
  addSerialBytes: _addSerialBytes,
  setSerialConfig,
  setFramingConfig,
  showError,
  setBufferMetadata,
  closeIoReaderPicker,
}: UseDiscoverySessionHandlersParams) {
  void _addSerialBytes; // Reserved for future bytes mode support

  // Centralized buffer session handler with Discovery-specific callbacks
  const { switchToBuffer } = useBufferSession({
    setBufferMetadata,
    updateCurrentTime: updateCurrentTime ?? (() => {}),
    setCurrentFrameIndex: setCurrentFrameIndex ?? (() => {}),
    // Clear previous state before switching
    onBeforeSwitch: () => {
      clearBuffer();
      clearFramePicker();
      clearAnalysisResults();
      disableBufferMode();
      clearSerialBytes();
      resetFraming();
      setBackendByteCount(0);
    },
    // Load frame info after metadata is loaded
    onAfterSwitch: async (meta) => {
      if (!meta || meta.count === 0) return;

      const isFramesMode = meta.buffer_type === "frames";
      const isBytesMode = meta.buffer_type === "bytes";

      if (isBytesMode) {
        // Bytes mode is handled elsewhere for Discovery
        return;
      }

      if (isFramesMode) {
        // Set active buffer so getBufferFrameInfo reads from the correct buffer
        await setActiveBuffer(meta.id);
        enableBufferMode(meta.count);
        setMaxBuffer?.(meta.count);
        try {
          const frameInfoList = await getBufferFrameInfo();
          setFrameInfoFromBuffer(frameInfoList);
        } catch (e) {
          console.error("[DiscoverySessionHandlers] Failed to load frame info:", e);
        }
      }
    },
  });

  // Handle IO profile change - manager handles common logic, app handles buffer/non-buffer cleanup
  const handleIoProfileChange = useCallback(async (profileId: string | null) => {
    console.log(`[DiscoverySessionHandlers] handleIoProfileChange called - profileId=${profileId}`);

    // Manager handles: clear multi-bus, set profile, default speed
    selectProfile(profileId);

    // Check if switching to a buffer session (buffer_1, buffer_2, etc. or legacy __imported_buffer__)
    if (isBufferProfileId(profileId)) {
      await switchToBuffer(profileId!);
    } else {
      // Clear state when switching to non-buffer profile
      clearAnalysisResults();
      clearBuffer();
      clearFramePicker();
      disableBufferMode();
      clearSerialBytes();
      resetFraming();
      setBackendByteCount(0);
    }
  }, [
    selectProfile,
    switchToBuffer,
    clearAnalysisResults,
    clearBuffer,
    clearFramePicker,
    disableBufferMode,
    clearSerialBytes,
    resetFraming,
    setBackendByteCount,
  ]);

  // Handle Watch/Ingest from IoReaderPickerDialog
  const handleDialogStartIngest = useCallback(async (
    profileId: string,
    closeDialog: boolean,
    options: IngestOptions
  ) => {
    console.log(`[DiscoverySessionHandlers] handleDialogStartIngest called - profileId=${profileId}, closeDialog=${closeDialog}`);
    const {
      frameIdStartByte,
      frameIdBytes,
      sourceAddressStartByte,
      sourceAddressBytes,
      sourceAddressEndianness,
      minFrameLength,
      framingEncoding,
      delimiter,
      maxFrameLength,
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
      try {
        console.log(`[DiscoverySessionHandlers] Watch mode - calling watchSingleSource(${profileId})`);

        // Discovery-specific: set source profile ID and sync framing config
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

        // Manager handles: onBeforeWatch cleanup, reinitialize, multi-bus clear, profile set, speed, watch state
        await watchSingleSource(profileId, options, {
          sourceAddressBigEndian: sourceAddressEndianness === "big",
        });

        closeIoReaderPicker();
        console.log(`[DiscoverySessionHandlers] Watch mode - complete`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        showError("Watch Error", "Failed to start watch session", msg);
      }
    } else {
      // Ingest mode - fast ingest without rendering, auto-transitions to buffer reader
      try {
        console.log(`[DiscoverySessionHandlers] Ingest mode - calling ingestSingleSource(${profileId})`);

        // Discovery-specific: set source profile ID
        setSourceProfileId(profileId);

        // Manager handles: pre-ingest cleanup, session creation with speed=0, frame counting, auto-transition
        await ingestSingleSource(profileId, options);

        console.log(`[DiscoverySessionHandlers] Ingest mode - started`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        showError("Ingest Error", "Failed to start ingest", msg);
      }
    }
  }, [
    setSerialConfig,
    setSourceProfileId,
    setFramingConfig,
    watchSingleSource,
    ingestSingleSource,
    closeIoReaderPicker,
    showError,
  ]);

  // Handle Watch/Ingest for multiple profiles (multi-bus mode)
  const handleDialogStartMultiIngest = useCallback(async (
    profileIds: string[],
    closeDialog: boolean,
    options: IngestOptions
  ) => {
    if (closeDialog) {
      // Watch mode
      // Note: cleanup is handled by manager's onBeforeMultiWatch callback
      try {
        // Manager handles: onBeforeMultiWatch cleanup, startMultiBusSession, speed, watch state
        await watchMultiSource(profileIds, options);

        setShowBusColumn(true);
        closeIoReaderPicker();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        showError("Multi-Bus Error", "Failed to start multi-bus session", msg);
      }
    } else {
      // Ingest mode - fast ingest without rendering
      try {
        console.log(`[DiscoverySessionHandlers] Multi-source ingest mode - calling ingestMultiSource`);

        // Manager handles: pre-ingest cleanup, session creation with speed=0, frame counting, auto-transition
        await ingestMultiSource(profileIds, options);

        setShowBusColumn(true);
        console.log(`[DiscoverySessionHandlers] Multi-source ingest mode - started`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        showError("Multi-Bus Ingest Error", "Failed to start multi-bus ingest", msg);
      }
    }
  }, [
    watchMultiSource,
    ingestMultiSource,
    setShowBusColumn,
    closeIoReaderPicker,
    showError,
  ]);

  // Handle selecting multiple profiles in multi-bus mode
  const handleSelectMultiple = useCallback((profileIds: string[]) => {
    selectMultipleProfiles(profileIds);
  }, [selectMultipleProfiles]);

  // Handle joining an existing session from the IO picker dialog
  const handleJoinSession = useCallback(async (
    profileId: string,
    sourceProfileIds?: string[]
  ) => {
    await joinSession(profileId, sourceProfileIds);

    if (sourceProfileIds && sourceProfileIds.length > 1) {
      setShowBusColumn(true);
    }

    closeIoReaderPicker();
  }, [joinSession, setShowBusColumn, closeIoReaderPicker]);

  // Note: handlePlay, handlePlayBackward, handleStop, handlePause, handleStepBackward, handleStepForward
  // are now provided by useDiscoveryPlaybackHandlers (via shared usePlaybackHandlers)

  return {
    handleIoProfileChange,
    handleDialogStartIngest,
    handleDialogStartMultiIngest,
    handleSelectMultiple,
    handleJoinSession,
  };
}

export type DiscoverySessionHandlers = ReturnType<typeof useDiscoverySessionHandlers>;
