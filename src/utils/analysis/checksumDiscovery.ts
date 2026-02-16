// ui/src/utils/analysis/checksumDiscovery.ts
//
// Checksum discovery algorithm for CAN frames.
// Detects checksum algorithms, CRC polynomials, and parameters per frame ID.

import type { FrameMessage } from '../../types/frame';
import {
  batchTestCrc,
  calculateChecksum,
  type ChecksumAlgorithm,
} from '../../api/checksums';
import {
  autoDetectAlgorithm,
  extractChecksumValue,
  type AlgorithmMatch,
} from './checksumAutoDetect';
import { resolveByteIndexSync, CHECKSUM_ALGORITHMS } from './checksums';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for checksum discovery.
 */
export interface ChecksumDiscoveryOptions {
  /** Minimum frames per ID to analyse (default: 10) */
  minSamples: number;
  /** Minimum match rate to report as a candidate (default: 95) */
  minMatchRate: number;
  /** Byte positions to try (negative = from end) (default: [-1, -2]) */
  checksumPositions: number[];
  /** Try XOR/Sum8 before CRC brute-force (default: true) */
  trySimpleFirst: boolean;
  /** Enable CRC-16 polynomial brute-force (default: false) */
  bruteForceCrc16: boolean;
  /** Maximum frames to sample per ID (default: 100) */
  maxSamplesPerFrameId: number;
  /** Progress callback */
  onProgress?: (progress: DiscoveryProgress) => void;
}

/**
 * Progress information during discovery.
 */
export interface DiscoveryProgress {
  phase: 'grouping' | 'simple' | 'known-crc' | 'brute-force-crc8' | 'brute-force-crc16';
  frameIdIndex: number;
  totalFrameIds: number;
  currentFrameId: number;
  polynomialsTested?: number;
  polynomialsTotal?: number;
}

/**
 * A detected checksum candidate.
 */
export interface ChecksumCandidate {
  frameId: number;
  position: number;             // Byte position (negative = from end)
  length: 1 | 2;                // Checksum byte length
  type: 'xor' | 'sum8' | 'crc8' | 'crc16';
  // For CRC types:
  polynomial?: number;
  init?: number;
  xorOut?: number;
  reflect?: boolean;
  endianness: 'big' | 'little';
  includesFrameId: boolean;     // Whether arb ID is prepended to payload
  // Results:
  matchCount: number;
  totalCount: number;
  matchRate: number;
  dataRange: { start: number; end: number };
  // Algorithm name (for known algorithms)
  algorithmName?: string;
}

/**
 * Result of checksum discovery.
 */
export interface ChecksumDiscoveryResult {
  tool: 'checksum-discovery';
  frameCount: number;
  uniqueFrameIds: number;
  candidatesByFrameId: Map<number, ChecksumCandidate[]>;
  summary: {
    framesWithChecksum: number;
    framesWithoutChecksum: number;
    mostCommonType: string | null;
  };
}

// ============================================================================
// Constants
// ============================================================================

/** Common CRC-16 polynomials to try before brute-force */
const COMMON_CRC16_POLYNOMIALS = [
  0x8005, // CRC-16-IBM/ANSI (USB, Modbus)
  0x1021, // CRC-16-CCITT (X.25, HDLC)
  0x8BB7, // CRC-16-T10-DIF
  0x3D65, // CRC-16-DNP
  0x1DCF, // CRC-16-MCRF4XX
  0x0589, // CRC-16-DECT
  0x080D, // CRC-16-ARINC
  0xC867, // CRC-16-CDMA2000
  0x755B, // CRC-16-DARC
  0x5935, // CRC-16-DDS-110
  0x0599, // CRC-16-DECT-R
  0xA097, // CRC-16-RIELLO
  0x29B1, // CRC-16-TELEDISK
  0x6F63, // CRC-16-TMS37157
  0x8408, // CRC-16-KERMIT (reflected 0x1021)
  0xA001, // CRC-16-MODBUS (reflected 0x8005)
];

