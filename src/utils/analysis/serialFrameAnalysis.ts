// ui/src/utils/analysis/serialFrameAnalysis.ts
// Serial frame structure analysis - identifies candidate ID bytes, source addresses, and checksum positions
//
// For framing detection (SLIP, Modbus RTU, delimiter-based), see framingDetection.ts

import {
  type ChecksumAlgorithm,
  CHECKSUM_ALGORITHMS,
  calculateChecksum,
  resolveByteIndexSync,
} from './checksums';

// Re-export framing detection types and functions for backwards compatibility
export { detectFraming, type FramingCandidate, type FramingDetectionResult } from './framingDetection';

// ============================================================================
// Types
// ============================================================================

/**
 * Candidate ID byte group - a sequence of bytes that could identify frame types
 */
export type CandidateIdGroup = {
  startByte: number;
  length: number;           // 1 or 2 bytes typically
  uniqueValues: number[];   // The distinct ID values found
  sampleCount: number;      // How many frames had this pattern
  confidence: number;       // 0-100 confidence score
  notes: string[];          // Explanatory notes
};

/**
 * Candidate source address position - bytes that could identify the sender/source
 */
export type CandidateSourceAddress = {
  startByte: number;
  length: number;           // 1 or 2 bytes typically
  uniqueValues: number[];   // The distinct source addresses found
  sampleCount: number;      // How many frames had this pattern
  confidence: number;       // 0-100 confidence score
  notes: string[];          // Explanatory notes
};

/**
 * Candidate checksum position - a byte position that could contain a checksum
 */
export type CandidateChecksum = {
  position: number;         // Byte position (can be negative for end-relative)
  length: number;           // 1 or 2 bytes
  algorithm: ChecksumAlgorithm;
  calcStartByte: number;    // Start of calculation range
  calcEndByte: number;      // End of calculation range (exclusive)
  matchRate: number;        // Percentage of frames where checksum validated (0-100)
  matchCount: number;       // Number of frames that matched
  totalCount: number;       // Total frames tested
  confidence: number;       // 0-100 confidence score
  notes: string[];          // Explanatory notes
};

/**
 * Result of serial frame structure analysis
 */
export type SerialFrameAnalysisResult = {
  frameCount: number;
  minLength: number;
  maxLength: number;
  hasVaryingLength: boolean;
  candidateIdGroups: CandidateIdGroup[];
  candidateSourceAddresses: CandidateSourceAddress[];
  candidateChecksums: CandidateChecksum[];
  notes: string[];
};

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Analyze serial frames to identify structure patterns:
 * - Candidate ID byte groups (bytes that identify message types)
 * - Candidate checksum bytes (checksums that validate frame integrity)
 *
 * @param frames - Array of frame payloads (just the bytes arrays)
 * @returns Analysis results with candidates
 */
