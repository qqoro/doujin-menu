import { describe, expect, it } from "vitest";
import {
  nextSortBy,
  toggledSortOrder,
  SORT_CYCLE,
  SORT_LABELS,
} from "../../../src/renderer/store/sortCycle";

describe("nextSortBy", () => {
  it("advances to the next criterion in the cycle", () => {
    expect(nextSortBy("added_at", SORT_CYCLE)).toBe("file_mtime");
    expect(nextSortBy("file_mtime", SORT_CYCLE)).toBe("title");
  });

  it("every cycle entry has a Korean label", () => {
    for (const key of SORT_CYCLE) {
      expect(SORT_LABELS[key]).toBeTruthy();
    }
  });

  it("wraps around from the last criterion to the first", () => {
    expect(nextSortBy("hitomi_id", SORT_CYCLE)).toBe("added_at");
  });

  it("falls back to the first criterion when current is unknown", () => {
    expect(nextSortBy("random", SORT_CYCLE)).toBe("added_at");
    expect(nextSortBy(undefined, SORT_CYCLE)).toBe("added_at");
  });

  it("never includes 'random' in the cycle", () => {
    expect(SORT_CYCLE).not.toContain("random");
  });
});

describe("toggledSortOrder", () => {
  it("flips asc to desc", () => {
    expect(toggledSortOrder("asc")).toBe("desc");
  });

  it("flips desc to asc", () => {
    expect(toggledSortOrder("desc")).toBe("asc");
  });

  it("defaults to desc when current is unknown", () => {
    expect(toggledSortOrder(undefined)).toBe("desc");
  });
});
