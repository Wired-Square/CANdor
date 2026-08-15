// What the framing detector concludes, and why.
//
// This engine had no tests, despite being the model the checksum detector is
// built on — the two now share a shape (sweep, score, rank, explain), so the
// scoring behaviour they have in common is worth pinning in both.

import { describe, it, expect } from "vitest";
import { detectFraming } from "../utils/analysis/framingDetection";

const SLIP_END = 0xc0;
const SLIP_ESC = 0xdb;

/** Wrap payloads in SLIP frames, escaping END/ESC as the protocol requires. */
function slipStream(payloads: number[][]): number[] {
  const out: number[] = [];
  for (const payload of payloads) {
    out.push(SLIP_END);
    for (const byte of payload) {
      if (byte === SLIP_END) out.push(SLIP_ESC, 0xdc);
      else if (byte === SLIP_ESC) out.push(SLIP_ESC, 0xdd);
      else out.push(byte);
    }
    out.push(SLIP_END);
  }
  return out;
}

function ascii(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0));
}

describe("detectFraming", () => {
  it("returns nothing for an empty stream, with a note saying so", () => {
    const result = detectFraming([]);
    expect(result.bestCandidate).toBeNull();
    expect(result.candidates).toHaveLength(0);
    expect(result.notes.join(" ")).toContain("No bytes");
  });

  it("identifies SLIP and reports the frames it decoded", () => {
    const payloads = Array.from({ length: 60 }, (_, i) => [0x01, 0x02, i & 0xff, 0x04, 0x05, 0x06]);
    const result = detectFraming(slipStream(payloads));

    expect(result.bestCandidate?.mode).toBe("slip");
    expect(result.bestCandidate!.confidence).toBeGreaterThanOrEqual(70);
    expect(result.bestCandidate!.estimatedFrameCount).toBe(60);
    expect(result.bestCandidate!.avgFrameLength).toBe(6);
  });

  it("credits escape sequences as evidence of real SLIP", () => {
    const plain = Array.from({ length: 60 }, () => [0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
    // Same shape, but the payload contains bytes that must be escaped.
    const escaped = Array.from({ length: 60 }, () => [0x01, SLIP_END, 0x03, SLIP_ESC, 0x05, 0x06]);

    const withoutEscapes = detectFraming(slipStream(plain)).candidates.find((c) => c.mode === "slip");
    const withEscapes = detectFraming(slipStream(escaped)).candidates.find((c) => c.mode === "slip");

    expect(withEscapes!.confidence).toBeGreaterThan(withoutEscapes!.confidence);
    expect(withEscapes!.notes.join(" ")).toContain("escape sequences");
  });

  it("identifies CRLF-delimited ASCII and says the data looks like text", () => {
    const stream = ascii(
      Array.from({ length: 40 }, (_, i) => `READ,${i},OK`).join("\r\n") + "\r\n",
    );
    const result = detectFraming(stream);

    const crlf = result.candidates.find((c) => c.mode === "delimiter" && c.delimiterHex === "0D0A");
    expect(crlf).toBeDefined();
    expect(crlf!.notes.join(" ")).toContain("ASCII text");
  });

  it("finds Modbus RTU frames by their CRC rather than by timing", () => {
    // Timing gaps are lost before detection runs, so the detector scans for valid
    // CRC-16 runs instead. These are real request frames with correct checksums.
    const frames = [
      [0x01, 0x03, 0x00, 0x00, 0x00, 0x0a, 0xc5, 0xcd],
      [0x01, 0x03, 0x00, 0x00, 0x00, 0x0a, 0xc5, 0xcd],
      [0x01, 0x03, 0x00, 0x00, 0x00, 0x0a, 0xc5, 0xcd],
      [0x01, 0x03, 0x00, 0x00, 0x00, 0x0a, 0xc5, 0xcd],
    ];
    const result = detectFraming(frames.flat());
    const modbus = result.candidates.find((c) => c.mode === "modbus_rtu");

    expect(modbus).toBeDefined();
    expect(modbus!.estimatedFrameCount).toBeGreaterThanOrEqual(2);
  });

  it("penalises 0xC0 appearing far more often than framing would need", () => {
    // Long runs of 0xC0 between short payloads — an idle line, or 0xC0 as data.
    // Either way there are far more END markers than two per decoded frame.
    const padded: number[] = [];
    for (let i = 0; i < 60; i++) {
      padded.push(0x01, 0x02, 0x03, 0x04);
      for (let j = 0; j < 10; j++) padded.push(SLIP_END);
    }

    const slip = detectFraming(padded).candidates.find((c) => c.mode === "slip");
    expect(slip!.notes.join(" ")).toContain("may include data bytes");
  });

  it("ranks candidates by confidence, best first", () => {
    const payloads = Array.from({ length: 60 }, () => [0x01, 0x02, 0x03, 0x04]);
    const result = detectFraming(slipStream(payloads));

    const confidences = result.candidates.map((c) => c.confidence);
    expect(confidences).toEqual([...confidences].sort((a, b) => b - a));
    expect(result.bestCandidate).toBe(result.candidates[0]);
  });

  it("summarises the strength of the best guess in its notes", () => {
    const payloads = Array.from({ length: 60 }, () => [0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
    const result = detectFraming(slipStream(payloads));

    expect(result.notes.join(" ")).toMatch(/Strong|Possible|Weak/);
    expect(result.byteCount).toBeGreaterThan(0);
  });
});