export async function analyzeSerialFrameStructure(
  frames: number[][]
): Promise<SerialFrameAnalysisResult> {
  if (frames.length === 0) {
    return {
      frameCount: 0,
      minLength: 0,
      maxLength: 0,
      hasVaryingLength: false,
      candidateIdGroups: [],
      candidateSourceAddresses: [],
      candidateChecksums: [],
      notes: ['No frames to analyze'],
    };
  }

  const notes: string[] = [];

  // Calculate length statistics
  const lengths = frames.map(f => f.length);
  const minLength = Math.min(...lengths);
  const maxLength = Math.max(...lengths);
  const hasVaryingLength = minLength !== maxLength;

  if (hasVaryingLength) {
    notes.push(`Varying length: ${minLength}–${maxLength} bytes`);
  } else {
    notes.push(`Fixed length: ${minLength} bytes`);
  }

  // Find candidate ID groups
  const candidateIdGroups = findCandidateIdGroups(frames, minLength);

  // Find candidate source addresses (typically after the ID bytes)
  const bestIdCandidate = candidateIdGroups.length > 0 ? candidateIdGroups[0] : null;
  const candidateSourceAddresses = findCandidateSourceAddresses(frames, minLength, bestIdCandidate);

  // Find candidate checksums
  const candidateChecksums = await findCandidateChecksums(frames, minLength);

  // Add summary notes
  if (candidateIdGroups.length > 0) {
    const bestId = candidateIdGroups[0];
    notes.push(`Best ID candidate: byte${bestId.length > 1 ? 's' : ''} [${bestId.startByte}${bestId.length > 1 ? ':' + (bestId.startByte + bestId.length - 1) : ''}] with ${bestId.uniqueValues.length} distinct values`);
  }

  if (candidateSourceAddresses.length > 0) {
    const bestSrc = candidateSourceAddresses[0];
    notes.push(`Best source address candidate: byte${bestSrc.length > 1 ? 's' : ''} [${bestSrc.startByte}${bestSrc.length > 1 ? ':' + (bestSrc.startByte + bestSrc.length - 1) : ''}] with ${bestSrc.uniqueValues.length} distinct values`);
  }

  if (candidateChecksums.length > 0) {
    const bestChecksum = candidateChecksums[0];
    notes.push(`Best checksum candidate: ${bestChecksum.algorithm} at byte ${bestChecksum.position} (${bestChecksum.matchRate.toFixed(0)}% match rate)`);
  }

  return {
    frameCount: frames.length,
    minLength,
    maxLength,
    hasVaryingLength,
    candidateIdGroups,
    candidateSourceAddresses,
    candidateChecksums,
    notes,
  };
}

/**
 * Find candidate ID byte groups by looking for bytes with:
 * - Multiple distinct values (message types)
 * - Values that appear consistently at frame start
 * - Reasonable number of unique values (2-50 typically)
 */
function findCandidateIdGroups(
  frames: number[][],
  minLength: number
): CandidateIdGroup[] {
  const candidates: CandidateIdGroup[] = [];

  // Analyze first few bytes (typically ID is in first 1-4 bytes)
  const maxIdPosition = Math.min(4, minLength - 1);

  for (let startByte = 0; startByte <= maxIdPosition; startByte++) {
    // Check single-byte ID
    const singleByteResult = analyzeSingleByteId(frames, startByte);
    if (singleByteResult) {
      candidates.push(singleByteResult);
    }

    // Check two-byte ID (if room)
    if (startByte + 1 < minLength) {
      const twoByteResult = analyzeTwoByteId(frames, startByte);
      if (twoByteResult) {
        candidates.push(twoByteResult);
      }
    }
  }

  // Sort by confidence (descending)
  candidates.sort((a, b) => b.confidence - a.confidence);

  return candidates;
}

/**
 * Analyze a single byte position as a potential ID byte
 */
function analyzeSingleByteId(
  frames: number[][],
  byteIdx: number
): CandidateIdGroup | null {
  const values = new Map<number, number>(); // value -> count

  for (const frame of frames) {
    if (byteIdx >= frame.length) continue;
    const val = frame[byteIdx];
    values.set(val, (values.get(val) || 0) + 1);
  }

  const uniqueValues = Array.from(values.keys()).sort((a, b) => a - b);
  const uniqueCount = uniqueValues.length;

  // ID bytes typically have 2-50 unique values
  // Too few = might be static, too many = might be payload data
  if (uniqueCount < 2 || uniqueCount > 50) {
    return null;
  }

  // Calculate confidence based on:
  // - Position (earlier is better for IDs)
  // - Number of unique values (reasonable range is good)
  // - Value distribution (more even is better for message types)
  const positionScore = Math.max(0, 100 - byteIdx * 20); // Prefer early bytes
  const valueCountScore = uniqueCount >= 3 && uniqueCount <= 20 ? 80 : 50;

  // Check for common protocol patterns
  const notes: string[] = [];
  let patternBonus = 0;

  // Check for common frame type markers (0xFB, 0xFC, 0xFD for TWC-like protocols)
  const hasProtocolMarkers = uniqueValues.some(v =>
    v === 0xFB || v === 0xFC || v === 0xFD || v === 0xFE
  );
  if (hasProtocolMarkers) {
    notes.push('Contains common protocol markers (0xFB-0xFE)');
    patternBonus += 15;
  }

  // Check for small sequential values (common command IDs)
  const hasSequentialLow = uniqueValues.some(v => v <= 0x10);
  if (hasSequentialLow && uniqueCount <= 16) {
    notes.push('Contains small sequential values (likely command IDs)');
    patternBonus += 10;
  }

  const confidence = Math.min(100, (positionScore + valueCountScore + patternBonus) / 2);

  if (confidence < 30) {
    return null;
  }

  return {
    startByte: byteIdx,
    length: 1,
    uniqueValues,
    sampleCount: frames.length,
    confidence,
    notes,
  };
}

