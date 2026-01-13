import { describe, it, expect } from "vitest";
import { validateSignalFields } from "../apps/catalog/validate";
import type { ValidationError } from "../apps/catalog/types";

describe("validateSignalFields", () => {
  it("passes for a minimal valid signal", () => {
    const errors = validateSignalFields({
      name: "speed",
      start_bit: 0,
      bit_length: 8,
    });
    expect(errors).toHaveLength(0);
  });

  it("requires a non-empty name", () => {
    const errors = validateSignalFields({
      name: "   ",
      start_bit: 0,
      bit_length: 8,
    });
    expect(errors.some((e: ValidationError) => e.field === "signal.name")).toBe(true);
  });

  it("rejects negative or non-integer start_bit", () => {
    const errors = validateSignalFields({
      name: "speed",
      start_bit: -1,
      bit_length: 8,
    });
    expect(errors.some((e: ValidationError) => e.field === "signal.start_bit")).toBe(true);
  });

  it("rejects invalid bit_length", () => {
    const errors = validateSignalFields({
      name: "speed",
      start_bit: 0,
      bit_length: 0,
    });
    expect(errors.some((e: ValidationError) => e.field === "signal.bit_length")).toBe(true);
  });

  it("rejects invalid endianness", () => {
    const errors = validateSignalFields({
      name: "speed",
      start_bit: 0,
      bit_length: 8,
      endianness: "middle" as any,
    });
    expect(errors.some((e: ValidationError) => e.field === "signal.endianness")).toBe(true);
  });

  it("rejects min/max when min is greater than max", () => {
    const errors = validateSignalFields({
      name: "speed",
      start_bit: 0,
      bit_length: 8,
      min: 10,
      max: 5,
    });
    expect(errors.some((e: ValidationError) => e.field === "signal.range")).toBe(true);
  });

  it("rejects non-object enum", () => {
    const errors = validateSignalFields({
      name: "speed",
      start_bit: 0,
      bit_length: 8,
      enum: "not-an-object" as any,
    });
    expect(errors.some((e: ValidationError) => e.field === "signal.enum")).toBe(true);
  });
});
