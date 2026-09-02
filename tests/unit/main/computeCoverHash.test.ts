import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { computeCoverHash } from "../../../src/main/services/duplicateDetection/computeCoverHash";
import {
  hammingDistance,
  hexToBytes,
} from "../../../src/main/services/duplicateDetection/coverHash";

/** 결정적인 패턴 이미지. seed가 같으면 같은 그림이 나온다 */
const patternImage = (width: number, height: number, seed: number) => {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      raw[i] = (x * 3 + seed * 40) % 256;
      raw[i + 1] = (y * 5 + seed * 17) % 256;
      raw[i + 2] = ((x ^ y) + seed * 90) % 256;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } });
};

const distanceBetween = (a: string, b: string) =>
  hammingDistance(hexToBytes(a)!, hexToBytes(b)!);

describe("computeCoverHash", () => {
  it("16자리 소문자 16진수를 돌려준다", async () => {
    const buffer = await patternImage(512, 720, 1).webp().toBuffer();
    expect(await computeCoverHash(buffer)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("같은 그림이면 해상도와 화질이 달라도 거의 같은 해시가 나온다", async () => {
    const original = await patternImage(512, 720, 1).webp().toBuffer();
    const shrunk = await patternImage(512, 720, 1)
      .resize(300)
      .webp({ quality: 40 })
      .toBuffer();

    const distance = distanceBetween(
      await computeCoverHash(original),
      await computeCoverHash(shrunk),
    );
    expect(distance).toBeLessThanOrEqual(4);
  });

  it("다른 그림이면 해시가 크게 벌어진다", async () => {
    const one = await patternImage(512, 720, 1).webp().toBuffer();
    const other = await patternImage(512, 720, 7).webp().toBuffer();

    const distance = distanceBetween(
      await computeCoverHash(one),
      await computeCoverHash(other),
    );
    expect(distance).toBeGreaterThan(4);
  });

  it("이미지가 아니면 예외를 던진다", async () => {
    await expect(
      computeCoverHash(Buffer.from("not an image")),
    ).rejects.toThrow();
  });
});
