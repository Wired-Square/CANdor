// src/apps/session-manager/hooks/useSessionLogSubscription.ts
//
// Hook that subscribes to session events and logs them to sessionLogStore.
// Sets up Tauri event listeners for each active session and watches
// sessionStore for session lifecycle changes.

import { useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useSessionStore } from "../../../stores/sessionStore";
import { useSessionLogStore } from "../stores/sessionLogStore";
import type {
  StreamEndedPayload,
  SessionSuspendedPayload,
  SessionResumingPayload,
} from "../../../api/io";

/** Payload for session-reconfigured event */
interface SessionReconfiguredPayload {
  start: string | null;
  end: string | null;
}

/**
 * Hook that subscribes to session events and logs them.
 * Should be called once in the SessionManager component.
 */
export function useSessionLogSubscription(): void {
  // Track which sessions we have listeners for
  const activeListenersRef = useRef<Map<string, UnlistenFn[]>>(new Map());

  const addEntry = useSessionLogStore((s) => s.addEntry);

  useEffect(() => {
    // Subscribe to sessionStore changes
    const unsubscribe = useSessionStore.subscribe((state, prevState) => {
      const currentSessions = state.sessions;
      const previousSessions = prevState.sessions;

      // Detect new sessions
      for (const sessionId of Object.keys(currentSessions)) {
        if (!previousSessions[sessionId]) {
          const session = currentSessions[sessionId];
          addEntry({
            eventType: "session-created",
            sessionId,
            profileId: session.profileId,
            profileName: session.profileName,
            appName: null,
            details: `Session created for ${session.profileName} (${session.ioState})`,
          });

          // Set up Tauri event listeners for this session
          setupSessionListeners(sessionId, addEntry, activeListenersRef.current);
        }
      }

      // Detect removed sessions
      for (const sessionId of Object.keys(previousSessions)) {
        if (!currentSessions[sessionId]) {
          const session = previousSessions[sessionId];
          addEntry({
            eventType: "session-destroyed",
            sessionId,
            profileId: session.profileId,
            profileName: session.profileName,
            appName: null,
            details: `Session destroyed`,
          });

          // Clean up Tauri event listeners
          cleanupSessionListeners(sessionId, activeListenersRef.current);
        }
      }

      // Detect state changes for existing sessions
      for (const sessionId of Object.keys(currentSessions)) {
        const current = currentSessions[sessionId];
        const previous = previousSessions[sessionId];
        if (previous && current.ioState !== previous.ioState) {
          addEntry({
            eventType: "state-change",
            sessionId,
            profileId: current.profileId,
            profileName: current.profileName,
            appName: null,
            details: `State: ${previous.ioState} → ${current.ioState}`,
          });
        }

        // Detect listener count changes
        if (previous && current.listenerCount !== previous.listenerCount) {
          addEntry({
            eventType: "listener-count-changed",
            sessionId,
            profileId: current.profileId,
            profileName: current.profileName,
            appName: null,
            details: `Listeners: ${previous.listenerCount} → ${current.listenerCount}`,
          });
        }
      }
    });

    // Set up initial listeners for existing sessions
    const sessions = useSessionStore.getState().sessions;
    for (const sessionId of Object.keys(sessions)) {
      setupSessionListeners(sessionId, addEntry, activeListenersRef.current);
    }

    return () => {
      unsubscribe();
      // Clean up all listeners
      for (const sessionId of activeListenersRef.current.keys()) {
        cleanupSessionListeners(sessionId, activeListenersRef.current);
      }
    };
  }, [addEntry]);
}

/**
 * Set up Tauri event listeners for a session.
 */
