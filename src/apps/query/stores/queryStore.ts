// src/apps/query/stores/queryStore.ts
//
// Zustand store for the Query app. Manages query configuration, execution state,
// and results display.

import { create } from "zustand";

/** Available query types */
export type QueryType =
  | "byte_changes"
  | "frame_changes"
  | "first_last"
  | "frequency"
  | "distribution"
  | "gap_analysis"
  | "pattern_search";

/** Query type metadata for UI display */
export const QUERY_TYPE_INFO: Record<QueryType, { label: string; description: string }> = {
  byte_changes: {
    label: "Byte Changes",
    description: "Find when a specific byte in a frame changed value",
  },
  frame_changes: {
    label: "Frame Changes",
    description: "Find when any byte in a frame's payload changed",
  },
  first_last: {
    label: "First/Last Occurrence",
    description: "Find the first or last occurrence of a frame matching a pattern",
  },
  frequency: {
    label: "Frame Frequency",
    description: "Analyse transmission frequency over time",
  },
  distribution: {
    label: "Value Distribution",
    description: "Find all unique values for a byte range",
  },
  gap_analysis: {
    label: "Gap Analysis",
    description: "Find transmission gaps longer than a threshold",
  },
  pattern_search: {
    label: "Pattern Search",
    description: "Search for a byte pattern across all frame IDs",
  },
};

/** A single byte change result */
export interface ByteChangeResult {
  timestamp_us: number;
  old_value: number;
  new_value: number;
}

/** A single frame change result */
export interface FrameChangeResult {
  timestamp_us: number;
  old_payload: number[];
  new_payload: number[];
  changed_indices: number[];
}

/** Query statistics returned with results */
export interface QueryStats {
  /** Number of rows fetched from the database */
  rows_scanned: number;
  /** Number of results after filtering */
  results_count: number;
  /** Query execution time in milliseconds */
  execution_time_ms: number;
}

/** Union type for query results */
export type QueryResult = ByteChangeResult[] | FrameChangeResult[];

/** Query parameters */
export interface QueryParams {
  frameId: number;
  isExtended: boolean;
  byteIndex: number;
  // Time range is managed via session, not here
}

/** Context window configuration for ingesting around events */
export interface ContextWindow {
  beforeMs: number;
  afterMs: number;
}

/** Preset context windows */
export const CONTEXT_PRESETS: { label: string; beforeMs: number; afterMs: number }[] = [
  { label: "±1s", beforeMs: 1000, afterMs: 1000 },
  { label: "±5s", beforeMs: 5000, afterMs: 5000 },
  { label: "±30s", beforeMs: 30000, afterMs: 30000 },
  { label: "±1m", beforeMs: 60000, afterMs: 60000 },
];

interface QueryState {
  // Profile state (synced with session manager)
  ioProfile: string | null;

  // Query configuration
  queryType: QueryType;
  queryParams: QueryParams;

  // Context window for ingest
  contextWindow: ContextWindow;

  // Query execution state
  isRunning: boolean;
  error: string | null;

  // Results
  results: QueryResult | null;
  resultCount: number;
  lastQueryStats: QueryStats | null;

  // Actions
  setIoProfile: (profile: string | null) => void;
  setQueryType: (type: QueryType) => void;
  updateQueryParams: (params: Partial<QueryParams>) => void;
  setContextWindow: (window: ContextWindow) => void;
  setIsRunning: (running: boolean) => void;
  setError: (error: string | null) => void;
  setResults: (results: QueryResult | null, stats?: QueryStats) => void;
  clearResults: () => void;
  reset: () => void;
}

const initialQueryParams: QueryParams = {
  frameId: 0,
  isExtended: false,
  byteIndex: 0,
};

const initialContextWindow: ContextWindow = {
  beforeMs: 5000,
  afterMs: 5000,
};

export const useQueryStore = create<QueryState>((set) => ({
  // Initial state
  ioProfile: null,
  queryType: "byte_changes",
  queryParams: initialQueryParams,
  contextWindow: initialContextWindow,
  isRunning: false,
  error: null,
  results: null,
  resultCount: 0,
  lastQueryStats: null,

  // Actions
  setIoProfile: (profile) => set({ ioProfile: profile }),

  setQueryType: (type) => set({ queryType: type, results: null, resultCount: 0, lastQueryStats: null, error: null }),

  updateQueryParams: (params) =>
    set((state) => ({
      queryParams: { ...state.queryParams, ...params },
    })),

  setContextWindow: (window) => set({ contextWindow: window }),

  setIsRunning: (running) => set({ isRunning: running }),

  setError: (error) => set({ error, isRunning: false }),

  setResults: (results, stats) =>
    set({
      results,
      resultCount: Array.isArray(results) ? results.length : 0,
      lastQueryStats: stats ?? null,
      isRunning: false,
      error: null,
    }),

  clearResults: () => set({ results: null, resultCount: 0, lastQueryStats: null, error: null }),

  reset: () =>
    set({
      queryType: "byte_changes",
      queryParams: initialQueryParams,
      contextWindow: initialContextWindow,
      isRunning: false,
      error: null,
      results: null,
      resultCount: 0,
      lastQueryStats: null,
    }),
}));
