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
