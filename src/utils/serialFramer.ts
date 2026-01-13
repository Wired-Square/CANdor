// ui/src/utils/serialFramer.ts
//
// TypeScript implementation of serial framers for client-side preview/simulation.
// Mirrors the Rust framer logic from serial_reader.rs

// =============================================================================
// Types
// =============================================================================

export interface RawFramingConfig {
  type: 'raw';
  delimiter: number[];      // e.g., [0x0D, 0x0A] for CRLF
  maxLength: number;        // Max frame length before forced split
  includeDelimiter: boolean;
}

export interface ModbusRtuFramingConfig {
  type: 'modbus_rtu';
  deviceAddress?: number;   // Optional device address filter (1-247)
  validateCrc: boolean;
}

export interface SlipFramingConfig {
  type: 'slip';
}

export type FramingConfig = RawFramingConfig | ModbusRtuFramingConfig | SlipFramingConfig;

export interface FramedData {
  bytes: Uint8Array;
  timestampMs: number;
  frameIndex: number;
  /** Byte offset in the original data stream where this frame starts */
  startByteIndex: number;
  /** True if this frame came from flush() and may be incomplete (no delimiter found) */
  incomplete?: boolean;
}

// =============================================================================
// CRC-16 Modbus
// =============================================================================

/**
 * Calculate CRC-16 for Modbus RTU (polynomial 0xA001)
 */