/**
 * Analyze two adjacent bytes as a potential 16-bit ID
 */
function analyzeTwoByteId(
  frames: number[][],
  byteIdx: number
): CandidateIdGroup | null {
  const values = new Map<number, number>(); // 16-bit value -> count

  for (const frame of frames) {
    if (byteIdx + 1 >= frame.length) continue;
    // Try big-endian (more common for protocol IDs)
    const val = (frame[byteIdx] << 8) | frame[byteIdx + 1];
    values.set(val, (values.get(val) || 0) + 1);
  }

  const uniqueValues = Array.from(values.keys()).sort((a, b) => a - b);
  const uniqueCount = uniqueValues.length;

  // 16-bit IDs typically have 2-100 unique values
  if (uniqueCount < 2 || uniqueCount > 100) {
    return null;
  }

  // Check if the first byte is consistent (common pattern: type byte + subtype byte)
  const firstBytes = new Set<number>();
  for (const frame of frames) {
    if (byteIdx < frame.length) {
      firstBytes.add(frame[byteIdx]);
    }
  }

  const notes: string[] = [];
  let patternBonus = 0;

  // If first byte is very consistent, this might be type + subtype pattern
  if (firstBytes.size <= 5) {
    notes.push(`First byte has only ${firstBytes.size} values (type + subtype pattern)`);
    patternBonus += 20;
  }

  const positionScore = Math.max(0, 100 - byteIdx * 20);
  const valueCountScore = uniqueCount >= 5 && uniqueCount <= 50 ? 70 : 40;

  const confidence = Math.min(100, (positionScore + valueCountScore + patternBonus) / 2);

  if (confidence < 35) {
    return null;
  }

  return {
    startByte: byteIdx,
    length: 2,
    uniqueValues,
    sampleCount: frames.length,
    confidence,
    notes,
  };
}

/**
 * Find candidate source address positions by looking for bytes with:
 * - Small number of distinct values (typically 2-20 device addresses)
 * - Located after the ID bytes
 * - Consistent distribution (addresses appear regularly)
 *
 * Source addresses typically represent the sender/origin of messages,
 * different from frame IDs which identify message types.
 */
function findCandidateSourceAddresses(
  frames: number[][],
  minLength: number,
  bestIdCandidate: CandidateIdGroup | null
): CandidateSourceAddress[] {
  const candidates: CandidateSourceAddress[] = [];

  // Source address typically comes after ID bytes
  // Start searching from position after best ID candidate, or from byte 1 if no ID found
  const startPos = bestIdCandidate
    ? bestIdCandidate.startByte + bestIdCandidate.length
    : 1;

  // Analyze bytes in positions after the ID, up to a reasonable depth
  const maxSearchPos = Math.min(startPos + 4, minLength - 1);

  for (let byteIdx = startPos; byteIdx <= maxSearchPos; byteIdx++) {
    // Check single-byte source address
    const singleByteResult = analyzeSingleByteSourceAddress(frames, byteIdx);
    if (singleByteResult) {
      candidates.push(singleByteResult);
    }

    // Check two-byte source address (if room)
    if (byteIdx + 1 < minLength) {
      const twoByteResult = analyzeTwoByteSourceAddress(frames, byteIdx);
      if (twoByteResult) {
        candidates.push(twoByteResult);
      }
    }
  }

  // Sort by confidence (descending)
  candidates.sort((a, b) => b.confidence - a.confidence);

  return candidates;
}

