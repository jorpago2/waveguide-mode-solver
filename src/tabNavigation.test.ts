import { describe, expect, it } from "vitest";
import { nextTabIndex } from "./tabNavigation";

describe("nextTabIndex", () => {
  it("supports arrow wrapping and edge keys", () => {
    expect(nextTabIndex("ArrowRight", 2, 3)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(nextTabIndex("Home", 2, 3)).toBe(0);
    expect(nextTabIndex("End", 0, 3)).toBe(2);
    expect(nextTabIndex("Enter", 1, 3)).toBeUndefined();
  });
});
