// ui/src/apps/decoder/hooks/handlers/useDecoderSessionHandlers.ts
//
// Session-related handlers for Decoder: start ingest, stop watch, detach, rejoin, multi-bus, IO profile change.

import { useCallback } from "react";
import type { PlaybackSpeed } from "../../../../components/TimeController";
import type { IngestOptions } from "../../../../dialogs/IoReaderPickerDialog";
import type { IngestOptions as ManagerIngestOptions } from "../../../../hooks/useIOSessionManager";
import { isBufferProfileId } from "../../../../hooks/useIOSessionManager";
import { useBufferSessionHandler } from "../../../../hooks/useBufferSessionHandler";
import type { BufferMetadata } from "../../../../api/buffer";
import { useDecoderStore } from "../../../../stores/decoderStore";

export interface UseDecoderSessionHandlersParams {
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
  stop: () => Promise<void>;
  leave: () => Promise<void>;

  // Store actions
  setIoProfile: (profileId: string | null) => void;
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  clearFrames: () => void;

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
  startMultiBusSession: (profileIds: string[], options: ManagerIngestOptions) => Promise<void>;
  joinExistingSession: (sessionId: string, sourceProfileIds?: string[]) => Promise<void>;

  // Ingest speed
  ingestSpeed: number;
  setIngestSpeed: (speed: number) => void;

  // Dialog controls
  closeIoReaderPicker: () => void;

  // Playback
  playbackSpeed: PlaybackSpeed;

  // Buffer state (for centralized buffer handler)
  setBufferMetadata: (meta: BufferMetadata | null) => void;
  updateCurrentTime: (timeSeconds: number) => void;
  setCurrentFrameIndex: (index: number) => void;

  // Settings for default speeds
  ioProfiles?: Array<{ id: string; connection?: { default_speed?: string } }>;
}

