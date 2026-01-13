// ui/src/utils/bits.ts

import type { Endianness } from "../types/catalog";

/**
 * Extract a bitfield from a byte array.
 * Supports little/big endianness interpretation and optional signed result.
 */
export function extractBits(
  bytes: number[],
  startBit: number,
  bitLength: number,
  endianness: Endianness,
  signed?: boolean
): number {
  if (bitLength <= 0) return 0;
  const bits: number[] = [];
  if (endianness === "little") {
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      for (let bit = 0; bit < 8; bit++) {
        bits.push((b >> bit) & 1);
      }
    }
  } else {
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      for (let bit = 7; bit >= 0; bit--) {
        bits.push((b >> bit) & 1);
      }
    }
  }
  const slice = bits.slice(startBit, startBit + bitLength);
  let value = 0;
  if (endianness === "little") {
    for (let i = slice.length - 1; i >= 0; i--) {
      value = (value << 1) | slice[i];
    }
  } else {
    for (let i = 0; i < slice.length; i++) {
      value = (value << 1) | slice[i];
    }
  }
  if (signed && bitLength > 0) {
    const signBit = 1 << (bitLength - 1);
    if (value & signBit) {
      value = value - (1 << bitLength);
    }
  }
  return value;
}