/**
 * Analyze a single byte position as a potential source address
 */
function analyzeSingleByteSourceAddress(
  frames: number[][],
  byteIdx: number
): CandidateSourceAddress | null {
  const values = new Map<number, number>(); // value -> count

  for (const frame of frames) {
    if (byteIdx >= frame.length) continue;
    const val = frame[byteIdx];
    values.set(val, (values.get(val) || 0) + 1);
  }

  const uniqueValues = Array.from(values.keys()).sort((a, b) => a - b);
  const uniqueCount = uniqueValues.length;

  // Source addresses typically have 2-20 unique values (number of devices)
  // Too few = might be static header, too many = might be payload data
  if (uniqueCount < 2 || uniqueCount > 30) {
    return null;
  }

  // Calculate confidence based on characteristics of source addresses
  let confidence = 0;
  const notes: string[] = [];

  // Good source address count range (2-10 devices is ideal)
  if (uniqueCount >= 2 && uniqueCount <= 10) {
    confidence += 40;
    notes.push(`${uniqueCount} unique addresses (typical device count)`);
  } else if (uniqueCount <= 20) {
    confidence += 25;
    notes.push(`${uniqueCount} unique addresses`);
  } else {
    confidence += 10;
  }

  // Check for even distribution (source addresses should appear regularly)
  const counts = Array.from(values.values());
  const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);

  // If distribution is somewhat even (not one dominant value)
  if (minCount >= avgCount * 0.1 && maxCount <= avgCount * 5) {
    confidence += 20;
    notes.push('Even distribution across addresses');
  }

  // Check for common address patterns (small values like 0x01-0x10)
  const hasSmallAddresses = uniqueValues.every(v => v <= 0x20);
  if (hasSmallAddresses) {
    confidence += 15;
    notes.push('Small address values (0x00-0x20)');
  }

  // Check for non-zero addresses (0x00 is often not a valid source)
  const hasNoZero = !uniqueValues.includes(0);
  if (hasNoZero && uniqueCount <= 10) {
    confidence += 10;
    notes.push('No zero address (typical for device IDs)');
  }

  if (confidence < 30) {
    return null;
  }

  return {
    startByte: byteIdx,
    length: 1,
    uniqueValues,
    sampleCount: frames.length,
    confidence: Math.min(100, confidence),
    notes,
  };
}

/**
 * Analyze two adjacent bytes as a potential 16-bit source address
 */
function analyzeTwoByteSourceAddress(
  frames: number[][],
  byteIdx: number
): CandidateSourceAddress | null {
  const values = new Map<number, number>(); // 16-bit value -> count

  for (const frame of frames) {
    if (byteIdx + 1 >= frame.length) continue;
    // Try big-endian (more common for protocol addresses)
    const val = (frame[byteIdx] << 8) | frame[byteIdx + 1];
    values.set(val, (values.get(val) || 0) + 1);
  }

  const uniqueValues = Array.from(values.keys()).sort((a, b) => a - b);
  const uniqueCount = uniqueValues.length;

  // 16-bit source addresses typically have 2-30 unique values
  if (uniqueCount < 2 || uniqueCount > 50) {
    return null;
  }

  const notes: string[] = [];
  let confidence = 0;

  // Good source address count range - give BONUS for 2-byte addresses
  // when they have the same or fewer unique values as a 1-byte would,
  // since finding a pattern in 2 bytes is more meaningful/specific
  if (uniqueCount >= 2 && uniqueCount <= 10) {
    // Very few unique values in 16-bit = strong indicator of structured address
    confidence += 50;
    notes.push(`${uniqueCount} unique 16-bit addresses (strong pattern)`);
  } else if (uniqueCount <= 20) {
    confidence += 35;
    notes.push(`${uniqueCount} unique 16-bit addresses`);
  } else if (uniqueCount <= 30) {
    confidence += 20;
  } else {
    confidence += 10;
  }

  // Check if addresses fall in a reasonable range
  const maxVal = Math.max(...uniqueValues);
  if (maxVal <= 0x00FF) {
    // All values fit in one byte - probably not a true 16-bit address
    // Significantly penalize since single-byte candidate would be better
    confidence -= 25;
  } else if (maxVal <= 0x0FFF) {
    confidence += 15;
    notes.push('12-bit address range');
  }

  // Check for even distribution
  const counts = Array.from(values.values());
  const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);

  if (minCount >= avgCount * 0.1 && maxCount <= avgCount * 5) {
    confidence += 20;
    notes.push('Even distribution');
  }

  // Check for non-zero addresses (0x0000 is often not a valid source)
  const hasNoZero = !uniqueValues.includes(0);
  if (hasNoZero && uniqueCount <= 10) {
    confidence += 10;
    notes.push('No zero address');
  }

  if (confidence < 35) {
    return null;
  }

  return {
    startByte: byteIdx,
    length: 2,
    uniqueValues,
    sampleCount: frames.length,
    confidence: Math.min(100, confidence),
    notes,
  };
}