export function useDecoderSessionHandlers({
  reinitialize,
  stop,
  leave,
  setIoProfile,
  setPlaybackSpeed,
  clearFrames,
  setMultiBusMode,
  setMultiBusProfiles,
  startIngest,
  stopIngest,
  isIngesting,
  isWatching,
  setIsWatching,
  resetWatchFrameCount,
  streamCompletedRef,
  handleDetach,
  handleRejoin,
  startMultiBusSession,
  joinExistingSession,
  ingestSpeed,
  setIngestSpeed,
  closeIoReaderPicker,
  playbackSpeed,
  setBufferMetadata,
  updateCurrentTime,
  setCurrentFrameIndex,
  ioProfiles,
}: UseDecoderSessionHandlersParams) {
  // Centralized buffer session handler
  const { switchToBuffer } = useBufferSessionHandler({
    setBufferMetadata,
    updateCurrentTime,
    setCurrentFrameIndex,
  });

  // Handle Watch for multiple profiles (multi-bus mode)
  // Uses manager's startMultiBusSession which creates a proper Rust-side merged session
  const handleDialogStartMultiIngest = useCallback(
    async (profileIds: string[], closeDialog: boolean, options: IngestOptions) => {
      const { speed } = options;

      if (closeDialog) {
        // Watch mode for multiple buses
        // Clear frames from previous session before starting new one
        clearFrames();
        resetWatchFrameCount();

        try {
          // Read serialConfig directly from store to avoid stale closure issues
          // (catalog may have been loaded after this callback was created)
          const serialConfig = useDecoderStore.getState().serialConfig;

          // Merge catalog serial config with options (catalog config takes precedence for frame ID)
          const mergedOptions: IngestOptions = {
            ...options,
            // Frame ID extraction from catalog
            frameIdStartByte: serialConfig?.frame_id_start_byte,
            frameIdBytes: serialConfig?.frame_id_bytes,
            // Source address extraction from catalog
            sourceAddressStartByte: serialConfig?.source_address_start_byte,
            sourceAddressBytes: serialConfig?.source_address_bytes,
            sourceAddressEndianness: serialConfig?.source_address_byte_order,
            // Min frame length from catalog
            minFrameLength: options.minFrameLength ?? serialConfig?.min_frame_length,
            // Framing encoding from catalog (if not overridden by options)
            framingEncoding: options.framingEncoding ?? serialConfig?.encoding as IngestOptions["framingEncoding"],
          };

          // Use manager's startMultiBusSession - handles all session creation
          await startMultiBusSession(profileIds, mergedOptions);

          setPlaybackSpeed(speed as PlaybackSpeed);
          setIsWatching(true);
          streamCompletedRef.current = false;
          closeIoReaderPicker();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`Failed to start multi-bus session:`, msg);
        }
      }
      // Ingest mode not supported for multi-bus
    },
    [
      clearFrames,
      resetWatchFrameCount,
      startMultiBusSession,
      setPlaybackSpeed,
      setIsWatching,
      streamCompletedRef,
      closeIoReaderPicker,
    ]
  );

  // Handle starting ingest from the dialog - routes to Watch or Ingest mode based on closeDialog flag
  const handleDialogStartIngest = useCallback(
    async (profileId: string, closeDialog: boolean, options: IngestOptions) => {
      const { speed, startTime, endTime, maxFrames } = options;

      // Read serialConfig directly from store to avoid stale closure issues
      // (catalog may have been loaded after this callback was created)
      const serialConfig = useDecoderStore.getState().serialConfig;

      if (closeDialog) {
        // Watch mode - uses decoder session for real-time display
        // Clear frames from previous session before starting new one
        clearFrames();

        // reinitialize() uses Rust's atomic check - if other listeners exist,
        // it won't destroy and will return the existing session instead
        await reinitialize(profileId, {
          startTime,
          endTime,
          speed,
          limit: maxFrames,
          // Framing configuration from catalog
          framingEncoding: serialConfig?.encoding as
            | "slip"
            | "modbus_rtu"
            | "delimiter"
            | "raw"
            | undefined,
          // Frame ID extraction
          frameIdStartByte: serialConfig?.frame_id_start_byte,
          frameIdBytes: serialConfig?.frame_id_bytes,
          frameIdBigEndian: serialConfig?.frame_id_byte_order === "big",
          // Source address extraction
          sourceAddressStartByte: serialConfig?.source_address_start_byte,
          sourceAddressBytes: serialConfig?.source_address_bytes,
          sourceAddressBigEndian: serialConfig?.source_address_byte_order === "big",
          // Other options
          minFrameLength: serialConfig?.min_frame_length,
          emitRawBytes: true, // Emit raw bytes for debugging
        });

        setIoProfile(profileId);
        setPlaybackSpeed(speed as PlaybackSpeed);

        // Now start watching
        // Note: reinitialize() already auto-starts the session via the backend,
        // so we don't need to call start() here. Calling start() with the old
        // effectiveSessionId (before React re-render) would restart the wrong session.
        setIsWatching(true);
        resetWatchFrameCount();
        streamCompletedRef.current = false; // Reset flag when starting playback
        closeIoReaderPicker();
      } else {
        // Ingest mode - uses separate session, no real-time display
        // Update the ingest speed state before starting
        setIngestSpeed(speed);
        await startIngest({
          profileId,
          speed: speed ?? ingestSpeed,
          startTime,
          endTime,
          maxFrames,
          frameIdStartByte: serialConfig?.frame_id_start_byte,
          frameIdBytes: serialConfig?.frame_id_bytes,
          sourceAddressStartByte: serialConfig?.source_address_start_byte,
          sourceAddressBytes: serialConfig?.source_address_bytes,
          sourceAddressBigEndian: serialConfig?.source_address_byte_order === "big",
          minFrameLength: serialConfig?.min_frame_length,
        });
      }
    },
    [
      clearFrames,
      reinitialize,
      setIoProfile,
      setPlaybackSpeed,
      setIsWatching,
      resetWatchFrameCount,
      streamCompletedRef,
      closeIoReaderPicker,
      setIngestSpeed,
      startIngest,
      ingestSpeed,
    ]
  );

  // Handle selecting multiple profiles in multi-bus mode
  // Note: We don't set multiBusMode=true here. Instead, multiBusMode stays false
  // and we create a Rust-side merged session in handleDialogStartMultiIngest.
  const handleSelectMultiple = useCallback(
    (profileIds: string[]) => {
      setMultiBusProfiles(profileIds);
      // Don't set multiBusMode here - let handleDialogStartMultiIngest handle it
      setIoProfile(null); // Clear single profile selection
    },
    [setMultiBusProfiles, setIoProfile]
  );

  // Handle stopping from the dialog - routes to Watch or Ingest stop
  const handleDialogStopIngest = useCallback(async () => {
    if (isWatching) {
      await stop();
      setIsWatching(false);
      // The stream-ended event will handle buffer transition
    } else if (isIngesting) {
      await stopIngest();
    }
  }, [isWatching, isIngesting, stop, stopIngest, setIsWatching]);

  // Watch mode handlers - uses the decoder session for real-time display while buffering
  const handleStopWatch = useCallback(async () => {
    await stop();
    setIsWatching(false);
    // The stream-ended event will handle buffer transition
  }, [stop, setIsWatching]);

  // Note: handleDetach and handleRejoin are provided by useIOSessionManager
  // They are passed through from the parent component

  // Handle IO profile change - only reinitializes for buffer mode
  // For regular profiles, reinitialize is called from handleDialogStartIngest when user clicks Watch
  const handleIoProfileChange = useCallback(
    async (profileId: string | null) => {
      setIoProfile(profileId);

      // Handle buffer selection (buffer_1, buffer_2, etc.) - needs special buffer reader
      if (isBufferProfileId(profileId)) {
        // Use centralized handler to fetch metadata and reset playback state
        await switchToBuffer(profileId!);
        // Create BufferReader session for playback
        await reinitialize(profileId!, { useBuffer: true, speed: playbackSpeed });
      } else if (profileId && ioProfiles) {
        // Set default speed from the selected profile if it has one
        const profile = ioProfiles.find((p) => p.id === profileId);
        if (profile?.connection?.default_speed) {
          const defaultSpeed = parseFloat(profile.connection.default_speed) as PlaybackSpeed;
          setPlaybackSpeed(defaultSpeed);
        }
        // Don't reinitialize here - useIOSession will handle joining
        // and reinitialize is called from handleDialogStartIngest when Watch is clicked
      }
    },
    [setIoProfile, switchToBuffer, reinitialize, playbackSpeed, ioProfiles, setPlaybackSpeed]
  );

  // Handle joining an existing session from IO picker dialog
  const handleJoinSession = useCallback(
    async (profileId: string, sourceProfileIds?: string[]) => {
      // Use manager's joinExistingSession - handles all session joining
      await joinExistingSession(profileId, sourceProfileIds);
      closeIoReaderPicker();
    },
    [joinExistingSession, closeIoReaderPicker]
  );

  // Handle skipping IO picker (continue without reader)
  const handleSkip = useCallback(async () => {
    // Clear multi-bus state if active
    setMultiBusMode(false);
    setMultiBusProfiles([]);
    // Leave the session if watching
    if (isWatching) {
      await leave();
      setIsWatching(false);
    }
    // Clear the profile selection
    setIoProfile(null);
    closeIoReaderPicker();
  }, [setMultiBusMode, setMultiBusProfiles, isWatching, leave, setIsWatching, setIoProfile, closeIoReaderPicker]);

  return {
    handleDialogStartIngest,
    handleDialogStartMultiIngest,
    handleSelectMultiple,
    handleDialogStopIngest,
    handleStopWatch,
    handleDetach,
    handleRejoin,
    handleIoProfileChange,
    handleJoinSession,
    handleSkip,
  };
}

export type DecoderSessionHandlers = ReturnType<typeof useDecoderSessionHandlers>;
