// ui/src/hooks/useModbusPollControl.ts
//
// Turning one source's Modbus polling off and on.
//
// Split out of `useModbusPolling` because two apps want the switch and only one
// wants the rest: the Decoder owns a catalogue-derived poll set and has to
// reconnect when it changes, while Discovery only needs the device to stop
// talking so its sweeps can have it.
//
// The state is optimistic. Per-source pause is not reported back anywhere — it
// is absent from `ActiveSessionInfo` — so "is it polling?" is what we last
// successfully asked for, seeded to true because a source starts polling.
//
// Pausing stops requests, not the connection: the socket stays open. That is
// deliberate and it is why a device that serves one Modbus conversation at a
// time still has to be stopped, not merely paused, before a second client can
// reach it.

import { useCallback, useEffect, useState } from "react";
import { pauseSourcePolling, resumeSourcePolling } from "../api/io";
import { tlog } from "../api/settings";

export interface UseModbusPollControlOptions {
  /** The session carrying the source, or null when there is none. */
  sessionId: string | null;
  /** The source profile within that session that per-source pause addresses. */
  profileId: string | null;
}

export interface UseModbusPollControlApi {
  /** Whether polling is currently running (false while paused). */
  isPolling: boolean;
  pausePolling: () => void;
  resumePolling: () => void;
}

export function useModbusPollControl({
  sessionId,
  profileId,
}: UseModbusPollControlOptions): UseModbusPollControlApi {
  const [isPolling, setIsPolling] = useState(true);

  // Follow the source, not the component: a pause applies to one source in one
  // session and does not survive either changing. Without this the flag outlives
  // what it describes — switch to a second Modbus device while the first is
  // paused and the switch would still read "paused" over a device that is
  // polling.
  useEffect(() => {
    setIsPolling(true);
  }, [sessionId, profileId]);

  const pausePolling = useCallback(() => {
    if (!sessionId || !profileId) return;
    pauseSourcePolling(sessionId, profileId)
      .then(() => setIsPolling(false))
      .catch((e: unknown) => tlog.info(`[useModbusPollControl] Pause polling failed: ${e}`));
  }, [sessionId, profileId]);

  const resumePolling = useCallback(() => {
    if (!sessionId || !profileId) return;
    resumeSourcePolling(sessionId, profileId)
      .then(() => setIsPolling(true))
      .catch((e: unknown) => tlog.info(`[useModbusPollControl] Resume polling failed: ${e}`));
  }, [sessionId, profileId]);

  return { isPolling, pausePolling, resumePolling };
}
