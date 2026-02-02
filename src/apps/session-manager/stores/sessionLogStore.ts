// src/apps/session-manager/stores/sessionLogStore.ts
//
// Zustand store for session log entries. Collects session lifecycle events,
// state changes, and app interactions for development debugging.

import { create } from "zustand";
import { nanoid } from "nanoid";

// ============================================================================
// Types
// ============================================================================

/** Event types that can be logged */
export type SessionLogEventType =
  | "session-created"
  | "session-joined"
  | "session-left"
  | "session-destroyed"
  | "state-change"
  | "stream-ended"
  | "stream-complete"
  | "session-error"
  | "listener-count-changed"
  | "speed-changed"
  | "session-suspended"
  | "session-resuming"
  | "session-reconfigured";

/** A single log entry */
export interface LogEntry {
  /** Unique ID */
  id: string;
  /** Timestamp (epoch ms) */
  timestamp: number;
  /** Event type */
  eventType: SessionLogEventType;
  /** Session ID (null for global events) */
  sessionId: string | null;
  /** Profile ID */
  profileId: string | null;
  /** Profile display name */
  profileName: string | null;
  /** App/listener name */
  appName: string | null;
  /** Human-readable details */
  details: string;
}

/** Filter configuration */
export interface LogFilter {
  /** Filter to specific event types (null = show all) */
  eventTypes: Set<SessionLogEventType> | null;
  /** Filter to specific session ID */
  sessionId: string | null;
  /** Search text in details */
  searchText: string;
}

/** Store state */
export interface SessionLogState {
  // Data
  entries: LogEntry[];
  maxEntries: number;

  // UI
  filter: LogFilter;
  autoScroll: boolean;

  // Actions
  addEntry: (entry: Omit<LogEntry, "id" | "timestamp">) => void;
  clearEntries: () => void;
  setFilter: (filter: Partial<LogFilter>) => void;
  setMaxEntries: (max: number) => void;
  setAutoScroll: (enabled: boolean) => void;
}

// ============================================================================
// Store
// ============================================================================

export const useSessionLogStore = create<SessionLogState>((set) => ({
  // Initial state
  entries: [],
  maxEntries: 500,
  filter: {
    eventTypes: null,
    sessionId: null,
    searchText: "",
  },
  autoScroll: true,

  // Actions
  addEntry: (entry) => {
    const newEntry: LogEntry = {
      ...entry,
      id: nanoid(8),
      timestamp: Date.now(),
    };

    set((state) => {
      const entries = [...state.entries, newEntry];
      // Trim to max entries
      if (entries.length > state.maxEntries) {
        entries.splice(0, entries.length - state.maxEntries);
      }
      return { entries };
    });
  },

  clearEntries: () => set({ entries: [] }),

  setFilter: (filterUpdate) =>
    set((state) => ({
      filter: { ...state.filter, ...filterUpdate },
    })),

  setMaxEntries: (max) => {
    set((state) => {
      const entries = state.entries.slice(-max);
      return { maxEntries: max, entries };
    });
  },

  setAutoScroll: (enabled) => set({ autoScroll: enabled }),
}));

// ============================================================================
// Selectors
// ============================================================================

/** Get filtered entries based on current filter settings */
export function useFilteredEntries(): LogEntry[] {
  const entries = useSessionLogStore((s) => s.entries);
  const filter = useSessionLogStore((s) => s.filter);

  return entries.filter((entry) => {
    // Event type filter
    if (filter.eventTypes && !filter.eventTypes.has(entry.eventType)) {
      return false;
    }

    // Session ID filter
    if (filter.sessionId && entry.sessionId !== filter.sessionId) {
      return false;
    }

    // Search text filter
    if (filter.searchText) {
      const searchLower = filter.searchText.toLowerCase();
      const matchesDetails = entry.details.toLowerCase().includes(searchLower);
      const matchesSession = entry.sessionId?.toLowerCase().includes(searchLower);
      const matchesProfile = entry.profileName?.toLowerCase().includes(searchLower);
      const matchesApp = entry.appName?.toLowerCase().includes(searchLower);
      if (!matchesDetails && !matchesSession && !matchesProfile && !matchesApp) {
        return false;
      }
    }

    return true;
  });
}

/** Get unique session IDs from entries (for filter dropdown) */
export function useUniqueSessionIds(): string[] {
  const entries = useSessionLogStore((s) => s.entries);
  const sessionIds = new Set<string>();
  for (const entry of entries) {
    if (entry.sessionId) {
      sessionIds.add(entry.sessionId);
    }
  }
  return Array.from(sessionIds).sort();
}

// ============================================================================
// Event Type Labels and Colours
// ============================================================================

/** Human-readable labels for event types */
export const EVENT_TYPE_LABELS: Record<SessionLogEventType, string> = {
  "session-created": "Created",
  "session-joined": "Joined",
  "session-left": "Left",
  "session-destroyed": "Destroyed",
  "state-change": "State",
  "stream-ended": "Ended",
  "stream-complete": "Complete",
  "session-error": "Error",
  "listener-count-changed": "Listeners",
  "speed-changed": "Speed",
  "session-suspended": "Suspended",
  "session-resuming": "Resuming",
  "session-reconfigured": "Reconfigured",
};

/** Colour classes for event type badges (using CSS variables) */
export const EVENT_TYPE_COLOURS: Record<SessionLogEventType, string> = {
  "session-created": "bg-[var(--bg-success)] text-[color:var(--text-success)]",
  "session-joined": "bg-[var(--bg-info)] text-[color:var(--text-info)]",
  "session-left": "bg-[var(--bg-warning)] text-[color:var(--text-warning)]",
  "session-destroyed": "bg-[var(--bg-danger)] text-[color:var(--text-danger)]",
  "state-change": "bg-[var(--bg-info)] text-[color:var(--text-info)]",
  "stream-ended": "bg-[var(--bg-warning)] text-[color:var(--text-warning)]",
  "stream-complete": "bg-[var(--bg-success)] text-[color:var(--text-success)]",
  "session-error": "bg-[var(--bg-danger)] text-[color:var(--text-danger)]",
  "listener-count-changed": "bg-[var(--bg-info)] text-[color:var(--text-info)]",
  "speed-changed": "bg-[var(--bg-info)] text-[color:var(--text-info)]",
  "session-suspended": "bg-[var(--bg-warning)] text-[color:var(--text-warning)]",
  "session-resuming": "bg-[var(--bg-success)] text-[color:var(--text-success)]",
  "session-reconfigured": "bg-[var(--bg-info)] text-[color:var(--text-info)]",
};

/** All event types for filter dropdown */
export const ALL_EVENT_TYPES: SessionLogEventType[] = [
  "session-created",
  "session-joined",
  "session-left",
  "session-destroyed",
  "state-change",
  "stream-ended",
  "stream-complete",
  "session-error",
  "listener-count-changed",
  "speed-changed",
  "session-suspended",
  "session-resuming",
  "session-reconfigured",
];