export function crc16Modbus(data: Uint8Array): number {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Parse a hex string delimiter (e.g., "0D0A") to byte array
 */
export function parseDelimiterHex(hex: string): number[] {
  const cleaned = hex.replace(/\s+/g, '').replace(/^0x/i, '');
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    const byte = parseInt(cleaned.slice(i, i + 2), 16);
    if (!isNaN(byte)) {
      bytes.push(byte);
    }
  }
  return bytes;
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToUint8Array(hex: string): Uint8Array {
  const cleaned = hex.replace(/\s+/g, '').replace(/^0x/i, '');
  const bytes = new Uint8Array(Math.floor(cleaned.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Check if two arrays are equal
 */
function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// =============================================================================
// SLIP Constants (RFC 1055)
// =============================================================================

const SLIP_END = 0xC0;
const SLIP_ESC = 0xDB;
const SLIP_ESC_END = 0xDC;
const SLIP_ESC_ESC = 0xDD;

// =============================================================================
// Internal Framer Implementations
// =============================================================================

/** Frame with its starting byte offset in the input stream */
interface FrameWithOffset {
  bytes: Uint8Array;
  startOffset: number;
}

interface InternalFramer {
  feed(data: Uint8Array, baseOffset: number): FrameWithOffset[];
  flush(baseOffset: number): FrameWithOffset | null;
  reset(): void;
}

class RawFramerImpl implements InternalFramer {
  private buffer: number[] = [];
  private delimiter: number[];
  private maxLength: number;
  private includeDelimiter: boolean;
  private frameStartOffset: number = 0;

  constructor(config: RawFramingConfig) {
    this.delimiter = config.delimiter;
    this.maxLength = config.maxLength;
    this.includeDelimiter = config.includeDelimiter;
  }

  feed(data: Uint8Array, baseOffset: number): FrameWithOffset[] {
    const frames: FrameWithOffset[] = [];

    for (let i = 0; i < data.length; i++) {
      this.buffer.push(data[i]);

      // Check for delimiter match at end of buffer
      if (this.buffer.length >= this.delimiter.length) {
        const start = this.buffer.length - this.delimiter.length;
        const tail = this.buffer.slice(start);

        if (arraysEqual(tail, this.delimiter)) {
          let frame: number[];
          if (this.includeDelimiter) {
            frame = this.buffer.splice(0);
          } else {
            frame = this.buffer.splice(0, start);
            this.buffer = []; // Clear delimiter
          }
          if (frame.length > 0) {
            frames.push({
              bytes: new Uint8Array(frame),
              startOffset: this.frameStartOffset,
            });
          }
          // Next frame starts after delimiter
          this.frameStartOffset = baseOffset + i + 1;
        }
      }

      // Force split on max length
      if (this.buffer.length >= this.maxLength) {
        frames.push({
          bytes: new Uint8Array(this.buffer.splice(0)),
          startOffset: this.frameStartOffset,
        });
        this.frameStartOffset = baseOffset + i + 1;
      }
    }

    return frames;
  }

  flush(_baseOffset: number): FrameWithOffset | null {
    if (this.buffer.length > 0) {
      const frame = {
        bytes: new Uint8Array(this.buffer),
        startOffset: this.frameStartOffset,
      };
      this.buffer = [];
      return frame;
    }
    return null;
  }

  reset(): void {
    this.buffer = [];
    this.frameStartOffset = 0;
  }
}

class SlipFramerImpl implements InternalFramer {
  private buffer: number[] = [];
  private inEscape = false;
  private frameStartOffset: number = 0;

  feed(data: Uint8Array, baseOffset: number): FrameWithOffset[] {
    const frames: FrameWithOffset[] = [];

    for (let i = 0; i < data.length; i++) {
      const byte = data[i];

      switch (byte) {
        case SLIP_END:
          if (this.buffer.length > 0) {
            frames.push({
              bytes: new Uint8Array(this.buffer),
              startOffset: this.frameStartOffset,
            });
            this.buffer = [];
          }
          // Next frame starts after END byte
          this.frameStartOffset = baseOffset + i + 1;
          this.inEscape = false;
          break;

        case SLIP_ESC:
          this.inEscape = true;
          break;

        case SLIP_ESC_END:
          if (this.inEscape) {
            this.buffer.push(SLIP_END);
            this.inEscape = false;
          } else {
            this.buffer.push(byte);
          }
          break;

        case SLIP_ESC_ESC:
          if (this.inEscape) {
            this.buffer.push(SLIP_ESC);
            this.inEscape = false;
          } else {
            this.buffer.push(byte);
          }
          break;

        default:
          if (this.inEscape) {
            // Protocol error - push both bytes
            this.buffer.push(SLIP_ESC);
          }
          this.buffer.push(byte);
          this.inEscape = false;
      }
    }

    return frames;
  }

  flush(_baseOffset: number): FrameWithOffset | null {
    if (this.buffer.length > 0) {
      const frame = {
        bytes: new Uint8Array(this.buffer),
        startOffset: this.frameStartOffset,
      };
      this.buffer = [];
      return frame;
    }
    return null;
  }

  reset(): void {
    this.buffer = [];
    this.inEscape = false;
    this.frameStartOffset = 0;
  }
}

class ModbusRtuFramerImpl implements InternalFramer {
  private buffer: number[] = [];
  private deviceAddress?: number;
  private validateCrc: boolean;
  private frameStartOffset: number = 0;
  private bytesConsumed: number = 0;

  constructor(config: ModbusRtuFramingConfig) {
    this.deviceAddress = config.deviceAddress;
    this.validateCrc = config.validateCrc;
  }

  /**
   * For client-side Modbus RTU, timing-based detection isn't possible.
   * Instead, we accumulate data and try to extract valid frames by CRC validation.
   * This is a best-effort approach for preview purposes.
   */
  feed(data: Uint8Array, _baseOffset: number): FrameWithOffset[] {
    const frames: FrameWithOffset[] = [];
    this.buffer.push(...data);

    // Try to extract valid frames from buffer
    // Safety limit to prevent infinite loops on large buffers with no valid CRCs
    let iterations = 0;
    const maxIterations = this.buffer.length + 1000;

    while (this.buffer.length >= 4 && iterations < maxIterations) {
      iterations++;
      const extracted = this.tryExtractFrame();
      if (extracted) {
        frames.push({
          bytes: extracted.bytes,
          startOffset: this.frameStartOffset,
        });
        this.frameStartOffset += extracted.length;
        this.bytesConsumed += extracted.length;
      } else {
        // No valid frame found at current position, shift buffer
        this.buffer.shift();
        this.frameStartOffset++;
        this.bytesConsumed++;
      }
    }

    // If we hit the iteration limit, clear the buffer to prevent memory issues
    if (iterations >= maxIterations) {
      console.warn('ModbusRtuFramer: Hit iteration limit, clearing buffer');
      this.buffer = [];
    }

    return frames;
  }

  private tryExtractFrame(): { bytes: Uint8Array; length: number } | null {
    // Check device address filter
    if (this.deviceAddress !== undefined && this.buffer[0] !== this.deviceAddress) {
      return null;
    }

    // Try different frame lengths (4 to min(256, buffer.length))
    const maxLen = Math.min(256, this.buffer.length);
    for (let len = 4; len <= maxLen; len++) {
      const candidate = this.buffer.slice(0, len);

      if (this.validateCrc) {
        const dataWithoutCrc = new Uint8Array(candidate.slice(0, -2));
        const crc = crc16Modbus(dataWithoutCrc);
        const receivedCrc = candidate[len - 2] | (candidate[len - 1] << 8);

        if (crc === receivedCrc) {
          // Valid frame found
          this.buffer.splice(0, len);
          return { bytes: new Uint8Array(candidate), length: len };
        }
      } else {
        // Without CRC validation, we can't determine frame boundaries
        // Just return the minimum valid frame
        if (len === 4) {
          this.buffer.splice(0, len);
          return { bytes: new Uint8Array(candidate), length: len };
        }
      }
    }

    return null;
  }

  flush(_baseOffset: number): FrameWithOffset | null {
    if (this.buffer.length >= 4) {
      // Try to validate remaining buffer as a frame
      if (this.validateCrc) {
        const dataWithoutCrc = new Uint8Array(this.buffer.slice(0, -2));
        const crc = crc16Modbus(dataWithoutCrc);
        const receivedCrc = this.buffer[this.buffer.length - 2] | (this.buffer[this.buffer.length - 1] << 8);

        if (crc === receivedCrc) {
          const frame = {
            bytes: new Uint8Array(this.buffer),
            startOffset: this.frameStartOffset,
          };
          this.buffer = [];
          return frame;
        }
      } else {
        const frame = {
          bytes: new Uint8Array(this.buffer),
          startOffset: this.frameStartOffset,
        };
        this.buffer = [];
        return frame;
      }
    }
    this.buffer = [];
    return null;
  }

  reset(): void {
    this.buffer = [];
    this.frameStartOffset = 0;
    this.bytesConsumed = 0;
  }
}

// =============================================================================
// Public SerialFramer Class
// =============================================================================

/**
 * Stateful serial framer for streaming data.
 * Creates frames from raw bytes based on the specified framing configuration.
 */
export class SerialFramer {
  private framer: InternalFramer;
  private frameCounter = 0;
  private byteOffset = 0;
  private config: FramingConfig;

  constructor(config: FramingConfig) {
    this.config = config;

    switch (config.type) {
      case 'raw':
        this.framer = new RawFramerImpl(config);
        break;
      case 'slip':
        this.framer = new SlipFramerImpl();
        break;
      case 'modbus_rtu':
        this.framer = new ModbusRtuFramerImpl(config);
        break;
    }
  }

  /**
   * Feed raw bytes into the framer.
   * Returns any complete frames that were parsed.
   */
  feed(data: Uint8Array): FramedData[] {
    const rawFrames = this.framer.feed(data, this.byteOffset);
    const now = Date.now();
    this.byteOffset += data.length;

    return rawFrames.map(frame => ({
      bytes: frame.bytes,
      timestampMs: now,
      frameIndex: this.frameCounter++,
      startByteIndex: frame.startOffset,
    }));
  }

  /**
   * Flush any remaining buffered data as a frame.
   * Call when stream ends.
   * Returns a frame marked as incomplete since no delimiter was found.
   */
  flush(): FramedData | null {
    const rawFrame = this.framer.flush(this.byteOffset);
    if (rawFrame) {
      return {
        bytes: rawFrame.bytes,
        timestampMs: Date.now(),
        frameIndex: this.frameCounter++,
        startByteIndex: rawFrame.startOffset,
        incomplete: true, // Mark as incomplete - no delimiter found
      };
    }
    return null;
  }

  /**
   * Reset internal state for reuse.
   */
  reset(): void {
    this.framer.reset();
    this.frameCounter = 0;
    this.byteOffset = 0;
  }

  /**
   * Get the current framing configuration.
   */
  getConfig(): FramingConfig {
    return this.config;
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Frame bytes in a single batch (convenience function).
 * Creates a framer, feeds all data, flushes, and returns all frames.
 */
export function frameBytes(data: Uint8Array, config: FramingConfig): FramedData[] {
  const framer = new SerialFramer(config);
  const frames = framer.feed(data);
  const flushed = framer.flush();
  if (flushed) {
    frames.push(flushed);
  }
  return frames;
}

/**
 * SLIP encode data (for transmission)
 */
export function slipEncode(data: Uint8Array): Uint8Array {
  const encoded: number[] = [];
  encoded.push(SLIP_END); // Start with END to flush any line noise

  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    switch (byte) {
      case SLIP_END:
        encoded.push(SLIP_ESC, SLIP_ESC_END);
        break;
      case SLIP_ESC:
        encoded.push(SLIP_ESC, SLIP_ESC_ESC);
        break;
      default:
        encoded.push(byte);
    }
  }

  encoded.push(SLIP_END);
  return new Uint8Array(encoded);
}

/**
 * Calculate and append CRC-16 Modbus to data
 */
export function appendModbusCrc(data: Uint8Array): Uint8Array {
  const crc = crc16Modbus(data);
  const result = new Uint8Array(data.length + 2);
  result.set(data);
  result[data.length] = crc & 0xFF;        // Low byte first (little-endian)
  result[data.length + 1] = (crc >> 8) & 0xFF;
  return result;
}

/**
 * Validate Modbus RTU frame CRC
 */
export function validateModbusCrc(frame: Uint8Array): boolean {
  if (frame.length < 4) return false;
  const dataWithoutCrc = frame.slice(0, -2);
  const crc = crc16Modbus(dataWithoutCrc);
  const receivedCrc = frame[frame.length - 2] | (frame[frame.length - 1] << 8);
  return crc === receivedCrc;
}
