import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { tomlParse, tomlStringify } from "../apps/catalog/toml";

// Use the example decoder from src-tauri as the test fixture (single source of truth)
const fixturePath = resolve(__dirname, "../../src-tauri/examples/sbrxxx.toml");

describe("sbrxxx.toml", () => {
  it("parses without throwing", () => {
    const text = readFileSync(fixturePath, "utf-8");

    const obj = tomlParse(text);

    expect(obj).toBeTruthy();
    expect(typeof obj).toBe("object");
  });

  it("round-trips (parse -> stringify -> parse) without throwing", () => {
    const text = readFileSync(fixturePath, "utf-8");

    const obj1 = tomlParse(text);
    const text2 = tomlStringify(obj1);
    const obj2 = tomlParse(text2);

    expect(obj2).toBeTruthy();
    expect(typeof obj2).toBe("object");
  });

  it('quotes table header segments that start with digits or "0x"', () => {
    // Minimal object that will produce a header like [canid.0x123]
    const obj = { canid: { "0x123": { length: 8 } } };

    const text = tomlStringify(obj);

    // Your helper should ensure the header is quoted
    expect(text).toContain('[canid."0x123"]');

    // And it should still parse
    expect(() => tomlParse(text)).not.toThrow();
  });
});