/** Common init/xorOut values */
const COMMON_INIT_VALUES = [0x0000, 0xFFFF];
const COMMON_XOR_VALUES = [0x0000, 0xFFFF];

/** Default options */
export const DEFAULT_CHECKSUM_DISCOVERY_OPTIONS: ChecksumDiscoveryOptions = {
  minSamples: 10,
  minMatchRate: 95,
  checksumPositions: [-1, -2],
  trySimpleFirst: true,
  bruteForceCrc16: false,
  maxSamplesPerFrameId: 100,
};

// ============================================================================
// Main Discovery Function
// ============================================================================

/**
 * Discover checksum algorithms for CAN frames.
 *
 * @param frames - Array of CAN frames to analyse
 * @param options - Discovery options
 * @returns Discovery results
 */
export async function discoverChecksums(
  frames: FrameMessage[],
  options: Partial<ChecksumDiscoveryOptions> = {}
): Promise<ChecksumDiscoveryResult> {
  const opts = { ...DEFAULT_CHECKSUM_DISCOVERY_OPTIONS, ...options };
  const candidatesByFrameId = new Map<number, ChecksumCandidate[]>();

  // Phase 1: Group frames by frame ID
  opts.onProgress?.({
    phase: 'grouping',
    frameIdIndex: 0,
    totalFrameIds: 0,
    currentFrameId: 0,
  });

  const framesByFrameId = groupFramesByFrameId(frames, opts.minSamples, opts.maxSamplesPerFrameId);
  const frameIds = Array.from(framesByFrameId.keys());

  // Phase 2-5: Process each frame ID
  for (let i = 0; i < frameIds.length; i++) {
    const frameId = frameIds[i];
    const frameGroup = framesByFrameId.get(frameId)!;
    const payloads = frameGroup.map(f => f.bytes);

    const candidates: ChecksumCandidate[] = [];

    // Try each checksum position
    for (const position of opts.checksumPositions) {
      const checksumLength = position === -1 ? 1 : 2;

      // Extract payloads and expected checksums
      const { dataPayloads, expectedChecksums, dataPayloadsWithFrameId } = preparePayloadsForPosition(
        frameGroup,
        position,
        checksumLength
      );

      if (dataPayloads.length < opts.minSamples) continue;

      // Phase 2: Try simple algorithms (XOR, Sum8)
      if (opts.trySimpleFirst) {
        opts.onProgress?.({
          phase: 'simple',
          frameIdIndex: i,
          totalFrameIds: frameIds.length,
          currentFrameId: frameId,
        });

        const simpleCandidate = await trySimpleAlgorithms(
          frameId,
          dataPayloads,
          expectedChecksums,
          position,
          checksumLength,
          opts.minMatchRate
        );

        if (simpleCandidate) {
          candidates.push(simpleCandidate);
          continue; // Found a match, skip to next position
        }

        // Try with frame ID prepended
        const simpleCandidateWithId = await trySimpleAlgorithms(
          frameId,
          dataPayloadsWithFrameId,
          expectedChecksums,
          position,
          checksumLength,
          opts.minMatchRate,
          true
        );

        if (simpleCandidateWithId) {
          candidates.push(simpleCandidateWithId);
          continue;
        }
      }

      // Phase 3: Try known CRC algorithms
      opts.onProgress?.({
        phase: 'known-crc',
        frameIdIndex: i,
        totalFrameIds: frameIds.length,
        currentFrameId: frameId,
      });

      const knownCrcCandidate = await tryKnownCrcAlgorithms(
        frameId,
        payloads,
        position,
        checksumLength,
        opts.minMatchRate
      );

      if (knownCrcCandidate) {
        candidates.push(knownCrcCandidate);
        continue;
      }

      // Phase 4: Brute-force CRC-8
      if (checksumLength === 1) {
        opts.onProgress?.({
          phase: 'brute-force-crc8',
          frameIdIndex: i,
          totalFrameIds: frameIds.length,
          currentFrameId: frameId,
          polynomialsTested: 0,
          polynomialsTotal: 255 * 4 * 2, // 255 polys * 4 init/xor combos * 2 (with/without frame ID)
        });

        const crc8Candidate = await bruteForceCrc8(
          frameId,
          dataPayloads,
          expectedChecksums,
          dataPayloadsWithFrameId,
          position,
          opts.minMatchRate,
          (tested, total) => {
            opts.onProgress?.({
              phase: 'brute-force-crc8',
              frameIdIndex: i,
              totalFrameIds: frameIds.length,
              currentFrameId: frameId,
              polynomialsTested: tested,
              polynomialsTotal: total,
            });
          }
        );

        if (crc8Candidate) {
          candidates.push(crc8Candidate);
          continue;
        }
      }

      // Phase 5: Brute-force CRC-16 (if enabled)
      if (checksumLength === 2 && opts.bruteForceCrc16) {
        opts.onProgress?.({
          phase: 'brute-force-crc16',
          frameIdIndex: i,
          totalFrameIds: frameIds.length,
          currentFrameId: frameId,
          polynomialsTested: 0,
          polynomialsTotal: 65535 * 4 * 2 * 2, // All polys * init/xor * reflect * frame ID
        });

        const crc16Candidate = await bruteForceCrc16(
          frameId,
          dataPayloads,
          expectedChecksums,
          dataPayloadsWithFrameId,
          position,
          opts.minMatchRate,
          true, // Full brute force
          (tested, total) => {
            opts.onProgress?.({
              phase: 'brute-force-crc16',
              frameIdIndex: i,
              totalFrameIds: frameIds.length,
              currentFrameId: frameId,
              polynomialsTested: tested,
              polynomialsTotal: total,
            });
          }
        );

        if (crc16Candidate) {
          candidates.push(crc16Candidate);
          continue;
        }
      } else if (checksumLength === 2) {
        // Try common CRC-16 polynomials only
        const crc16Candidate = await bruteForceCrc16(
          frameId,
          dataPayloads,
          expectedChecksums,
          dataPayloadsWithFrameId,
          position,
          opts.minMatchRate,
          false, // Common polys only
          (tested, total) => {
            opts.onProgress?.({
              phase: 'brute-force-crc16',
              frameIdIndex: i,
              totalFrameIds: frameIds.length,
              currentFrameId: frameId,
              polynomialsTested: tested,
              polynomialsTotal: total,
            });
          }
        );

        if (crc16Candidate) {
          candidates.push(crc16Candidate);
        }
      }
    }

    if (candidates.length > 0) {
      candidatesByFrameId.set(frameId, candidates);
    }
  }

  // Build summary
  const framesWithChecksum = candidatesByFrameId.size;
  const framesWithoutChecksum = frameIds.length - framesWithChecksum;

  // Find most common type
  const typeCounts = new Map<string, number>();
  for (const candidates of candidatesByFrameId.values()) {
    for (const c of candidates) {
      const key = c.algorithmName || c.type;
      typeCounts.set(key, (typeCounts.get(key) || 0) + 1);
    }
  }

  let mostCommonType: string | null = null;
  let maxCount = 0;
  for (const [type, count] of typeCounts) {
    if (count > maxCount) {
      maxCount = count;
      mostCommonType = type;
    }
  }

  return {
    tool: 'checksum-discovery',
    frameCount: frames.length,
    uniqueFrameIds: frameIds.length,
    candidatesByFrameId,
    summary: {
      framesWithChecksum,
      framesWithoutChecksum,
      mostCommonType,
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Group frames by frame ID, filtering by minimum samples.
 */
function groupFramesByFrameId(
  frames: FrameMessage[],
  minSamples: number,
  maxSamples: number
): Map<number, FrameMessage[]> {
  const groups = new Map<number, FrameMessage[]>();

  for (const frame of frames) {
    const group = groups.get(frame.frame_id) || [];
    if (group.length < maxSamples) {
      group.push(frame);
      groups.set(frame.frame_id, group);
    }
  }

  // Filter out groups with too few samples
  for (const [frameId, group] of groups) {
    if (group.length < minSamples) {
      groups.delete(frameId);
    }
  }

  return groups;
}

/**
 * Prepare payloads for a specific checksum position.
 * Returns data payloads (bytes before checksum), expected checksums, and
 * payloads with frame ID prepended.
 */
function preparePayloadsForPosition(
  frames: FrameMessage[],
  position: number,
  checksumLength: number
): {
  dataPayloads: number[][];
  expectedChecksums: number[];
  dataPayloadsWithFrameId: number[][];
} {
  const dataPayloads: number[][] = [];
  const expectedChecksums: number[] = [];
  const dataPayloadsWithFrameId: number[][] = [];

  for (const frame of frames) {
    const bytes = frame.bytes;
    if (bytes.length < checksumLength + 1) continue;

    const checksumStart = resolveByteIndexSync(position, bytes.length);
    const dataEnd = checksumStart;

    // Extract data (before checksum)
    const data = bytes.slice(0, dataEnd);
    dataPayloads.push(data);

    // Extract expected checksum
    const expected = extractChecksumValue(
      bytes,
      checksumStart,
      checksumLength,
      'little' // Try little-endian first, will also try big-endian in tests
    );
    expectedChecksums.push(expected);

    // Prepend frame ID (as 2 bytes, little-endian)
    const frameIdBytes = [frame.frame_id & 0xFF, (frame.frame_id >> 8) & 0xFF];
    dataPayloadsWithFrameId.push([...frameIdBytes, ...data]);
  }

  return { dataPayloads, expectedChecksums, dataPayloadsWithFrameId };
}

/**
 * Try simple algorithms (XOR, Sum8).
 */
async function trySimpleAlgorithms(
  frameId: number,
  dataPayloads: number[][],
  expectedChecksums: number[],
  position: number,
  checksumLength: number,
  minMatchRate: number,
  includesFrameId = false
): Promise<ChecksumCandidate | null> {
  const simpleAlgos: { id: ChecksumAlgorithm; type: 'xor' | 'sum8' }[] = [
    { id: 'xor', type: 'xor' },
    { id: 'sum8', type: 'sum8' },
  ];

  for (const algo of simpleAlgos) {
    let matchCount = 0;

    for (let i = 0; i < dataPayloads.length; i++) {
      const data = dataPayloads[i];
      const expected = expectedChecksums[i];

      const calculated = await calculateChecksum(algo.id, data, 0, data.length);
      if (calculated === expected) {
        matchCount++;
      }
    }

    const matchRate = (matchCount / dataPayloads.length) * 100;
    if (matchRate >= minMatchRate) {
      return {
        frameId,
        position,
        length: checksumLength as 1 | 2,
        type: algo.type,
        endianness: 'little',
        includesFrameId,
        matchCount,
        totalCount: dataPayloads.length,
        matchRate,
        dataRange: { start: 0, end: position },
        algorithmName: algo.id.toUpperCase(),
      };
    }
  }

  return null;
}

/**
 * Try known CRC algorithms using the auto-detect utility.
 */
async function tryKnownCrcAlgorithms(
  frameId: number,
  payloads: number[][],
  position: number,
  checksumLength: number,
  minMatchRate: number
): Promise<ChecksumCandidate | null> {
  const matches = await autoDetectAlgorithm(payloads, {
    checksumPosition: position,
    checksumBytes: checksumLength as 1 | 2,
  });

  if (matches.length > 0 && matches[0].matchRate >= minMatchRate) {
    const match = matches[0];
    const algoInfo = CHECKSUM_ALGORITHMS.find(a => a.id === match.algorithm);

    return {
      frameId,
      position,
      length: checksumLength as 1 | 2,
      type: checksumLength === 1 ? 'crc8' : 'crc16',
      endianness: match.endianness,
      includesFrameId: false,
      matchCount: match.matchCount,
      totalCount: match.totalCount,
      matchRate: match.matchRate,
      dataRange: { start: 0, end: position },
      algorithmName: algoInfo?.name || match.algorithm,
    };
  }

  return null;
}

/**
 * Brute-force CRC-8 polynomials.
 */
async function bruteForceCrc8(
  frameId: number,
  dataPayloads: number[][],
  expectedChecksums: number[],
  dataPayloadsWithFrameId: number[][],
  position: number,
  minMatchRate: number,
  onProgress?: (tested: number, total: number) => void
): Promise<ChecksumCandidate | null> {
  const total = 255 * COMMON_INIT_VALUES.length * COMMON_XOR_VALUES.length * 2 * 2; // polys * init * xor * reflect * frameId
  let tested = 0;

  for (const init of COMMON_INIT_VALUES) {
    for (const xorOut of COMMON_XOR_VALUES) {
      for (const reflect of [false, true]) {
        for (const includesFrameId of [false, true]) {
          const payloads = includesFrameId ? dataPayloadsWithFrameId : dataPayloads;

          for (let poly = 1; poly <= 255; poly++) {
            tested++;
            if (tested % 100 === 0) {
              onProgress?.(tested, total);
            }

            const result = await batchTestCrc(
              payloads,
              expectedChecksums,
              8,
              poly,
              init,
              xorOut,
              reflect
            );

            const matchRate = (result.matchCount / result.totalCount) * 100;
            if (matchRate >= minMatchRate) {
              return {
                frameId,
                position,
                length: 1,
                type: 'crc8',
                polynomial: poly,
                init,
                xorOut,
                reflect,
                endianness: 'big', // Doesn't matter for 1-byte
                includesFrameId,
                matchCount: result.matchCount,
                totalCount: result.totalCount,
                matchRate,
                dataRange: { start: 0, end: position },
              };
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Brute-force CRC-16 polynomials.
 */
async function bruteForceCrc16(
  frameId: number,
  dataPayloads: number[][],
  expectedChecksums: number[],
  dataPayloadsWithFrameId: number[][],
  position: number,
  minMatchRate: number,
  fullBruteForce: boolean,
  onProgress?: (tested: number, total: number) => void
): Promise<ChecksumCandidate | null> {
  const polynomials = fullBruteForce
    ? Array.from({ length: 65535 }, (_, i) => i + 1)
    : COMMON_CRC16_POLYNOMIALS;

  const total = polynomials.length * COMMON_INIT_VALUES.length * COMMON_XOR_VALUES.length * 2 * 2 * 2; // polys * init * xor * reflect * endian * frameId
  let tested = 0;

  for (const init of COMMON_INIT_VALUES) {
    for (const xorOut of COMMON_XOR_VALUES) {
      for (const reflect of [false, true]) {
        for (const endianness of ['little', 'big'] as const) {
          for (const includesFrameId of [false, true]) {
            const payloads = includesFrameId ? dataPayloadsWithFrameId : dataPayloads;

            // Re-extract expected checksums with correct endianness
            const expectedWithEndian = expectedChecksums.map((_, i) => {
              const frame = dataPayloads[i];
              // This is a simplification - in reality we'd need the original frame bytes
              // For now, swap bytes if big-endian
              const le = expectedChecksums[i];
              if (endianness === 'big') {
                return ((le & 0xFF) << 8) | ((le >> 8) & 0xFF);
              }
              return le;
            });

            for (const poly of polynomials) {
              tested++;
              if (tested % 500 === 0) {
                onProgress?.(tested, total);
              }

              const result = await batchTestCrc(
                payloads,
                expectedWithEndian,
                16,
                poly,
                init,
                xorOut,
                reflect
              );

              const matchRate = (result.matchCount / result.totalCount) * 100;
              if (matchRate >= minMatchRate) {
                return {
                  frameId,
                  position,
                  length: 2,
                  type: 'crc16',
                  polynomial: poly,
                  init,
                  xorOut,
                  reflect,
                  endianness,
                  includesFrameId,
                  matchCount: result.matchCount,
                  totalCount: result.totalCount,
                  matchRate,
                  dataRange: { start: 0, end: position },
                };
              }
            }
          }
        }
      }
    }
  }

  return null;
}