async function setupSessionListeners(
  sessionId: string,
  addEntry: ReturnType<typeof useSessionLogStore.getState>["addEntry"],
  listenersMap: Map<string, UnlistenFn[]>
): Promise<void> {
  // Don't set up duplicate listeners
  if (listenersMap.has(sessionId)) {
    return;
  }

  const unlistenFunctions: UnlistenFn[] = [];

  try {
    // Session errors
    const unlistenError = await listen<string>(
      `session-error:${sessionId}`,
      (event) => {
        addEntry({
          eventType: "session-error",
          sessionId,
          profileId: null,
          profileName: null,
          appName: null,
          details: event.payload,
        });
      }
    );
    unlistenFunctions.push(unlistenError);

    // Stream ended
    const unlistenStreamEnded = await listen<StreamEndedPayload>(
      `stream-ended:${sessionId}`,
      (event) => {
        const p = event.payload;
        addEntry({
          eventType: "stream-ended",
          sessionId,
          profileId: null,
          profileName: null,
          appName: null,
          details: `Reason: ${p.reason}, buffer: ${p.buffer_available ? `${p.count} items` : "none"}`,
        });
      }
    );
    unlistenFunctions.push(unlistenStreamEnded);

    // Stream complete
    const unlistenStreamComplete = await listen<boolean>(
      `stream-complete:${sessionId}`,
      () => {
        addEntry({
          eventType: "stream-complete",
          sessionId,
          profileId: null,
          profileName: null,
          appName: null,
          details: "Stream completed naturally",
        });
      }
    );
    unlistenFunctions.push(unlistenStreamComplete);

    // Speed changed
    const unlistenSpeedChange = await listen<number>(
      `speed-changed:${sessionId}`,
      (event) => {
        addEntry({
          eventType: "speed-changed",
          sessionId,
          profileId: null,
          profileName: null,
          appName: null,
          details: `Speed: ${event.payload}x`,
        });
      }
    );
    unlistenFunctions.push(unlistenSpeedChange);

    // Session suspended
    const unlistenSuspended = await listen<SessionSuspendedPayload>(
      `session-suspended:${sessionId}`,
      (event) => {
        const p = event.payload;
        addEntry({
          eventType: "session-suspended",
          sessionId,
          profileId: null,
          profileName: null,
          appName: null,
          details: `Buffer: ${p.buffer_count} ${p.buffer_type ?? "items"}`,
        });
      }
    );
    unlistenFunctions.push(unlistenSuspended);

    // Session resuming
    const unlistenResuming = await listen<SessionResumingPayload>(
      `session-resuming:${sessionId}`,
      (event) => {
        const p = event.payload;
        addEntry({
          eventType: "session-resuming",
          sessionId,
          profileId: null,
          profileName: null,
          appName: null,
          details: `New buffer: ${p.new_buffer_id}${p.orphaned_buffer_id ? `, orphaned: ${p.orphaned_buffer_id}` : ""}`,
        });
      }
    );
    unlistenFunctions.push(unlistenResuming);

    // Session reconfigured
    const unlistenReconfigured = await listen<SessionReconfiguredPayload>(
      `session-reconfigured:${sessionId}`,
      (event) => {
        const p = event.payload;
        addEntry({
          eventType: "session-reconfigured",
          sessionId,
          profileId: null,
          profileName: null,
          appName: null,
          details: `Time range: ${p.start ?? "start"} → ${p.end ?? "end"}`,
        });
      }
    );
    unlistenFunctions.push(unlistenReconfigured);

    listenersMap.set(sessionId, unlistenFunctions);
  } catch (error) {
    // Clean up any listeners that were set up before the error
    for (const unlisten of unlistenFunctions) {
      unlisten();
    }
    console.error(`[SessionLog] Failed to set up listeners for ${sessionId}:`, error);
  }
}

/**
 * Clean up Tauri event listeners for a session.
 */
function cleanupSessionListeners(
  sessionId: string,
  listenersMap: Map<string, UnlistenFn[]>
): void {
  const unlistenFunctions = listenersMap.get(sessionId);
  if (unlistenFunctions) {
    for (const unlisten of unlistenFunctions) {
      unlisten();
    }
    listenersMap.delete(sessionId);
  }
}
