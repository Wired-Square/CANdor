// ui/src/stores/sessionStore.ts
//
// Centralized IO session manager for all apps (Discovery, Decoder, Transmit).
// Session lifecycle and listener management is handled by Rust backend.
// This store manages frontend state and event listeners.

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  createIOSession,
  getIOSessionState,
  getIOSessionCapabilities,
  joinReaderSession,
  startReaderSession,
  stopReaderSession,
  pauseReaderSession,
  resumeReaderSession,
  updateReaderSpeed,
  updateReaderTimeRange,
  destroyReaderSession,
  seekReaderSession,
  transitionToBufferReader,
  sessionTransmitFrame,
  registerSessionListener,
  unregisterSessionListener,
  reinitializeSessionIfSafe,
  getStateType,
  parseStateString,
  type IOCapabilities,
  type IOStateType,
  type StreamEndedPayload,
  type StateChangePayload,
  type CanTransmitFrame,
  type TransmitResult,
  type CreateIOSessionOptions,
  type FramingEncoding,
} from "../api/io";
import type { FrameMessage } from "./discoveryStore";

/** Special profile ID used for buffer replay (imported CSV, etc.) */
const BUFFER_PROFILE_ID = "__imported_buffer__";

/** Frame batch payload from Rust - includes active listeners for filtering */
interface FrameBatchPayload {
  frames: FrameMessage[];
  active_listeners: string[];
}

// ============================================================================
// Types
// ============================================================================

/** Session lifecycle state */
export type SessionLifecycleState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/** Individual session entry in the store */
export interface Session {
  /** Unique session ID (e.g., "discovery", "transmit-io_xxx-1234") */
  id: string;
  /** Profile ID this session was created from */
  profileId: string;
  /** Display name for the profile */
  profileName: string;
  /** Current lifecycle state */
  lifecycleState: SessionLifecycleState;
  /** IO state from backend (running/stopped/paused/etc) */
  ioState: IOStateType;
  /** IO capabilities (null until connected) */
  capabilities: IOCapabilities | null;
  /** Error message if lifecycleState is "error" */
  errorMessage: string | null;
  /** Whether this listener was the session owner (created the session) */
  isOwner: boolean;
  /** Number of listeners connected to this session (from Rust backend) */
  listenerCount: number;
  /** Buffer info after stream ends */
  buffer: {
    available: boolean;
    id: string | null;
    type: "frames" | "bytes" | null;
    count: number;
  };
  /** Timestamp when session was created/joined */
  createdAt: number;
  /** Whether session has queued messages (prevents auto-removal from Transmit dropdown) */
  hasQueuedMessages: boolean;
  /** Whether the session was stopped explicitly by user (vs stream ending naturally) */
  stoppedExplicitly: boolean;
}

/** Options for creating a session */
export interface CreateSessionOptions {
  /** Custom session ID (defaults to auto-generated) */
  sessionId?: string;
  /** Join existing session if profile is in use (default: true for single-handle profiles) */
  joinExisting?: boolean;
  /** Only join sessions that produce frames (not raw bytes) */
  requireFrames?: boolean;
  /** Start time for time-range capable readers (ISO-8601) */
  startTime?: string;
  /** End time for time-range capable readers (ISO-8601) */
  endTime?: string;
  /** Initial playback speed */
  speed?: number;
  /** Maximum number of frames to read */
  limit?: number;
  /** File path for file-based readers */
  filePath?: string;
  /** Use the shared buffer reader */
  useBuffer?: boolean;
  /** Framing encoding for serial readers */
  framingEncoding?: FramingEncoding;
  /** Delimiter bytes for delimiter-based framing */
  delimiter?: number[];
  /** Maximum frame length for delimiter-based framing */
  maxFrameLength?: number;
  /** Also emit raw bytes in addition to frames */
  emitRawBytes?: boolean;
  /** Minimum frame length to accept */
  minFrameLength?: number;
}

