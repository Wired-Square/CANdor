// ui/src/utils/muxCaseMatch.ts

/**
 * Mux case matching utilities.
 *
 * Supports three formats for mux case keys:
 * 1. Single value: "0", "5", "255"
 * 2. Range: "0-3" (matches 0, 1, 2, 3)
 * 3. Comma-separated: "1,2,5" (matches 1, 2, or 5)
 * 4. Combined: "0-3,7,10-12" (matches 0, 1, 2, 3, 7, 10, 11, 12)
 */

/**
 * A parsed mux case pattern that can match against selector values.
 */
export type MuxCasePattern = {
  /** Original key string from TOML (e.g., "0-3" or "1,2,5") */
  key: string;
  /** Set of individual values this pattern matches */
  values: Set<number>;
};

/**
 * Reserved mux keys that are not case values.
 */
const RESERVED_MUX_KEYS = new Set(["name", "start_bit", "bit_length", "default"]);

/**
 * Check if a string is a valid mux case key (not a reserved key).
 */
export function isMuxCaseKey(key: string): boolean {
  return !RESERVED_MUX_KEYS.has(key);
}

/**
 * Parse a mux case key string into a set of matching values.
 *
 * Supports:
 * - Single numeric values: "0", "5", "255"
 * - Ranges: "0-3" expands to [0, 1, 2, 3]
 * - Comma-separated: "1,2,5" expands to [1, 2, 5]
 * - Combined: "0-3,7,10-12" expands to [0, 1, 2, 3, 7, 10, 11, 12]
 *
 * @param key - The mux case key string from TOML
 * @returns A MuxCasePattern with the original key and set of matching values,
 *          or null if the key is not a valid mux case pattern
 */
export function parseMuxCaseKey(key: string): MuxCasePattern | null {
  // Skip reserved keys
  if (RESERVED_MUX_KEYS.has(key)) {
    return null;
  }

  const values = new Set<number>();

  // Split by comma to handle comma-separated values and ranges
  const parts = key.split(",").map((p) => p.trim());

  for (const part of parts) {
    if (!part) continue;

    // Check if it's a range (e.g., "0-3")
    const rangeMatch = part.match(/^(-?\d+)-(-?\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);

      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        continue;
      }

      // Add all values in the range (inclusive)
      const min = Math.min(start, end);
      const max = Math.max(start, end);

      // Limit range size to prevent memory issues
      if (max - min > 1000) {
        console.warn(`Mux case range too large: ${part}, limiting to 1000 values`);
        for (let i = min; i <= min + 1000; i++) {
          values.add(i);
        }
      } else {
        for (let i = min; i <= max; i++) {
          values.add(i);
        }
      }
    } else if (/^-?\d+$/.test(part)) {
      // Single numeric value
      const num = parseInt(part, 10);
      if (Number.isFinite(num)) {
        values.add(num);
      }
    }
    // Non-numeric parts are ignored (legacy string case keys not supported for matching)
  }

  if (values.size === 0) {
    return null;
  }

  return { key, values };
}

/**
 * Check if a selector value matches a mux case key.
 *
 * @param selectorValue - The numeric value read from the mux selector bits
 * @param caseKey - The mux case key string from TOML (e.g., "0", "0-3", "1,2,5")
 * @returns true if the selector value matches the case key pattern
 */
export function muxCaseMatches(selectorValue: number, caseKey: string): boolean {
  const pattern = parseMuxCaseKey(caseKey);
  if (!pattern) return false;
  return pattern.values.has(selectorValue);
}

/**
 * Find the first matching case key for a selector value from a list of case keys.
 *
 * @param selectorValue - The numeric value read from the mux selector bits
 * @param caseKeys - Array of mux case key strings from TOML
 * @returns The first matching case key, or undefined if no match
 */
export function findMatchingMuxCase(
  selectorValue: number,
  caseKeys: string[]
): string | undefined {
  for (const key of caseKeys) {
    if (muxCaseMatches(selectorValue, key)) {
      return key;
    }
  }
  return undefined;
}

/**
 * Get all case keys from a mux object (excluding reserved keys like "name", "start_bit", etc.).
 */
export function getMuxCaseKeys(muxObj: Record<string, unknown>): string[] {
  return Object.keys(muxObj).filter(isMuxCaseKey);
}

/**
 * Sort mux case keys for display.
 * - Pure numeric keys are sorted numerically
 * - Range keys are sorted by their first value
 * - Mixed keys are sorted lexicographically
 */
export function sortMuxCaseKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    // Extract the first numeric value from each key for comparison
    const aMatch = a.match(/^-?\d+/);
    const bMatch = b.match(/^-?\d+/);

    if (aMatch && bMatch) {
      return parseInt(aMatch[0], 10) - parseInt(bMatch[0], 10);
    }

    // Fall back to lexicographic sort
    return a.localeCompare(b);
  });
}
