// ui/src/apps/decoder/hooks/handlers/useDecoderSessionHandlers.ts
//
// Session-related handlers for Decoder: stop watch, IO profile change.
// Dialog handlers (start/stop ingest, join, skip, multi-select) are now
// centralised in useIOPickerHandlers.

import { useCallback } from "react";
import type { PlaybackSpeed } from "../../../../components/TimeController";
import { isBufferProfileId } from "../../../../hooks/useIOSessionManager";
import { useBufferSession } from "../../../../hooks/useBufferSession";
import type { BufferMetadata } from "../../../../api/buffer";

export interface UseDecoderSessionHandlersParams {
  // Session manager actions (for buffer reinitialize only)
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

  // Manager session switching methods
  stopWatch: () => Promise<void>;
  selectProfile: (profileId: string | null) => void;

  // Playback (for buffer reinitialize)
  playbackSpeed: PlaybackSpeed;

  // Buffer state (for centralized buffer handler)
  setBufferMetadata: (meta: BufferMetadata | null) => void;
  updateCurrentTime: (timeSeconds: number) => void;
  setCurrentFrameIndex: (index: number) => void;
}

export function useDecoderSessionHandlers({
  reinitialize,
  stopWatch,
  selectProfile,
  playbackSpeed,
  setBufferMetadata,
  updateCurrentTime,
  setCurrentFrameIndex,
}: UseDecoderSessionHandlersParams) {
  // Centralized buffer session handler
  const { switchToBuffer } = useBufferSession({
    setBufferMetadata,
    updateCurrentTime,
    setCurrentFrameIndex,
  });

  // Watch mode handlers - uses the decoder session for real-time display while buffering
  const handleStopWatch = useCallback(async () => {
    await stopWatch();
    // The stream-ended event will handle buffer transition
  }, [stopWatch]);

  // Handle IO profile change - manager handles common logic, app handles buffer mode
  const handleIoProfileChange = useCallback(
    async (profileId: string | null) => {
      // Manager handles: clear multi-bus, set profile, default speed
      selectProfile(profileId);

      // Buffer profiles need additional setup for playback
      if (isBufferProfileId(profileId)) {
        // Use centralized handler to fetch metadata and reset playback state
        await switchToBuffer(profileId!);
        // Create BufferReader session for playback
        await reinitialize(profileId!, { useBuffer: true, speed: playbackSpeed });
      }
    },
    [selectProfile, switchToBuffer, reinitialize, playbackSpeed]
  );

  return {
    handleStopWatch,
    handleIoProfileChange,
  };
}

export type DecoderSessionHandlers = ReturnType<typeof useDecoderSessionHandlers>;