/** Callbacks for a session - stored per listener in the frontend */
export interface SessionCallbacks {
  onFrames?: (frames: FrameMessage[]) => void;
  onError?: (error: string) => void;
  onTimeUpdate?: (timeUs: number) => void;
  onStreamEnded?: (payload: StreamEndedPayload) => void;
  onStreamComplete?: () => void;
  onStateChange?: (state: IOStateType) => void;
}

/** Session event listeners - one set per session */
interface SessionEventListeners {
  /** Unlisten functions for Tauri events */
  unlistenFunctions: UnlistenFn[];
  /** Callbacks registered by listeners, keyed by listener ID */
  callbacks: Map<string, SessionCallbacks>;
  /** Heartbeat interval ID (for keeping listeners alive in Rust backend) */
  heartbeatIntervalId: ReturnType<typeof setInterval> | null;
  /** Listener IDs that need heartbeats (separate from callbacks for timing) */
  registeredListeners: Set<string>;
}

// ============================================================================
// Store Interface
// ============================================================================

export interface SessionStore {
  // ---- Data ----
  /** All sessions keyed by session ID */
  sessions: Record<string, Session>;
  /** Currently selected session ID for transmission (Transmit app) */
  activeSessionId: string | null;
  /** Event listeners per session (frontend-only, for routing events to callbacks) */
  _eventListeners: Record<string, SessionEventListeners>;

  // ---- Actions: Session Lifecycle ----
  /** Open a session - creates if not exists, joins if exists */
  openSession: (
    profileId: string,
    profileName: string,
    listenerId: string,
    options?: CreateSessionOptions
  ) => Promise<Session>;
  /** Leave a session (unregister listener) */
  leaveSession: (sessionId: string, listenerId: string) => Promise<void>;
  /** Remove session from list entirely */
  removeSession: (sessionId: string) => Promise<void>;
  /** Reinitialize a session with new options (atomic check via Rust) */
  reinitializeSession: (
    sessionId: string,
    listenerId: string,
    profileId: string,
    profileName: string,
    options?: CreateSessionOptions
  ) => Promise<Session>;

  // ---- Actions: Session Control ----
  /** Start streaming on a session */
  startSession: (sessionId: string) => Promise<void>;
  /** Stop streaming on a session */
  stopSession: (sessionId: string) => Promise<void>;
  /** Pause streaming on a session */
  pauseSession: (sessionId: string) => Promise<void>;
  /** Resume streaming on a session */
  resumeSession: (sessionId: string) => Promise<void>;
  /** Update playback speed */
  setSessionSpeed: (sessionId: string, speed: number) => Promise<void>;
  /** Update time range */
  setSessionTimeRange: (
    sessionId: string,
    start?: string,
    end?: string
  ) => Promise<void>;
  /** Seek to timestamp */
  seekSession: (sessionId: string, timestampUs: number) => Promise<void>;
  /** Switch to buffer replay mode */
  switchToBuffer: (sessionId: string, speed?: number) => Promise<void>;

  // ---- Actions: Transmission ----
  /** Transmit a CAN frame through a session */
  transmitFrame: (
    sessionId: string,
    frame: CanTransmitFrame
  ) => Promise<TransmitResult>;
  /** Set the active session for transmission */
  setActiveSession: (sessionId: string | null) => void;
  /** Mark session as having queued messages */
  setHasQueuedMessages: (sessionId: string, hasQueue: boolean) => void;

  // ---- Actions: Callbacks ----
  /** Register callbacks for a listener */
  registerCallbacks: (sessionId: string, listenerId: string, callbacks: SessionCallbacks) => void;
  /** Clear callbacks for a specific listener */
  clearCallbacks: (sessionId: string, listenerId: string) => void;

