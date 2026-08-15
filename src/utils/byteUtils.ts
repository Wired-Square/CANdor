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

/** Width of the "ASCII" column header, the floor for an empty or all-empty page. */
export const ASCII_COLUMN_MIN_CHARS = 5;
/** CAN FD's 64 bytes plus the two pipes — the widest the column is allowed to get. */
export const ASCII_COLUMN_MAX_CHARS = 66;

/**
 * Characters needed by the widest ASCII cell in `frames` — the payload plus the two
 * delimiting pipes.
 *
 * The column used to be a fixed 8rem, which fits about fifteen characters: fine for
 * CAN's 8 bytes, but serial frames run to 20 and beyond, so the cell wrapped mid-string
 * and ran into its neighbour. Sizing to the page's widest row fixes that, and the cap
 * keeps a pathological frame (SLIP has no length limit) from squeezing the flexible Data
 * column to nothing — past the cap the cell wraps, as it always did.
 */
export function asciiColumnChars(frames: readonly { bytes: number[] }[]): number {
  let widest = 0;
  for (const frame of frames) {
    if (frame.bytes.length > widest) widest = frame.bytes.length;
  }
  return Math.min(Math.max(widest + 2, ASCII_COLUMN_MIN_CHARS), ASCII_COLUMN_MAX_CHARS);
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
