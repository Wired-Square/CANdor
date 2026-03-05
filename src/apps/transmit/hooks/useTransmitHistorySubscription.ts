// src/apps/transmit/hooks/useTransmitHistorySubscription.ts
//
// Subscribes to transmit history events from the backend.
// Handles CAN transmit, serial transmit, and repeat-stopped events.

import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTransmitStore } from "../../../stores/transmitStore";
import type {
  TransmitHistoryEvent,
  SerialTransmitHistoryEvent,
  RepeatStoppedEvent,
  ReplayStartedEvent,
  ReplayProgressEvent,
} from "../../../api/transmit";

interface UseTransmitHistorySubscriptionParams {
  /** Profile name to use in history entries (falls back to session ID) */
  profileName: string | null;
}

/**
 * Subscribes to transmit history events and updates the store.
 *
 * Listens for:
 * - `transmit-history`: CAN frame transmission results
 * - `serial-transmit-history`: Serial byte transmission results
 * - `repeat-stopped`: Notification when a repeating transmission is stopped
 */
export function useTransmitHistorySubscription({
  profileName,
}: UseTransmitHistorySubscriptionParams): void {
  const addHistoryItem = useTransmitStore((s) => s.addHistoryItem);
  const markRepeatStopped = useTransmitStore((s) => s.markRepeatStopped);
  const markReplayStopped = useTransmitStore((s) => s.markReplayStopped);
  const markReplayStarted = useTransmitStore((s) => s.markReplayStarted);
  const updateReplayProgress = useTransmitStore((s) => s.updateReplayProgress);

  useEffect(() => {
    // Replay lifecycle events
    const unlistenReplayStarted = listen<ReplayStartedEvent>(
      "replay-started",
      (event) => {
        const { replay_id, total_frames, speed, loop_replay } = event.payload;
        markReplayStarted(replay_id, total_frames, speed, loop_replay);
      }
    );

    const unlistenReplayProgress = listen<ReplayProgressEvent>(
      "replay-progress",
      (event) => {
        const { replay_id, frames_sent } = event.payload;
        updateReplayProgress(replay_id, frames_sent);
      }
    );

    // CAN transmit history events
    const unlistenCan = listen<TransmitHistoryEvent>(
      "transmit-history",
      (event) => {
        const data = event.payload;
        addHistoryItem({
          timestamp_us: data.timestamp_us,
          profileId: data.session_id,
          profileName: profileName ?? data.session_id,
          type: "can",
          frame: data.frame,
          success: data.success,
          error: data.error,
        });
      }
    );

    // Serial transmit history events
    const unlistenSerial = listen<SerialTransmitHistoryEvent>(
      "serial-transmit-history",
      (event) => {
        const data = event.payload;
        addHistoryItem({
          timestamp_us: data.timestamp_us,
          profileId: data.session_id,
          profileName: profileName ?? data.session_id,
          type: "serial",
          bytes: data.bytes,
          success: data.success,
          error: data.error,
        });
      }
    );

    // Repeat stopped events (due to permanent error or completion)
    const unlistenStopped = listen<RepeatStoppedEvent>(
      "repeat-stopped",
      (event) => {
        const data = event.payload;
        console.warn(
          `[Transmit] Repeat stopped for ${data.queue_id}: ${data.reason}`
        );
        // May be a queue repeat OR a replay — call both handlers (no-op if not applicable)
        markRepeatStopped(data.queue_id);
        markReplayStopped(data.queue_id, data.reason);
      }
    );

    return () => {
      unlistenReplayStarted.then((fn) => fn());
      unlistenReplayProgress.then((fn) => fn());
      unlistenCan.then((fn) => fn());
      unlistenSerial.then((fn) => fn());
      unlistenStopped.then((fn) => fn());
    };
  }, [addHistoryItem, markRepeatStopped, markReplayStopped, markReplayStarted, updateReplayProgress, profileName]);
}