  // ---- Selectors ----
  /** Get session by ID */
  getSession: (sessionId: string) => Session | undefined;
  /** Get all sessions as array */
  getAllSessions: () => Session[];
  /** Get transmit-capable sessions */
  getTransmitCapableSessions: () => Session[];
  /** Check if profile is in use by any session */
  isProfileInUse: (profileId: string) => boolean;
  /** Get session for a profile (if one exists) */
  getSessionForProfile: (profileId: string) => Session | undefined;
  /** Get sessions for Transmit dropdown (connected + disconnected with queue) */
  getTransmitDropdownSessions: () => Session[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Invoke all callbacks for an event type */
function invokeCallbacks<T>(
  eventListeners: SessionEventListeners,
  eventType: keyof SessionCallbacks,
  payload: T
) {
  for (const [, callbacks] of eventListeners.callbacks.entries()) {
    const cb = callbacks[eventType] as ((arg: T) => void) | undefined;
    if (cb) {
      cb(payload);
    }
  }
}

/** Set up Tauri event listeners for a session */
async function setupSessionEventListeners(
  sessionId: string,
  eventListeners: SessionEventListeners,
  updateSession: (id: string, updates: Partial<Session>) => void
): Promise<UnlistenFn[]> {
  const unlistenFunctions: UnlistenFn[] = [];

  // Frame messages - now includes active_listeners for filtering
  const unlistenFrames = await listen<FrameBatchPayload>(
    `frame-message:${sessionId}`,
    (event) => {
      const { frames, active_listeners } = event.payload;

      // If active_listeners is missing or empty, deliver to all (fallback behavior)
      // Otherwise, only invoke callbacks for listeners in the active list
      const listeners = active_listeners ?? [];
      for (const [listenerId, callbacks] of eventListeners.callbacks.entries()) {
        if (listeners.length === 0 || listeners.includes(listenerId)) {
          if (callbacks.onFrames) {
            callbacks.onFrames(frames);
          }
        }
      }
    }
  );
  unlistenFunctions.push(unlistenFrames);

  // Errors
  const unlistenError = await listen<string>(
    `can-bytes-error:${sessionId}`,
    (event) => {
      const error = event.payload;
      // Don't show error dialog for expected/transient errors
      const isExpectedError =
        error === "No IO profile configured" || error.includes("not found");
      if (!isExpectedError) {
        invokeCallbacks(eventListeners, "onError", error);
      }
      updateSession(sessionId, {
        ioState: "error",
        errorMessage: error,
      });
    }
  );
  unlistenFunctions.push(unlistenError);

  // Playback time (PostgreSQL reader)
  const unlistenPlaybackTime = await listen<number>(
    `playback-time:${sessionId}`,
    (event) => {
      invokeCallbacks(eventListeners, "onTimeUpdate", event.payload);
    }
  );
  unlistenFunctions.push(unlistenPlaybackTime);

  // Stream complete (buffer reader finished)
  const unlistenStreamComplete = await listen<boolean>(
    `stream-complete:${sessionId}`,
    () => {
      updateSession(sessionId, { ioState: "stopped" });
      invokeCallbacks(eventListeners, "onStreamComplete", undefined as never);
    }
  );
  unlistenFunctions.push(unlistenStreamComplete);

  // Stream ended (GVRET disconnect, PostgreSQL complete)
  const unlistenStreamEnded = await listen<StreamEndedPayload>(
    `stream-ended:${sessionId}`,
    (event) => {
      const payload = event.payload;
      updateSession(sessionId, {
        ioState: "stopped",
        buffer: {
          available: payload.buffer_available,
          id: payload.buffer_id,
          type: payload.buffer_type,
          count: payload.count,
        },
      });
      invokeCallbacks(eventListeners, "onStreamEnded", payload);
    }
  );
  unlistenFunctions.push(unlistenStreamEnded);

  // State changes
  const unlistenStateChange = await listen<StateChangePayload>(
    `session-state:${sessionId}`,
    (event) => {
      const newState = parseStateString(event.payload.current);
      const errorMessage =
        newState === "error" && event.payload.current.startsWith("error:")
          ? event.payload.current.slice(6)
          : null;
      updateSession(sessionId, {
        ioState: newState,
        errorMessage,
      });
      invokeCallbacks(eventListeners, "onStateChange", newState);
    }
  );
  unlistenFunctions.push(unlistenStateChange);

  // Listener count changes (from Rust backend)
  const unlistenListenerCount = await listen<number>(
    `joiner-count-changed:${sessionId}`,
    (event) => {
      updateSession(sessionId, { listenerCount: event.payload });
    }
  );
  unlistenFunctions.push(unlistenListenerCount);

  return unlistenFunctions;
}

/** Clean up session event listeners */
function cleanupEventListeners(eventListeners: SessionEventListeners) {
  // Clear heartbeat interval
  if (eventListeners.heartbeatIntervalId) {
    clearInterval(eventListeners.heartbeatIntervalId);
    eventListeners.heartbeatIntervalId = null;
  }

  // Unlisten from Tauri events
  for (const unlisten of eventListeners.unlistenFunctions) {
    unlisten();
  }
  eventListeners.unlistenFunctions = [];
  eventListeners.callbacks.clear();
  eventListeners.registeredListeners.clear();
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useSessionStore = create<SessionStore>((set, get) => ({
  // ---- Initial State ----
  sessions: {},
  activeSessionId: null,
  _eventListeners: {},

  // ---- Session Lifecycle ----
  openSession: async (profileId, profileName, listenerId, options = {}) => {
    // SIMPLIFIED MODEL: Session ID = Profile ID
    const sessionId = profileId;

    // Step 1: Check if we already have this session in our store
    const existingSession = get().sessions[sessionId];
    if (existingSession?.lifecycleState === "connected") {
      // Register this listener with Rust backend
      try {
        const result = await registerSessionListener(sessionId, listenerId);

        // Add listener to heartbeat tracking
        const eventListeners = get()._eventListeners[sessionId];
        if (eventListeners) {
          eventListeners.registeredListeners.add(listenerId);
        }

        // Update session with latest info from Rust
        set((s) => ({
          sessions: {
            ...s.sessions,
            [sessionId]: {
              ...s.sessions[sessionId],
              listenerCount: result.listener_count,
            },
          },
        }));

        return get().sessions[sessionId];
      } catch {
        // Session doesn't exist in backend, will create below
      }
    }

    // Step 2: Check if session exists in backend
    const existingCaps = await getIOSessionCapabilities(sessionId);
    const existingState = await getIOSessionState(sessionId);
    const backendExists = existingCaps && existingState?.type !== "Error";

    // Step 3: Destroy error session if exists
    if (existingCaps && existingState?.type === "Error") {
      try {
        await destroyReaderSession(sessionId);
      } catch {
        // Ignore
      }
    }

    // Step 4: Create or join the backend session
    let capabilities: IOCapabilities;
    let ioState: IOStateType = "stopped";
    let isOwner = true;
    let listenerCount = 1;
    let bufferId: string | null = null;
    let bufferType: "frames" | "bytes" | null = null;

    if (backendExists) {
      // Join existing backend session
      const joinResult = await joinReaderSession(sessionId);
      capabilities = joinResult.capabilities;
      ioState = getStateType(joinResult.state);
      isOwner = false;
      listenerCount = joinResult.joiner_count;
      bufferId = joinResult.buffer_id;
      bufferType = joinResult.buffer_type;

      // Register listener with Rust
      try {
        const regResult = await registerSessionListener(sessionId, listenerId);
        isOwner = regResult.is_owner;
        listenerCount = regResult.listener_count;
      } catch {
        // Ignore - we already joined
      }
    } else {
      // Create new backend session
      // Auto-detect buffer mode from profile ID
      const isBufferMode = profileId === BUFFER_PROFILE_ID || options.useBuffer;

      const createOptions: CreateIOSessionOptions = {
        sessionId,
        profileId: isBufferMode ? undefined : profileId, // Don't pass fake profile ID for buffer mode
        startTime: options.startTime,
        endTime: options.endTime,
        // For buffer mode, default to 1x speed (paced playback) instead of 0 (no pacing)
        speed: options.speed ?? (isBufferMode ? 1.0 : undefined),
        limit: options.limit,
        filePath: options.filePath,
        useBuffer: isBufferMode,
        framingEncoding: options.framingEncoding,
        delimiter: options.delimiter,
        maxFrameLength: options.maxFrameLength,
        emitRawBytes: options.emitRawBytes,
        minFrameLength: options.minFrameLength,
      };

      try {
        capabilities = await createIOSession(createOptions);

        // Backend auto-starts the session, so query the actual state
        const currentState = await getIOSessionState(sessionId);
        if (currentState) {
          ioState = getStateType(currentState);
        }

        // Register as owner listener
        try {
          const regResult = await registerSessionListener(sessionId, listenerId);
          isOwner = regResult.is_owner;
          listenerCount = regResult.listener_count;
        } catch {
          // Ignore
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);

        // If profile is in use, try to join instead
        if (msg.includes("Profile is in use by session")) {
          const joinResult = await joinReaderSession(sessionId);
          capabilities = joinResult.capabilities;
          ioState = getStateType(joinResult.state);
          isOwner = false;
          listenerCount = joinResult.joiner_count;
          bufferId = joinResult.buffer_id;
          bufferType = joinResult.buffer_type;

          // Register listener
          try {
            const regResult = await registerSessionListener(sessionId, listenerId);
            isOwner = regResult.is_owner;
            listenerCount = regResult.listener_count;
          } catch {
            // Ignore
          }
        } else {
          // Create error session entry
          const errorSession: Session = {
            id: sessionId,
            profileId,
            profileName,
            lifecycleState: "error",
            ioState: "error",
            capabilities: null,
            errorMessage: msg,
            isOwner: false,
            listenerCount: 0,
            buffer: { available: false, id: null, type: null, count: 0 },
            createdAt: Date.now(),
            hasQueuedMessages: false,
            stoppedExplicitly: false,
          };
          set((s) => ({
            sessions: { ...s.sessions, [sessionId]: errorSession },
          }));
          throw e;
        }
      }
    }

    // Step 5: Set up event listeners if needed
    // Use a synchronous check-and-set pattern to avoid race conditions
    // where two callers both see no event listeners and both try to create them
    let eventListeners = get()._eventListeners[sessionId];
    if (!eventListeners) {
      // Create the structure first and immediately set it in the store
      // This prevents race conditions where another caller also tries to create
      eventListeners = {
        unlistenFunctions: [],
        callbacks: new Map(),
        heartbeatIntervalId: null,
        registeredListeners: new Set(),
      };

      // Set immediately BEFORE async setup to claim the slot
      set((s) => {
        // Double-check another caller didn't beat us
        if (s._eventListeners[sessionId]) {
          // Someone else created it, use theirs
          eventListeners = s._eventListeners[sessionId];
          return s; // No change needed
        }
        return {
          ...s,
          _eventListeners: { ...s._eventListeners, [sessionId]: eventListeners! },
        };
      });

      // Re-fetch in case another caller won the race
      eventListeners = get()._eventListeners[sessionId]!;

      // Only set up Tauri listeners if we don't have any yet
      if (eventListeners.unlistenFunctions.length === 0) {
        const updateSession = (id: string, updates: Partial<Session>) => {
          set((s) => ({
            sessions: {
              ...s.sessions,
              [id]: s.sessions[id] ? { ...s.sessions[id], ...updates } : s.sessions[id],
            },
          }));
        };

        eventListeners.unlistenFunctions = await setupSessionEventListeners(
          sessionId,
          eventListeners,
          updateSession
        );

        // Start heartbeat interval to keep listeners alive in Rust backend
        // The Rust watchdog removes listeners without heartbeat after 10 seconds
        // We send heartbeats every 5 seconds to stay well within the timeout
        if (!eventListeners.heartbeatIntervalId) {
          const heartbeatSessionId = sessionId;
          eventListeners.heartbeatIntervalId = setInterval(async () => {
            const listeners = get()._eventListeners[heartbeatSessionId];
            if (!listeners || listeners.registeredListeners.size === 0) return;

            // Send heartbeat for each registered listener
            for (const lid of listeners.registeredListeners) {
              try {
                await registerSessionListener(heartbeatSessionId, lid);
              } catch {
                // Ignore heartbeat errors - session may have been destroyed
              }
            }
          }, 5000);
        }
      }
    }

    // Add this listener to the registered listeners set for heartbeat tracking
    const currentEventListeners = get()._eventListeners[sessionId];
    if (currentEventListeners) {
      currentEventListeners.registeredListeners.add(listenerId);
    }

    // Step 6: Create session entry
    // IMPORTANT: Use a function updater to preserve any listenerCount updates
    // that may have occurred via events while we were setting up.
    // The `listenerCount` variable may be stale by now.
    set((s) => {
      // Check if session already exists with a higher listener count
      // (could have been updated by joiner-count-changed event)
      const existingSession = s.sessions[sessionId];
      const currentListenerCount = existingSession?.listenerCount ?? 0;
      const finalListenerCount = Math.max(listenerCount, currentListenerCount);

      const session: Session = {
        id: sessionId,
        profileId,
        profileName,
        lifecycleState: "connected",
        ioState,
        capabilities,
        errorMessage: null,
        isOwner,
        listenerCount: finalListenerCount,
        buffer: {
          available: false,
          id: bufferId,
          type: bufferType,
          count: 0,
        },
        createdAt: existingSession?.createdAt ?? Date.now(),
        hasQueuedMessages: existingSession?.hasQueuedMessages ?? false,
        stoppedExplicitly: existingSession?.stoppedExplicitly ?? false,
      };

      return {
        sessions: { ...s.sessions, [sessionId]: session },
      };
    });

    return get().sessions[sessionId];
  },

  leaveSession: async (sessionId, listenerId) => {
    const eventListeners = get()._eventListeners[sessionId];

    try {
      // Unregister listener from Rust backend
      const remaining = await unregisterSessionListener(sessionId, listenerId);

      // Remove callbacks and registered listener for heartbeats
      if (eventListeners) {
        eventListeners.callbacks.delete(listenerId);
        eventListeners.registeredListeners.delete(listenerId);

        // If no more local callbacks, clean up event listeners
        if (eventListeners.callbacks.size === 0) {
          cleanupEventListeners(eventListeners);

          // NOTE: Don't call leaveReaderSession here - unregisterSessionListener already
          // handles the backend cleanup including stopping the session when no listeners remain.
          // Calling leaveReaderSession would double-decrement joiner_count.

          // Remove from local store only
          set((s) => {
            const { [sessionId]: _, ...remainingSessions } = s.sessions;
            const { [sessionId]: __, ...remainingListeners } = s._eventListeners;
            return {
              sessions: remainingSessions,
              _eventListeners: remainingListeners,
              activeSessionId: s.activeSessionId === sessionId ? null : s.activeSessionId,
            };
          });
        } else {
          // Update listener count
          set((s) => ({
            sessions: {
              ...s.sessions,
              [sessionId]: {
                ...s.sessions[sessionId],
                listenerCount: remaining,
              },
            },
          }));
        }
      }
    } catch {
      // Ignore - session may already be gone
    }
  },

  removeSession: async (sessionId) => {
    const session = get().sessions[sessionId];
    const eventListeners = get()._eventListeners[sessionId];

    if (!session) return;

    // Unregister all local listeners from Rust backend
    if (eventListeners) {
      for (const listenerId of eventListeners.registeredListeners) {
        try {
          await unregisterSessionListener(sessionId, listenerId);
        } catch {
          // Ignore - session may already be gone
        }
      }
      cleanupEventListeners(eventListeners);
    }

    // Destroy session in backend if owner (session should already be stopped by unregister)
    if (session.isOwner) {
      try {
        await destroyReaderSession(sessionId);
      } catch {
        // Ignore
      }
    }
    // Note: Don't call leaveReaderSession - unregisterSessionListener already handles it

    // Remove from store
    set((s) => {
      const { [sessionId]: _, ...remainingSessions } = s.sessions;
      const { [sessionId]: __, ...remainingListeners } = s._eventListeners;
      return {
        sessions: remainingSessions,
        _eventListeners: remainingListeners,
        activeSessionId: s.activeSessionId === sessionId ? null : s.activeSessionId,
      };
    });
  },

  reinitializeSession: async (sessionId, listenerId, profileId, profileName, options) => {
    // Use Rust's atomic reinitialize check
    const result = await reinitializeSessionIfSafe(sessionId, listenerId);

    if (!result.success) {
      // Return existing session - can't reinitialize
      const existing = get().sessions[sessionId];
      if (existing) {
        return existing;
      }
      // If no session exists, create one
      return get().openSession(profileId, profileName, listenerId, options);
    }

    // Clean up local event listeners
    const eventListeners = get()._eventListeners[sessionId];
    if (eventListeners) {
      cleanupEventListeners(eventListeners);
    }

    // Remove from store
    set((s) => {
      const { [sessionId]: _, ...remainingSessions } = s.sessions;
      const { [sessionId]: __, ...remainingListeners } = s._eventListeners;
      return {
        sessions: remainingSessions,
        _eventListeners: remainingListeners,
      };
    });

    // Create new session
    return get().openSession(profileId, profileName, listenerId, options);
  },

  // ---- Session Control ----
  startSession: async (sessionId) => {
    const session = get().sessions[sessionId];
    if (!session || session.lifecycleState !== "connected") {
      throw new Error(`Session ${sessionId} not connected`);
    }

    // Idempotent: don't restart if already running or starting
    if (session.ioState === "running" || session.ioState === "starting") {
      return;
    }

    set((s) => ({
      sessions: {
        ...s.sessions,
        [sessionId]: {
          ...s.sessions[sessionId],
          ioState: "starting",
          stoppedExplicitly: false, // Reset flag when starting
        },
      },
    }));

    try {
      const confirmedState = await startReaderSession(sessionId);
      set((s) => ({
        sessions: {
          ...s.sessions,
          [sessionId]: {
            ...s.sessions[sessionId],
            ioState: getStateType(confirmedState),
            errorMessage: null,
          },
        },
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set((s) => ({
        sessions: {
          ...s.sessions,
          [sessionId]: {
            ...s.sessions[sessionId],
            ioState: "error",
            errorMessage: msg,
          },
        },
      }));
      throw e;
    }
  },

  stopSession: async (sessionId) => {
    try {
      const confirmedState = await stopReaderSession(sessionId);
      set((s) => ({
        sessions: {
          ...s.sessions,
          [sessionId]: {
            ...s.sessions[sessionId],
            ioState: getStateType(confirmedState),
            stoppedExplicitly: true, // User explicitly stopped
          },
        },
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("not found")) {
        throw e;
      }
    }
  },

  pauseSession: async (sessionId) => {
    const confirmedState = await pauseReaderSession(sessionId);
    set((s) => ({
      sessions: {
        ...s.sessions,
        [sessionId]: {
          ...s.sessions[sessionId],
          ioState: getStateType(confirmedState),
        },
      },
    }));
  },

  resumeSession: async (sessionId) => {
    const confirmedState = await resumeReaderSession(sessionId);
    set((s) => ({
      sessions: {
        ...s.sessions,
        [sessionId]: {
          ...s.sessions[sessionId],
          ioState: getStateType(confirmedState),
        },
      },
    }));
  },

  setSessionSpeed: async (sessionId, speed) => {
    await updateReaderSpeed(sessionId, speed);
  },

  setSessionTimeRange: async (sessionId, start, end) => {
    await updateReaderTimeRange(sessionId, start, end);
  },

  seekSession: async (sessionId, timestampUs) => {
    await seekReaderSession(sessionId, timestampUs);
  },

  switchToBuffer: async (sessionId, speed) => {
    const capabilities = await transitionToBufferReader(sessionId, speed);
    set((s) => ({
      sessions: {
        ...s.sessions,
        [sessionId]: {
          ...s.sessions[sessionId],
          capabilities,
          ioState: "stopped",
          buffer: { available: false, id: null, type: null, count: 0 },
        },
      },
    }));
  },

  // ---- Transmission ----
  transmitFrame: async (sessionId, frame) => {
    const session = get().sessions[sessionId];
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    if (!session.capabilities?.can_transmit) {
      throw new Error(`Session ${sessionId} does not support transmission`);
    }
    return sessionTransmitFrame(sessionId, frame);
  },

  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId });
  },

  setHasQueuedMessages: (sessionId, hasQueue) => {
    set((s) => ({
      sessions: {
        ...s.sessions,
        [sessionId]: {
          ...s.sessions[sessionId],
          hasQueuedMessages: hasQueue,
        },
      },
    }));
  },

  // ---- Callbacks ----
  registerCallbacks: (sessionId, listenerId, callbacks) => {
    const eventListeners = get()._eventListeners[sessionId];
    if (eventListeners) {
      eventListeners.callbacks.set(listenerId, callbacks);
    }
  },

  clearCallbacks: (sessionId, listenerId) => {
    const eventListeners = get()._eventListeners[sessionId];
    if (eventListeners) {
      eventListeners.callbacks.delete(listenerId);
    }
  },

  // ---- Selectors ----
  getSession: (sessionId) => get().sessions[sessionId],

  getAllSessions: () => Object.values(get().sessions).filter((s) => s != null),

  getTransmitCapableSessions: () =>
    Object.values(get().sessions).filter(
      (s) =>
        s && s.lifecycleState === "connected" && s.capabilities?.can_transmit === true
    ),

  isProfileInUse: (profileId) =>
    Object.values(get().sessions).some(
      (s) => s && s.profileId === profileId && s.lifecycleState === "connected"
    ),

  getSessionForProfile: (profileId) =>
    Object.values(get().sessions).find(
      (s) => s && s.profileId === profileId && s.lifecycleState === "connected"
    ),

  getTransmitDropdownSessions: () =>
    Object.values(get().sessions).filter(
      (s) =>
        s &&
        ((s.lifecycleState === "connected" &&
          s.capabilities?.can_transmit === true) ||
        (s.lifecycleState === "disconnected" && s.hasQueuedMessages))
    ),
}));

// ============================================================================
// Convenience Hooks
// ============================================================================

/** Get a specific session by ID */
export function useSession(sessionId: string): Session | undefined {
  return useSessionStore((s) => s.sessions[sessionId]);
}

/** Get the active session for transmission */
export function useActiveSession(): Session | undefined {
  return useSessionStore((s) =>
    s.activeSessionId ? s.sessions[s.activeSessionId] : undefined
  );
}

/** Get all sessions as an array */
export function useAllSessions(): Session[] {
  return useSessionStore(
    useShallow((s) => Object.values(s.sessions))
  );
}

/** Get transmit-capable sessions */
export function useTransmitCapableSessions(): Session[] {
  return useSessionStore(
    useShallow((s) =>
      Object.values(s.sessions).filter(
        (session) =>
          session.lifecycleState === "connected" &&
          session.capabilities?.can_transmit === true
      )
    )
  );
}

/** Get sessions for Transmit dropdown */
export function useTransmitDropdownSessions(): Session[] {
  return useSessionStore(
    useShallow((s) =>
      Object.values(s.sessions).filter(
        (session) =>
          (session.lifecycleState === "connected" &&
            session.capabilities?.can_transmit === true) ||
          (session.lifecycleState === "disconnected" && session.hasQueuedMessages)
      )
    )
  );
}
