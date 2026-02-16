// ui/src/utils/analysis/checksumAutoDetect.ts
//
// Shared utilities for auto-detecting checksum algorithms.
// Used by both serial discovery (ChecksumExtractionDialog) and CAN checksum discovery.

import {
  type ChecksumAlgorithm,
  calculateChecksum,
  CHECKSUM_ALGORITHMS,
  resolveByteIndexSync,
} from './checksums';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of auto-detecting a checksum algorithm.
 */
export interface AlgorithmMatch {
  algorithm: ChecksumAlgorithm;
  matchCount: number;
  totalCount: number;
  matchRate: number;
  endianness: 'big' | 'little';
}

/**
 * Options for auto-detection.
 */
export interface AutoDetectOptions {
  /** Maximum number of frames to test (default: 20) */
  maxSamples?: number;
  /** Checksum position as byte index, negative for end-relative (default: auto-detect) */
  checksumPosition?: number;
  /** Checksum size in bytes (default: auto-detect both 1 and 2) */
  checksumBytes?: 1 | 2;
  /** Start of data range for calculation (default: 0) */
  calcStartByte?: number;
  /** End of data range for calculation, negative for relative to checksum (default: checksum position) */
  calcEndByte?: number;
}

/**
 * Configuration for match rate calculation.
 */
export interface MatchRateConfig {
  checksumStart: number;
  checksumBytes: number;
  endianness: 'big' | 'little';
  calcStart: number;
  calcEnd: number;
}

// ============================================================================
// Auto-Detection Functions
// ============================================================================

/**
 * Auto-detect which known checksum algorithms match the given payloads.
 * Tests all algorithms in CHECKSUM_ALGORITHMS and returns matches sorted by rate.
 *
 * @param payloads - Array of frame payloads (byte arrays)
 * @param options - Detection options
 * @returns Array of algorithm matches sorted by match rate (highest first)
 */
export async function autoDetectAlgorithm(
  payloads: number[][],
  options: AutoDetectOptions = {}
): Promise<AlgorithmMatch[]> {
  const {
    maxSamples = 20,
    checksumPosition,
    checksumBytes,
    calcStartByte = 0,
  } = options;

  if (payloads.length === 0) return [];

  const samplesToTest = payloads.slice(0, maxSamples);
  const results: AlgorithmMatch[] = [];

  // Determine which byte counts to test
  const byteCounts: (1 | 2)[] = checksumBytes ? [checksumBytes] : [1, 2];

  for (const algo of CHECKSUM_ALGORITHMS) {
    const algoByteCount = algo.outputBytes as 1 | 2;

    // Skip if we're only testing a specific byte count that doesn't match
    if (checksumBytes && algoByteCount !== checksumBytes) continue;

    // Only test byte counts that match this algorithm's output
    if (!byteCounts.includes(algoByteCount)) continue;

    // Test both endianness for 2-byte checksums
    const endiannesses: ('big' | 'little')[] = algoByteCount === 2 ? ['little', 'big'] : ['big'];

    for (const endianness of endiannesses) {
      let matchCount = 0;
      let testedCount = 0;

      for (const payload of samplesToTest) {
        if (payload.length < algoByteCount + 1) continue;

        testedCount++;

        // Calculate checksum position (default: last N bytes)
        const checksumStart = checksumPosition !== undefined
          ? resolveByteIndexSync(checksumPosition, payload.length)
          : payload.length - algoByteCount;

        // Calculate data end (default: up to checksum)
        const calcEnd = options.calcEndByte !== undefined
          ? resolveByteIndexSync(options.calcEndByte, payload.length)
          : checksumStart;

        // Extract data for calculation
        const data = payload.slice(calcStartByte, calcEnd);

        // Calculate expected checksum
        const expected = await calculateChecksum(algo.id, data, 0, data.length);

        // Extract actual checksum from payload
        const actual = extractChecksumValue(payload, checksumStart, algoByteCount, endianness);

        if (expected === actual) {
          matchCount++;
        }
      }

      if (matchCount > 0 && testedCount > 0) {
        results.push({
          algorithm: algo.id,
          matchCount,
          totalCount: testedCount,
          matchRate: (matchCount / testedCount) * 100,
          endianness,
        });
      }
    }
  }

  // Sort by match rate descending, then by match count
  results.sort((a, b) => {
    if (b.matchRate !== a.matchRate) return b.matchRate - a.matchRate;
    return b.matchCount - a.matchCount;
  });

  return results;
}

/**
 * Calculate match rate for a specific algorithm configuration.
 *
 * @param payloads - Array of frame payloads (byte arrays)
 * @param algorithm - The checksum algorithm to test
 * @param config - Configuration for checksum position and data range
 * @returns Match statistics
 */
export async function calculateMatchRate(
  payloads: number[][],
  algorithm: ChecksumAlgorithm,
  config: MatchRateConfig
): Promise<{ matches: number; total: number; matchRate: number }> {
  const { checksumStart, checksumBytes, endianness, calcStart, calcEnd } = config;

  let matches = 0;
  let total = 0;

  for (const payload of payloads) {
    const resolvedStart = resolveByteIndexSync(checksumStart, payload.length);
    const resolvedCalcEnd = resolveByteIndexSync(calcEnd, payload.length);

    if (resolvedStart >= payload.length || resolvedCalcEnd > payload.length) continue;

    total++;

    const data = payload.slice(calcStart, resolvedCalcEnd);
    const expected = await calculateChecksum(algorithm, data, 0, data.length);
    const actual = extractChecksumValue(payload, resolvedStart, checksumBytes, endianness);

    if (expected === actual) {
      matches++;
    }
  }

  return {
    matches,
    total,
    matchRate: total > 0 ? (matches / total) * 100 : 0,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract a checksum value from a payload at a given position.
 *
 * @param payload - The frame payload bytes
 * @param position - Starting byte position (already resolved, not negative)
 * @param numBytes - Number of bytes (1 or 2)
 * @param endianness - Byte order for multi-byte values
 * @returns The extracted checksum value
 */
export function extractChecksumValue(
  payload: number[],
  position: number,
  numBytes: number,
  endianness: 'big' | 'little'
): number {
  if (position + numBytes > payload.length) return 0;

  if (numBytes === 1) {
    return payload[position];
  }

  // 2 bytes
  if (endianness === 'little') {
    return payload[position] | (payload[position + 1] << 8);
  } else {
    return (payload[position] << 8) | payload[position + 1];
  }
}

/**
 * Get the best algorithm match from auto-detection results.
 * Returns the first match that meets the minimum match rate threshold.
 *
 * @param matches - Auto-detection results
 * @param minMatchRate - Minimum acceptable match rate (default: 80%)
 * @returns The best matching algorithm, or null if none meet threshold
 */
export function getBestMatch(
  matches: AlgorithmMatch[],
  minMatchRate = 80
): AlgorithmMatch | null {
  for (const match of matches) {
    if (match.matchRate >= minMatchRate) {
      return match;
    }
  }
  return null;
}
