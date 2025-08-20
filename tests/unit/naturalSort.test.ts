import { describe, expect, it } from "vitest";
import { naturalSort } from "../../src/main/utils";

describe("naturalSort", () => {
  it("should sort strings with numbers naturally", () => {
    const arr = ["file10.txt", "file2.txt", "file1.txt", "file20.txt"];
    arr.sort(naturalSort);
    expect(arr).toEqual(["file1.txt", "file2.txt", "file10.txt", "file20.txt"]);
  });

  it("should handle leading zeros correctly", () => {
    const arr = ["img001.png", "img010.png", "img002.png"];
    arr.sort(naturalSort);
    expect(arr).toEqual(["img001.png", "img002.png", "img010.png"]);
  });

  it("should sort mixed alphanumeric strings", () => {
    const arr = ["a1", "a10", "b2", "a2", "b1"];
    arr.sort(naturalSort);
    expect(arr).toEqual(["a1", "a2", "a10", "b1", "b2"]);
  });

  it("should handle strings with no numbers", () => {
    const arr = ["apple", "banana", "orange"];
    arr.sort(naturalSort);
    expect(arr).toEqual(["apple", "banana", "orange"]);
  });

  it("should handle empty strings", () => {
    const arr = ["", "a", "b"];
    arr.sort(naturalSort);
    expect(arr).toEqual(["", "a", "b"]);
  });

  it("should handle different lengths", () => {
    const arr = ["file1.txt", "file.txt", "file10.txt"];
    arr.sort(naturalSort);
    expect(arr).toEqual(["file1.txt", "file10.txt", "file.txt"]);
  });

  it("should handle numbers", () => {
    const arr = [
      "1.png",
      "10.png",
      "12.png",
      "2.png",
      "3.png",
      "6.png",
      "9.png",
    ];
    arr.sort(naturalSort);
    expect(arr).toEqual([
      "1.png",
      "2.png",
      "3.png",
      "6.png",
      "9.png",
      "10.png",
      "12.png",
    ]);
  });
});
