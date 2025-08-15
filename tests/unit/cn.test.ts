import { describe, expect, it } from "vitest";
import { cn } from "../../src/lib/utils"; // Adjust path as needed

describe("cn", () => {
  it("should merge class names correctly", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
    expect(cn("foo", "bar", "baz")).toBe("foo bar baz");
  });

  it("should handle conditional class names", () => {
    // eslint-disable-next-line no-constant-binary-expression
    expect(cn("foo", true && "bar", false && "baz")).toBe("foo bar");
  });

  it("should merge Tailwind CSS classes correctly", () => {
    expect(cn("px-2", "py-2")).toBe("px-2 py-2");
    expect(cn("p-2", "px-4")).toBe("p-2 px-4"); // px-4 should override p-2 for x-axis padding
  });

  it("should handle empty inputs", () => {
    expect(cn()).toBe("");
    expect(cn("")).toBe("");
    expect(cn("foo", "", "bar")).toBe("foo bar");
  });
});
