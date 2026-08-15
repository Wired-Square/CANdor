// The arithmetic behind the frame table's ASCII column width: the two delimiting
// pipes, the header floor, and the cap. See asciiColumnChars for why it is derived.

import { describe, it, expect } from "vitest";
import {
  asciiColumnChars,
  dataColumnChars,
  ASCII_COLUMN_MIN_CHARS,
  ASCII_COLUMN_MAX_CHARS,
  DATA_COLUMN_MIN_CHARS,
} from "../utils/byteUtils";

/** Rows as the table sees them — only `bytes` matters for width. */
const rows = (...lengths: number[]) => lengths.map((n) => ({ bytes: Array(n).fill(0) }));

describe("ASCII column width", () => {
  it("counts the payload plus both pipes", () => {
    expect(asciiColumnChars(rows(8))).toBe(10);
    expect(asciiColumnChars(rows(20))).toBe(22);
  });

  it("sizes to the widest row on the page, not the first or last", () => {
    expect(asciiColumnChars(rows(1, 20, 16, 1))).toBe(22);
  });

  it("never falls below the header width", () => {
    expect(asciiColumnChars([])).toBe(ASCII_COLUMN_MIN_CHARS);
    expect(asciiColumnChars(rows(0, 1))).toBe(ASCII_COLUMN_MIN_CHARS);
  });

  it("fits a full CAN FD frame without capping", () => {
    expect(asciiColumnChars(rows(64))).toBe(ASCII_COLUMN_MAX_CHARS);
  });

  it("caps a pathological frame so the Data column keeps its space", () => {
    // SLIP has no length limit, and the backend default max is 1024.
    expect(asciiColumnChars(rows(1024))).toBe(ASCII_COLUMN_MAX_CHARS);
    expect(asciiColumnChars(rows(20, 1024))).toBe(ASCII_COLUMN_MAX_CHARS);
  });

  it("is unaffected by byte values — width is a function of length alone", () => {
    expect(asciiColumnChars([{ bytes: [0x00, 0xff, 0x41] }])).toBe(ASCII_COLUMN_MIN_CHARS);
  });
});

describe("Data column width", () => {
  it("counts two characters per byte with single spaces between", () => {
    expect(dataColumnChars(rows(8))).toBe(23);  // 8 pairs + 7 spaces
    expect(dataColumnChars(rows(20))).toBe(59);
  });

  it("sizes to the widest row on the page", () => {
    expect(dataColumnChars(rows(1, 20, 16))).toBe(59);
  });

  it("never falls below the header width", () => {
    expect(dataColumnChars([])).toBe(DATA_COLUMN_MIN_CHARS);
    expect(dataColumnChars(rows(0))).toBe(DATA_COLUMN_MIN_CHARS);
    // A page of single-byte frames renders "FC" — narrower than the header.
    expect(dataColumnChars(rows(1))).toBe(DATA_COLUMN_MIN_CHARS);
  });

  it("is not capped — Data is the payload, so a long frame scrolls rather than wraps", () => {
    expect(dataColumnChars(rows(1024))).toBe(3071);
  });
});
