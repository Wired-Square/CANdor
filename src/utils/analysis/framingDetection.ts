// ui/src/utils/analysis/framingDetection.ts
// Framing detection for raw serial byte streams
// Identifies SLIP, Modbus RTU, and delimiter-based framing patterns

import { crc16Modbus } from '../serialFramer';

// ============================================================================
// Types
// ============================================================================

/** SLIP framing constants */
const SLIP_END = 0xC0;
const SLIP_ESC = 0xDB;

/** Candidate framing mode with confidence score */
export type FramingCandidate = {
  mode: 'slip' | 'modbus_rtu' | 'delimiter';
  confidence: number;        // 0-100 confidence score
  notes: string[];           // Explanatory notes
  // For delimiter mode
  delimiter?: number[];      // Detected delimiter bytes
  delimiterHex?: string;     // Hex representation
  // For all modes
  estimatedFrameCount: number;
  avgFrameLength: number;
  minFrameLength: number;
  maxFrameLength: number;
};

/** Result of framing detection analysis */
export type FramingDetectionResult = {
  byteCount: number;
  candidates: FramingCandidate[];
  bestCandidate: FramingCandidate | null;
  notes: string[];
};

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Analyze raw bytes to detect the most likely framing mode.
 * Tests SLIP, Modbus RTU, and common delimiters.
 *
 * @param rawBytes - Array of raw byte values (not chunked by time)
 * @returns Detection results with ranked candidates
 */
export function detectFraming(rawBytes: number[]): FramingDetectionResult {
  if (rawBytes.length === 0) {
    return {
      byteCount: 0,
      candidates: [],
      bestCandidate: null,
      notes: ['No bytes to analyze'],
    };
  }

  const notes: string[] = [];
  notes.push(`Analyzing ${rawBytes.length.toLocaleString()} bytes`);

  const candidates: FramingCandidate[] = [];

  // Test SLIP framing
  const slipCandidate = testSlipFraming(rawBytes);
  if (slipCandidate) {
    candidates.push(slipCandidate);
  }

  // Test Modbus RTU framing
  const modbusCandidate = testModbusRtuFraming(rawBytes);
  if (modbusCandidate) {
    candidates.push(modbusCandidate);
  }

  // Test common delimiters
  const delimiterCandidates = testDelimiterFraming(rawBytes);
  candidates.push(...delimiterCandidates);

  // Sort by confidence (descending)
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Add summary notes
  if (candidates.length === 0) {
    notes.push('No clear framing pattern detected');
  } else {
    const best = candidates[0];
    if (best.confidence >= 80) {
      notes.push(`Strong ${best.mode.toUpperCase()} framing detected (${best.confidence}% confidence)`);
    } else if (best.confidence >= 50) {
      notes.push(`Possible ${best.mode.toUpperCase()} framing detected (${best.confidence}% confidence)`);
    } else {
      notes.push(`Weak framing signal - ${best.mode.toUpperCase()} is best guess (${best.confidence}% confidence)`);
    }
  }

  return {
    byteCount: rawBytes.length,
    candidates,
    bestCandidate: candidates.length > 0 ? candidates[0] : null,
    notes,
  };
}

// ============================================================================
// SLIP Detection
// ============================================================================

/**
 * Test for SLIP framing by looking for 0xC0 delimiters and escape sequences
 */
function testSlipFraming(rawBytes: number[]): FramingCandidate | null {
  const notes: string[] = [];

  // Count SLIP_END markers
  let slipEndCount = 0;
  let slipEscCount = 0;

  for (let i = 0; i < rawBytes.length; i++) {
    if (rawBytes[i] === SLIP_END) {
      slipEndCount++;
    } else if (rawBytes[i] === SLIP_ESC) {
      slipEscCount++;
    }
  }

  // Need at least 2 END markers for any frames
  if (slipEndCount < 2) {
    return null;
  }

  // Calculate frame statistics by simulating SLIP decode
  const frames = decodeSlipFrames(rawBytes);
  if (frames.length === 0) {
    return null;
  }

  const frameLengths = frames.map(f => f.length);
  const avgLength = frameLengths.reduce((a, b) => a + b, 0) / frameLengths.length;
  const minLength = Math.min(...frameLengths);
  const maxLength = Math.max(...frameLengths);

  // Calculate confidence based on:
  // - Number of valid frames
  // - Presence of escape sequences (indicates real SLIP, not just 0xC0 delimiter)
  // - Reasonable frame sizes
  let confidence = 0;

  // Base confidence from frame count
  if (frames.length >= 50) {
    confidence += 50;
  } else if (frames.length >= 10) {
    confidence += 40;
  } else if (frames.length >= 3) {
    confidence += 25;
  } else {
    confidence += 10;
  }

  // Bonus for escape sequences (strong indicator of SLIP)
  if (slipEscCount > 0) {
    notes.push(`Found ${slipEscCount} SLIP escape sequences`);
    confidence += 25;
  }

  // Bonus for reasonable frame sizes (4-256 bytes typical)
  if (avgLength >= 4 && avgLength <= 256) {
    confidence += 15;
  }

  // Bonus for consistent frame sizes (low variance suggests structured protocol)
  if (maxLength - minLength < avgLength * 0.5) {
    confidence += 10;
    notes.push('Consistent frame sizes');
  }

  // Check if 0xC0 frequency matches expected delimiter frequency
  // For SLIP, we expect roughly 1-2 END markers per frame (start + end)
  // If 0xC0 appears much more often than that, it might be data
  const expectedEndMarkers = frames.length * 2;
  const endRatio = slipEndCount / expectedEndMarkers;
  if (endRatio > 2.0) {
    // 0xC0 appears more than twice as often as expected for delimiters
    confidence -= 20;
    notes.push('0xC0 appears frequently within frames - may include data bytes');
  } else if (endRatio <= 1.5) {
    // 0xC0 frequency matches expected delimiter pattern - strong SLIP indicator
    confidence += 15;
  }

  notes.push(`${frames.length} frames decoded`);

  if (confidence < 20) {
    return null;
  }

  return {
    mode: 'slip',
    confidence: Math.min(100, Math.max(0, confidence)),
    notes,
    estimatedFrameCount: frames.length,
    avgFrameLength: Math.round(avgLength),
    minFrameLength: minLength,
    maxFrameLength: maxLength,
  };
}

