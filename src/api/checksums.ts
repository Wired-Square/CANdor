// ui/src/api/checksums.ts
//
// Tauri API wrappers for checksum calculation functions.
// These call the Rust backend for checksum calculations.

import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Types
// ============================================================================

/**
 * Supported checksum algorithms.
 * Must match the Rust ChecksumAlgorithm enum.
 */
export type ChecksumAlgorithm =
  | "xor"
  | "sum8"
  | "crc8"
  | "crc8_sae_j1850"
  | "crc8_autosar"
  | "crc8_maxim"
  | "crc8_cdma2000"
  | "crc8_dvb_s2"
  | "crc8_nissan"
  | "crc16_modbus"
  | "crc16_ccitt";

/**
 * Result of checksum validation.
 */
export interface ChecksumValidationResult {
  /** The checksum value extracted from the frame */
  extracted: number;
  /** The calculated checksum value */
  calculated: number;
  /** Whether the checksum is valid (extracted === calculated) */
  valid: boolean;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Calculate checksum using the specified algorithm with byte range.
 *
 * @param algorithm - The checksum algorithm to use
 * @param data - The complete frame data as bytes
 * @param calcStartByte - First byte index to include (supports negative indexing)
 * @param calcEndByte - Last byte index exclusive (supports negative indexing)
 * @returns The calculated checksum value
 */
export async function calculateChecksum(
  algorithm: ChecksumAlgorithm,
  data: number[] | Uint8Array,
  calcStartByte: number,
  calcEndByte: number
): Promise<number> {
  const dataArray = data instanceof Uint8Array ? Array.from(data) : data;
  return invoke<number>("calculate_checksum_cmd", {
    algorithm,
    data: dataArray,
    calcStartByte,
    calcEndByte,
  });
}

/**
 * Validate a checksum in frame data.
 *
 * @param algorithm - The checksum algorithm to use
 * @param data - The complete frame data as bytes
 * @param startByte - Byte offset where checksum is stored (supports negative indexing)
 * @param byteLength - Length of checksum (1 or 2 bytes)
 * @param bigEndian - true for big-endian, false for little-endian
 * @param calcStartByte - First byte to include in calculation (supports negative indexing)
 * @param calcEndByte - Last byte (exclusive) to include (supports negative indexing)
 * @returns Validation result with extracted, calculated, and valid fields
 */
export async function validateChecksum(
  algorithm: ChecksumAlgorithm,
  data: number[] | Uint8Array,
  startByte: number,
  byteLength: number,
  bigEndian: boolean,
  calcStartByte: number,
  calcEndByte: number
): Promise<ChecksumValidationResult> {
  const dataArray = data instanceof Uint8Array ? Array.from(data) : data;
  return invoke<ChecksumValidationResult>("validate_checksum_cmd", {
    algorithm,
    data: dataArray,
    startByte,
    byteLength,
    bigEndian,
    calcStartByte,
    calcEndByte,
  });
}

/**
 * Resolve a byte index, supporting negative indexing.
 * Negative indices count from the end: -1 = last byte, -2 = second-to-last, etc.
 *
 * @param index - The byte index (can be negative)
 * @param frameLength - Total frame length in bytes
 * @returns The resolved absolute byte index
 */
export async function resolveByteIndex(
  index: number,
  frameLength: number
): Promise<number> {
  return invoke<number>("resolve_byte_index_cmd", {
    index,
    frameLength,
  });
}

// ============================================================================
// Parameterised CRC Functions (for Discovery)
// ============================================================================

/**
 * CRC parameters for parameterised calculation.
 */
export interface CrcParameters {
  polynomial: number;
  init: number;
  xorOut: number;
  reflect: boolean;
}

/**
 * Result of batch CRC testing.
 */
export interface BatchDiscoveryResult {
  matchCount: number;
  totalCount: number;
}

/**
 * Calculate CRC-8 with arbitrary parameters.
 *
 * @param data - The data to calculate CRC over
 * @param polynomial - The CRC polynomial (0x00-0xFF)
 * @param init - Initial CRC value
 * @param xorOut - Final XOR value
 * @param reflect - Whether to use reflected (LSB-first) mode
 * @returns The calculated CRC-8 value
 */
export async function crc8Parameterised(
  data: number[] | Uint8Array,
  polynomial: number,
  init: number,
  xorOut: number,
  reflect: boolean
): Promise<number> {
  const dataArray = data instanceof Uint8Array ? Array.from(data) : data;
  return invoke<number>("crc8_parameterised_cmd", {
    data: dataArray,
    polynomial,
    init,
    xorOut,
    reflect,
  });
}

/**
 * Calculate CRC-16 with arbitrary parameters.
 *
 * @param data - The data to calculate CRC over
 * @param polynomial - The CRC polynomial (0x0000-0xFFFF)
 * @param init - Initial CRC value
 * @param xorOut - Final XOR value
 * @param reflectIn - Whether to reflect input bytes
 * @param reflectOut - Whether to reflect the final CRC output
 * @returns The calculated CRC-16 value
 */
export async function crc16Parameterised(
  data: number[] | Uint8Array,
  polynomial: number,
  init: number,
  xorOut: number,
  reflectIn: boolean,
  reflectOut: boolean
): Promise<number> {
  const dataArray = data instanceof Uint8Array ? Array.from(data) : data;
  return invoke<number>("crc16_parameterised_cmd", {
    data: dataArray,
    polynomial,
    init,
    xorOut,
    reflectIn,
    reflectOut,
  });
}

/**
 * Batch test a CRC configuration against multiple payloads.
 * Optimised for checksum discovery - tests one polynomial/config
 * against many frames in a single IPC call.
 *
 * @param payloads - Array of frame payloads to test
 * @param expectedChecksums - Expected checksum values for each payload
 * @param checksumBits - 8 for CRC-8, 16 for CRC-16
 * @param polynomial - The CRC polynomial to test
 * @param init - Initial CRC value
 * @param xorOut - Final XOR value
 * @param reflect - Whether to use reflected mode
 * @returns Match statistics
 */
export async function batchTestCrc(
  payloads: number[][],
  expectedChecksums: number[],
  checksumBits: 8 | 16,
  polynomial: number,
  init: number,
  xorOut: number,
  reflect: boolean
): Promise<BatchDiscoveryResult> {
  const result = await invoke<{ match_count: number; total_count: number }>(
    "batch_test_crc_cmd",
    {
      payloads,
      expectedChecksums,
      checksumBits,
      polynomial,
      init,
      xorOut,
      reflect,
    }
  );
  return {
    matchCount: result.match_count,
    totalCount: result.total_count,
  };
}
