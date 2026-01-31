// src/api/dbquery.ts
//
// API wrappers for database query commands (Query app).

import { invoke } from "@tauri-apps/api/core";

/** Result of a byte change query */
export interface ByteChangeResult {
  timestamp_us: number;
  old_value: number;
  new_value: number;
}

/** Result of a frame change query */
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

/** Wrapper for byte change query results with stats */
export interface ByteChangeQueryResult {
  results: ByteChangeResult[];
  stats: QueryStats;
}

/** Wrapper for frame change query results with stats */
export interface FrameChangeQueryResult {
  results: FrameChangeResult[];
  stats: QueryStats;
}

/**
 * Query for byte changes in a specific frame.
 *
 * Returns timestamps where the specified byte changed value.
 */
export async function queryByteChanges(
  profileId: string,
  frameId: number,
  byteIndex: number,
  isExtended: boolean,
  startTime?: string,
  endTime?: string,
  limit?: number
): Promise<ByteChangeQueryResult> {
  return invoke("db_query_byte_changes", {
    profileId,
    frameId,
    byteIndex,
    isExtended,
    startTime,
    endTime,
    limit,
  });
}

/**
 * Query for frame payload changes.
 *
 * Returns timestamps where any byte in the frame's payload changed.
 */
export async function queryFrameChanges(
  profileId: string,
  frameId: number,
  isExtended: boolean,
  startTime?: string,
  endTime?: string,
  limit?: number
): Promise<FrameChangeQueryResult> {
  return invoke("db_query_frame_changes", {
    profileId,
    frameId,
    isExtended,
    startTime,
    endTime,
    limit,
  });
}
