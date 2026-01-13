import { describe, it, expect } from "vitest";
import { tomlParse } from "../apps/catalog/toml";
import { deleteSignalToml, upsertSignalToml, deleteMuxToml, deleteMuxCaseToml } from "../apps/catalog/editorOps";

const baseToml = `
[frame.can."0x123"]
length = 8

[[frame.can."0x123".signals]]
name = "A"
start_bit = 0
bit_length = 8

[frame.can."0x123".mux]
name = "mux"
start_bit = 0
bit_length = 8

[frame.can."0x123".mux.case1]
foo = "bar"
`;

describe("deleteSignalToml", () => {
  it("is a no-op when the target path does not exist", () => {
    const result = deleteSignalToml(baseToml, ["frame", "can", "0x999"], 0);
    expect(tomlParse(result)).toEqual(tomlParse(baseToml));
  });

  it("removes the targeted signal index when present", () => {
    const result = deleteSignalToml(baseToml, ["frame", "can", "0x123"], 0);
    const parsed = tomlParse(result) as any;
    expect(Array.isArray(parsed.frame.can["0x123"].signals)).toBe(true);
    expect(parsed.frame.can["0x123"].signals).toHaveLength(0);
  });
});

describe("signal upsert into mux cases", () => {
  it("adds a signal under a mux case without disturbing other content", () => {
    const result = upsertSignalToml(
      baseToml,
      ["frame", "can", "0x123", "mux", "case1"],
      { name: "B", start_bit: 8, bit_length: 8 },
      null
    );
    const parsed = tomlParse(result) as any;
    expect(parsed.frame.can["0x123"].mux.case1.signals).toHaveLength(1);
    expect(parsed.frame.can["0x123"].mux.case1.signals[0].name).toBe("B");
    // Original mux properties stay intact
    expect(parsed.frame.can["0x123"].mux.name).toBe("mux");
  });
});

describe("deleteMuxToml", () => {
  it("is a no-op when the mux path does not exist", () => {
    const result = deleteMuxToml(baseToml, ["frame", "can", "0x999", "mux"]);
    expect(tomlParse(result)).toEqual(tomlParse(baseToml));
  });

  it("removes the mux object when present", () => {
    const result = deleteMuxToml(baseToml, ["frame", "can", "0x123", "mux"]);
    const parsed = tomlParse(result) as any;
    expect(parsed.frame.can["0x123"].mux).toBeUndefined();
  });
});

describe("deleteMuxCaseToml", () => {
  it("removes only the targeted case", () => {
    const result = deleteMuxCaseToml(baseToml, ["frame", "can", "0x123", "mux"], "case1");
    const parsed = tomlParse(result) as any;
    expect(parsed.frame.can["0x123"].mux.case1).toBeUndefined();
    expect(parsed.frame.can["0x123"].mux.name).toBe("mux");
  });
});
