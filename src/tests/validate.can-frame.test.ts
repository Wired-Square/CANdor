import { describe, it, expect } from "vitest";
import { validateCanFrameFields } from "../apps/catalog/validate";
import type { ValidationError } from "../apps/catalog/types";

describe("validateCanFrameFields", () => {
  it("requires an id", () => {
    const errors = validateCanFrameFields({ id: "", length: 8 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e: ValidationError) => e.field === "frame.can.id")).toBe(true);
  });

  it("accepts 0x-prefixed hex ids", () => {
    const errors = validateCanFrameFields({ id: "0x123", length: 8 });
    expect(errors).toHaveLength(0);
  });

  it("accepts decimal ids", () => {
    const errors = validateCanFrameFields({ id: "291", length: 8 });
    expect(errors).toHaveLength(0);
  });

  it("rejects invalid id formats", () => {
    const errors = validateCanFrameFields({ id: "abc", length: 8 });
    expect(errors.some((e: ValidationError) => e.field === "frame.can.id")).toBe(true);
  });

  it("rejects non-integer length", () => {
    const errors = validateCanFrameFields({ id: "0x123", length: 8.5 as any });
    expect(errors.some((e: ValidationError) => e.field === "frame.can.length")).toBe(true);
  });

  it("rejects length out of range", () => {
    const errors = validateCanFrameFields({ id: "0x123", length: 65 });
    expect(errors.some((e: ValidationError) => e.field === "frame.can.length")).toBe(true);
  });

  it("rejects negative interval", () => {
    const errors = validateCanFrameFields({ id: "0x123", length: 8, interval: -1 });
    expect(errors.some((e: ValidationError) => e.field === "frame.can.tx.interval_ms")).toBe(true);
  });

  it("rejects non-integer interval", () => {
    const errors = validateCanFrameFields({ id: "0x123", length: 8, interval: 1.2 as any });
    expect(errors.some((e: ValidationError) => e.field === "frame.can.tx.interval_ms")).toBe(true);
  });

  it("enforces uniqueness against existingIds (new frame)", () => {
    const errors = validateCanFrameFields(
      { id: "0x123", length: 8 },
      { existingIds: ["0x123", "0x456"], oldId: null }
    );
    expect(errors.some((e: ValidationError) => e.field === "frame.can.id")).toBe(true);
  });

  it("allows same id when editing (oldId matches)", () => {
    const errors = validateCanFrameFields(
      { id: "0x123", length: 8 },
      { existingIds: ["0x123", "0x456"], oldId: "0x123" }
    );
    expect(errors).toHaveLength(0);
  });

  it("enforces transmitter membership when peers provided", () => {
    const errors = validateCanFrameFields(
      { id: "0x123", length: 8, transmitter: "bogus" },
      { availablePeers: ["nodeA", "nodeB"] }
    );
    expect(errors.some((e: ValidationError) => e.field === "frame.can.transmitter")).toBe(true);
  });

  it("does not enforce transmitter when peers list is empty", () => {
    const errors = validateCanFrameFields(
      { id: "0x123", length: 8, transmitter: "bogus" },
      { availablePeers: [] }
    );
    expect(errors).toHaveLength(0);
  });
});