/**
 * Find candidate checksum positions by testing various algorithms
 * against different byte positions
 */
async function findCandidateChecksums(
  frames: number[][],
  minLength: number
): Promise<CandidateChecksum[]> {
  const candidates: CandidateChecksum[] = [];

  // Algorithms to test (all algorithms from shared module)
  const algorithms: ChecksumAlgorithm[] = CHECKSUM_ALGORITHMS.map(a => a.id);

  // Common checksum positions to test:
  // - Last byte (most common)
  // - Second-to-last byte
  // - First few bytes (sometimes CRC is at start after header)
  const positionsToTest: { pos: number; len: number; calcStart: number; calcEnd: number }[] = [];

  // Last byte, checksum over bytes 0 to len-1
  positionsToTest.push({ pos: -1, len: 1, calcStart: 0, calcEnd: -1 });

  // Last byte, checksum over bytes 1 to len-1 (skip type byte)
  positionsToTest.push({ pos: -1, len: 1, calcStart: 1, calcEnd: -1 });

  // Last 2 bytes for CRC-16
  if (minLength >= 4) {
    positionsToTest.push({ pos: -2, len: 2, calcStart: 0, calcEnd: -2 });
    positionsToTest.push({ pos: -2, len: 2, calcStart: 1, calcEnd: -2 });
  }

  // Second-to-last byte (for protocols with padding after checksum)
  if (minLength >= 3) {
    positionsToTest.push({ pos: -2, len: 1, calcStart: 0, calcEnd: -2 });
    positionsToTest.push({ pos: -2, len: 1, calcStart: 1, calcEnd: -2 });
  }

  for (const { pos, len, calcStart, calcEnd } of positionsToTest) {
    for (const algorithm of algorithms) {
      // Skip 2-byte algorithms for 1-byte checksum positions
      if (len === 1 && (algorithm === 'crc16_modbus' || algorithm === 'crc16_ccitt')) {
        continue;
      }
      // Skip 1-byte algorithms for 2-byte checksum positions
      if (len === 2 && (algorithm === 'xor' || algorithm === 'sum8' || algorithm === 'crc8')) {
        continue;
      }

      const result = await testChecksumCandidate(frames, pos, len, algorithm, calcStart, calcEnd);
      if (result && result.matchRate >= 50) {
        candidates.push(result);
      }
    }
  }

  // Sort by match rate (descending), then confidence
  candidates.sort((a, b) => {
    if (Math.abs(b.matchRate - a.matchRate) > 5) {
      return b.matchRate - a.matchRate;
    }
    return b.confidence - a.confidence;
  });

  // Deduplicate - keep best match for each position
  const seen = new Set<string>();
  const deduped: CandidateChecksum[] = [];
  for (const c of candidates) {
    const key = `${c.position}:${c.length}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(c);
    }
  }

  return deduped;
}

/**
 * Test a specific checksum candidate against the frames
 */
async function testChecksumCandidate(
  frames: number[][],
  position: number,
  length: number,
  algorithm: ChecksumAlgorithm,
  calcStart: number,
  calcEnd: number
): Promise<CandidateChecksum | null> {
  let matchCount = 0;
  let totalCount = 0;

  for (const frame of frames) {
    const frameLength = frame.length;

    // Resolve positions
    const resolvedPos = resolveByteIndexSync(position, frameLength);
    const resolvedCalcStart = resolveByteIndexSync(calcStart, frameLength);
    const resolvedCalcEnd = resolveByteIndexSync(calcEnd, frameLength);

    // Skip if positions are out of bounds
    if (resolvedPos < 0 || resolvedPos + length > frameLength) continue;
    if (resolvedCalcStart < 0 || resolvedCalcEnd > frameLength) continue;
    if (resolvedCalcStart >= resolvedCalcEnd) continue;

    totalCount++;

    // Extract the stored checksum value
    const frameData = new Uint8Array(frame);
    let storedChecksum: number;
    if (length === 1) {
      storedChecksum = frame[resolvedPos];
    } else {
      // Big-endian for CRC-16
      storedChecksum = (frame[resolvedPos] << 8) | frame[resolvedPos + 1];
    }

    // Calculate expected checksum
    const calculated = await calculateChecksum(
      algorithm,
      Array.from(frameData),
      resolvedCalcStart,
      resolvedCalcEnd
    );

    if (storedChecksum === calculated) {
      matchCount++;
    }
  }

  if (totalCount === 0) {
    return null;
  }

  const matchRate = (matchCount / totalCount) * 100;

  // Calculate confidence based on match rate and sample size
  let confidence = matchRate;

  // Boost confidence for high match rates with many samples
  if (matchRate >= 95 && totalCount >= 100) {
    confidence = Math.min(100, confidence + 10);
  } else if (matchRate >= 90 && totalCount >= 50) {
    confidence = Math.min(100, confidence + 5);
  }

  // Reduce confidence for low sample counts
  if (totalCount < 10) {
    confidence = confidence * 0.7;
  } else if (totalCount < 50) {
    confidence = confidence * 0.9;
  }

  const notes: string[] = [];

  // Add algorithm info
  const algoInfo = CHECKSUM_ALGORITHMS.find(a => a.id === algorithm);
  if (algoInfo) {
    notes.push(`${algoInfo.name}: ${algoInfo.description}`);
  }

  // Add range info
  if (calcStart === 1) {
    notes.push('Calculation skips first byte (type byte excluded)');
  }

  if (matchRate === 100) {
    notes.push('Perfect match across all samples!');
  } else if (matchRate >= 90) {
    notes.push('High match rate - likely correct');
  }

  return {
    position,
    length,
    algorithm,
    calcStartByte: calcStart,
    calcEndByte: calcEnd,
    matchRate,
    matchCount,
    totalCount,
    confidence,
    notes,
  };
}

/**
 * Format a checksum candidate for display
 */
export function formatChecksumCandidate(candidate: CandidateChecksum, frameLength?: number): string {
  const posStr = candidate.position < 0
    ? `byte ${candidate.position}` + (frameLength ? ` (byte ${resolveByteIndexSync(candidate.position, frameLength)})` : '')
    : `byte ${candidate.position}`;

  const algoInfo = CHECKSUM_ALGORITHMS.find(a => a.id === candidate.algorithm);
  const algoName = algoInfo?.name || candidate.algorithm;

  return `${algoName} at ${posStr}, ${candidate.matchRate.toFixed(0)}% match`;
}

/**
 * Format an ID group candidate for display
 */
export function formatIdCandidate(candidate: CandidateIdGroup): string {
  const byteRange = candidate.length === 1
    ? `byte[${candidate.startByte}]`
    : `bytes[${candidate.startByte}:${candidate.startByte + candidate.length - 1}]`;

  return `${byteRange}: ${candidate.uniqueValues.length} distinct values (${candidate.confidence.toFixed(0)}% confidence)`;
}
