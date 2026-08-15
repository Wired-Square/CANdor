// Page-size sentinels shared by every paginated data view.
//
// The rows-per-page <select> is numeric — its value is read back with
// `Number(e.target.value)` — so the non-numeric modes have to travel as sentinels.
// Views hold the *raw* setting (so the select can match an option) and pass the
// *resolved* row count to their data layer; `resolvePageSize` is the only place that
// knows how to get from one to the other.

/** Fit the page to the height available, measured at runtime. */
export const PAGE_SIZE_AUTO = -2;

/** Show every row in one page. */
export const PAGE_SIZE_ALL = -1;

/** Rows per page when a view has no better answer. */
export const DEFAULT_PAGE_SIZE = 20;

/** Cap for `All` — bounded so a stray sentinel can't request an unbounded page. */
export const ALL_FALLBACK_ROWS = 1000;

export const isAutoPageSize = (value: number): boolean => value === PAGE_SIZE_AUTO;

/**
 * Turn a page-size setting into a concrete row count.
 *
 * `autoRows` is the measured fit from `useAutoRowCount`, where **0 means "not measured
 * yet"** — that zero is passed straight through so callers can guard on
 * `resolved <= 0` and skip the fetch rather than requesting an arbitrary page at mount
 * and replacing it a frame later.
 */
export function resolvePageSize(
  setting: number,
  autoRows: number,
  /** Real total for `All`; omit and it falls back to a bounded cap. */
  allRows?: number,
): number {
  if (setting === PAGE_SIZE_AUTO) return autoRows;
  if (setting === PAGE_SIZE_ALL) return Math.max(1, allRows ?? ALL_FALLBACK_ROWS);
  return setting > 0 ? setting : DEFAULT_PAGE_SIZE;
}
