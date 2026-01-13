// ui/src/utils/byteUtils.ts
// Centralized byte conversion utilities

/**
 * Convert a single byte (0-255) to uppercase hex string with zero-padding.
 * @example byteToHex(10) => "0A"
 * @example byteToHex(255) => "FF"
 */
export function byteToHex(byte: number): string {
  return byte.toString(16).padStart(2, '0').toUpperCase();
}

/**
 * Convert a byte array to uppercase hex string without separators.
 * @example bytesToHex([10, 255]) => "0AFF"
 */
export function bytesToHex(bytes: number[]): string {
  return bytes.map(byteToHex).join('');
}

/**
 * Convert a single byte to ASCII character, or '.' for non-printable bytes.
 * Printable range: 0x20 (space) to 0x7E (~)
 * @example byteToAscii(65) => "A"
 * @example byteToAscii(0) => "."
 */
export function byteToAscii(byte: number): string {
  return byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.';
}

/**
 * Convert a byte array to ASCII string, replacing non-printable bytes with '.'.
 * @example bytesToAscii([72, 105, 0]) => "Hi."
 */
export function bytesToAscii(bytes: number[]): string {
  return bytes.map(byteToAscii).join('');
}

/**
 * Convert a hex string to byte array.
 * Handles "0x" prefix and ignores non-hex characters.
 * @example hexToBytes("0AFF") => [10, 255]
 * @example hexToBytes("0x0AFF") => [10, 255]
 */
export function hexToBytes(hex: string): number[] {
  const clean = hex.replace(/^0x/i, '').replace(/[^0-9a-fA-F]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  return bytes;
}