/**
 * Decode SLIP frames from raw bytes (helper for analysis)
 */
function decodeSlipFrames(rawBytes: number[]): number[][] {
  const frames: number[][] = [];
  let currentFrame: number[] = [];
  let inEscape = false;

  for (const byte of rawBytes) {
    if (byte === SLIP_END) {
      if (currentFrame.length > 0) {
        frames.push(currentFrame);
        currentFrame = [];
      }
      inEscape = false;
    } else if (byte === SLIP_ESC) {
      inEscape = true;
    } else if (inEscape) {
      if (byte === 0xDC) {
        currentFrame.push(SLIP_END);
      } else if (byte === 0xDD) {
        currentFrame.push(SLIP_ESC);
      } else {
        // Protocol error - push both
        currentFrame.push(SLIP_ESC);
        currentFrame.push(byte);
      }
      inEscape = false;
    } else {
      currentFrame.push(byte);
    }
  }

  return frames;
}

// ============================================================================
// Modbus RTU Detection
// ============================================================================

/**
 * Test for Modbus RTU framing by looking for valid CRC-16 patterns
 */
function testModbusRtuFraming(rawBytes: number[]): FramingCandidate | null {
  const notes: string[] = [];

  // Modbus RTU requires timing gaps for frame detection, which we don't have
  // in raw bytes. Instead, we scan for valid CRC-16 patterns.

  if (rawBytes.length < 4) {
    return null;
  }

  // Try to find valid Modbus frames by scanning for CRC matches
  const validFrames: number[][] = [];
  let i = 0;

  while (i < rawBytes.length - 3) {
    // Try frame lengths from 4 to 256 bytes
    let found = false;
    for (let len = 4; len <= Math.min(256, rawBytes.length - i); len++) {
      const candidate = rawBytes.slice(i, i + len);
      const dataWithoutCrc = new Uint8Array(candidate.slice(0, -2));
      const crc = crc16Modbus(dataWithoutCrc);
      const receivedCrc = candidate[len - 2] | (candidate[len - 1] << 8);

      if (crc === receivedCrc) {
        // Check for valid Modbus address (1-247) and function code (1-127)
        const addr = candidate[0];
        const func = candidate[1];
        if (addr >= 1 && addr <= 247 && func >= 1 && func <= 127) {
          validFrames.push(candidate);
          i += len;
          found = true;
          break;
        }
      }
    }
    if (!found) {
      i++;
    }
  }

  if (validFrames.length < 2) {
    return null;
  }

  const frameLengths = validFrames.map(f => f.length);
  const avgLength = frameLengths.reduce((a, b) => a + b, 0) / frameLengths.length;
  const minLength = Math.min(...frameLengths);
  const maxLength = Math.max(...frameLengths);

  // Calculate confidence
  let confidence = 0;

  // Base confidence from frame count
  if (validFrames.length >= 10) {
    confidence += 50;
  } else if (validFrames.length >= 5) {
    confidence += 35;
  } else {
    confidence += 20;
  }

  // Bonus for coverage - what % of bytes are in valid frames
  const coveredBytes = validFrames.reduce((sum, f) => sum + f.length, 0);
  const coverage = coveredBytes / rawBytes.length;
  if (coverage >= 0.8) {
    confidence += 30;
    notes.push(`${(coverage * 100).toFixed(0)}% of bytes in valid frames`);
  } else if (coverage >= 0.5) {
    confidence += 15;
  }

  // Check for consistent device addresses
  const addresses = new Set(validFrames.map(f => f[0]));
  if (addresses.size <= 3) {
    confidence += 10;
    notes.push(`${addresses.size} unique device address${addresses.size > 1 ? 'es' : ''}`);
  }

  notes.push(`${validFrames.length} valid CRC frames found`);

  if (confidence < 30) {
    return null;
  }

  return {
    mode: 'modbus_rtu',
    confidence: Math.min(100, Math.max(0, confidence)),
    notes,
    estimatedFrameCount: validFrames.length,
    avgFrameLength: Math.round(avgLength),
    minFrameLength: minLength,
    maxFrameLength: maxLength,
  };
}

