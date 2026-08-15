// Page-size sentinel resolution and the Auto row-count arithmetic.
//
// The DOM half of useAutoRowCount is not covered here — Vitest runs with
// `environment: "node"` and no jsdom, which is why the arithmetic is exported separately.

import { describe, it, expect } from "vitest";
import {
  PAGE_SIZE_AUTO,
  PAGE_SIZE_ALL,
  DEFAULT_PAGE_SIZE,
  ALL_FALLBACK_ROWS,
  resolvePageSize,
} from "../utils/pageSize";
import { computeAutoRows, shouldCommit } from "../hooks/useAutoRowCount";

describe("resolvePageSize", () => {
  it("passes a plain size through", () => {
    expect(resolvePageSize(50, 33)).toBe(50);
  });

  it("resolves Auto to the measured row count", () => {
    expect(resolvePageSize(PAGE_SIZE_AUTO, 33)).toBe(33);
  });

  it("propagates the unmeasured zero so callers can skip the fetch", () => {
    // The whole point: a view guards on `<= 0` rather than fetching an arbitrary page at
    // mount and replacing it a frame later.
    expect(resolvePageSize(PAGE_SIZE_AUTO, 0)).toBe(0);
  });

  it("resolves All to the supplied total, or a bounded fallback", () => {
    expect(resolvePageSize(PAGE_SIZE_ALL, 33, 4812)).toBe(4812);
    expect(resolvePageSize(PAGE_SIZE_ALL, 33)).toBe(ALL_FALLBACK_ROWS);
  });

  it("never returns a negative or zero size for a non-Auto setting", () => {
    // A stray sentinel from persisted or stale state must not become an offset.
    expect(resolvePageSize(0, 0)).toBe(DEFAULT_PAGE_SIZE);
    expect(resolvePageSize(-7, 0)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("clamps a bogus All total rather than requesting zero rows", () => {
    expect(resolvePageSize(PAGE_SIZE_ALL, 0, 0)).toBe(1);
  });
});

describe("computeAutoRows", () => {
  const base = { headerPx: 29, reservedPx: 32, rowHeight: 24, minRows: 5, maxRows: 500 };

  it("fits rows into the space left after header and reserved chrome", () => {
    // 800 - 29 - 32 = 739 usable; 739 / 24 = 30.8 -> 30
    expect(computeAutoRows({ ...base, availPx: 800 })).toBe(30);
  });

  it("floors at minRows on a tiny container", () => {
    expect(computeAutoRows({ ...base, availPx: 70 })).toBe(base.minRows);
  });

  it("caps at maxRows on a very tall container", () => {
    expect(computeAutoRows({ ...base, availPx: 100_000 })).toBe(base.maxRows);
  });

  it("refuses to divide by an implausible row height", () => {
    // A zero here would produce Infinity rows and a catastrophic query.
    expect(computeAutoRows({ ...base, availPx: 800, rowHeight: 0 })).toBe(0);
  });
});

describe("shouldCommit", () => {
  it("commits the first measurement", () => {
    expect(shouldCommit(30, 0, 739, 0, 24)).toBe(true);
  });

  it("ignores a recomputation that lands on the same count", () => {
    expect(shouldCommit(30, 30, 739, 735, 24)).toBe(false);
  });

  it("holds a count change that is within half a row of noise", () => {
    // Container resting on a row boundary: without this, sub-pixel drift flips the count
    // back and forth, and every flip is a refetch.
    expect(shouldCommit(31, 30, 745, 739, 24)).toBe(false);
  });

  it("commits once the height has genuinely moved", () => {
    expect(shouldCommit(34, 30, 835, 739, 24)).toBe(true);
  });
});
