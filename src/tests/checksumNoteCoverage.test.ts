// Rust decides *what* the checksum detector says; the frontend decides how.
//
// `detect_checksum_cmd` returns notes as `{ code, values }` so the prose stays
// translatable, which means the two halves are joined by a string rather than by
// a type. A code with no key renders as the raw key to the user, and a renamed
// interpolation variable silently drops a value — neither is a compile error.
//
// Parsing the Rust source is the same technique `sessionCallbackCoverage.test.ts`
// uses for the WS callbacks, and the reason is the same: types cannot see across
// the boundary, so the pin has to be behavioural.

import { describe, it, expect } from "vitest";
// `?raw` rather than node:fs — the same way sessionCallbackCoverage reads its
// source. The node types are not declared in this project.
import rustSource from "../../src-tauri/src/checksums.rs?raw";
import discovery from "../locales/en-AU/discovery.json";

const notes: Record<string, string> = discovery.serial.checksumNote;

/** Every `ChecksumNote::new("code", &[("var", …)])` / `::bare("code")` in the engine. */
function emittedNotes(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();

  // `bare` takes no values.
  for (const [, code] of rustSource.matchAll(/ChecksumNote::bare\(\s*"([A-Za-z]+)"/g)) {
    found.set(code, new Set());
  }

  // `new` is followed by a slice of (name, value) tuples, possibly across lines.
  for (const match of rustSource.matchAll(
    /ChecksumNote::new\(\s*"([A-Za-z]+)",\s*&\[([\s\S]*?)\],?\s*\)/g,
  )) {
    const [, code, body] = match;
    const vars = new Set([...body.matchAll(/\(\s*"([A-Za-z]+)"/g)].map((m) => m[1]));
    found.set(code, vars);
  }

  return found;
}

/** `{{name}}` placeholders in a translation string. */
function placeholders(text: string): Set<string> {
  return new Set([...text.matchAll(/\{\{\s*([A-Za-z]+)\s*\}\}/g)].map((m) => m[1]));
}

describe("checksum detection notes", () => {
  const emitted = emittedNotes();

  it("finds the note codes in the Rust source", () => {
    // Guards the parser itself: a refactor that changes how notes are constructed
    // must not make this suite silently vacuous.
    expect(emitted.size).toBeGreaterThan(10);
    expect(emitted.has("matchesAll")).toBe(true);
    expect(emitted.get("matchesAll")).toEqual(new Set(["count"]));
  });

  it("has a translation for every code Rust can emit", () => {
    const missing = [...emitted.keys()].filter((code) => !(code in notes));
    expect(missing).toEqual([]);
  });

  it("has no translation for a code nothing emits", () => {
    const orphaned = Object.keys(notes).filter((code) => !emitted.has(code));
    expect(orphaned).toEqual([]);
  });

  it("interpolates exactly the values Rust sends", () => {
    const mismatched: string[] = [];

    for (const [code, vars] of emitted) {
      const text = notes[code];
      if (text === undefined) continue; // covered by the test above
      const expected = placeholders(text);

      const unused = [...vars].filter((v) => !expected.has(v));
      const undefinedVars = [...expected].filter((v) => !vars.has(v));
      if (unused.length || undefinedVars.length) {
        mismatched.push(
          `${code}: Rust sends [${[...vars].sort()}], translation uses [${[...expected].sort()}]`,
        );
      }
    }

    expect(mismatched).toEqual([]);
  });
});