// ============================================================================
// Delimiter-based Detection
// ============================================================================

/**
 * Test for delimiter-based framing by looking for common delimiters
 */
function testDelimiterFraming(rawBytes: number[]): FramingCandidate[] {
  const candidates: FramingCandidate[] = [];

  // Common delimiters to test (most likely first)
  const delimitersToTest: { bytes: number[]; name: string }[] = [
    { bytes: [0x0D, 0x0A], name: 'CRLF' },           // \r\n
    { bytes: [0x0A], name: 'LF' },                   // \n
    { bytes: [0x0D], name: 'CR' },                   // \r
    { bytes: [0x00], name: 'NUL' },                  // \0
    { bytes: [0x03], name: 'ETX' },                  // End of text
    { bytes: [0x04], name: 'EOT' },                  // End of transmission
  ];

  for (const { bytes: delimiter, name } of delimitersToTest) {
    const result = testDelimiter(rawBytes, delimiter, name);
    if (result) {
      candidates.push(result);
    }
  }

  return candidates;
}

/**
 * Test a specific delimiter against the raw bytes
 */
function testDelimiter(
  rawBytes: number[],
  delimiter: number[],
  delimiterName: string
): FramingCandidate | null {
  const notes: string[] = [];

  // Find all delimiter occurrences
  const delimiterPositions: number[] = [];
  for (let i = 0; i <= rawBytes.length - delimiter.length; i++) {
    let match = true;
    for (let j = 0; j < delimiter.length; j++) {
      if (rawBytes[i + j] !== delimiter[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      delimiterPositions.push(i);
    }
  }

  // Need at least 2 delimiters for any frames
  if (delimiterPositions.length < 2) {
    return null;
  }

  // Calculate frame lengths (between delimiters)
  const frameLengths: number[] = [];
  for (let i = 0; i < delimiterPositions.length - 1; i++) {
    const start = delimiterPositions[i] + delimiter.length;
    const end = delimiterPositions[i + 1];
    const len = end - start;
    if (len > 0) {
      frameLengths.push(len);
    }
  }

  if (frameLengths.length === 0) {
    return null;
  }

  const avgLength = frameLengths.reduce((a, b) => a + b, 0) / frameLengths.length;
  const minLength = Math.min(...frameLengths);
  const maxLength = Math.max(...frameLengths);

  // Calculate confidence
  let confidence = 0;

  // Base confidence from frame count
  if (frameLengths.length >= 10) {
    confidence += 35;
  } else if (frameLengths.length >= 3) {
    confidence += 20;
  } else {
    confidence += 10;
  }

  // Bonus for reasonable frame sizes
  if (avgLength >= 4 && avgLength <= 256) {
    confidence += 20;
  } else if (avgLength >= 1 && avgLength <= 1024) {
    confidence += 10;
  }

  // Bonus for consistent frame sizes
  if (frameLengths.length >= 3 && maxLength - minLength < avgLength * 0.5) {
    confidence += 15;
    notes.push('Consistent frame sizes');
  }

  // Bonus for common text delimiters if data looks like ASCII
  const printableCount = rawBytes.filter(b => b >= 0x20 && b <= 0x7E).length;
  const printableRatio = printableCount / rawBytes.length;
  if (printableRatio > 0.7 && (delimiterName === 'CRLF' || delimiterName === 'LF' || delimiterName === 'CR')) {
    confidence += 15;
    notes.push('Data appears to be ASCII text');
  }

  // Penalty if delimiter appears within expected frame content too often
  // (suggests it might be data, not a real delimiter)
  const expectedFrameCount = Math.floor(rawBytes.length / avgLength);
  if (delimiterPositions.length > expectedFrameCount * 2) {
    confidence -= 10;
  }

  notes.push(`${delimiterName} delimiter: ${frameLengths.length} frames`);

  if (confidence < 25) {
    return null;
  }

  return {
    mode: 'delimiter',
    confidence: Math.min(100, Math.max(0, confidence)),
    notes,
    delimiter,
    delimiterHex: delimiter.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(''),
    estimatedFrameCount: frameLengths.length,
    avgFrameLength: Math.round(avgLength),
    minFrameLength: minLength,
    maxFrameLength: maxLength,
  };
}
