import sharp from "sharp";

/**
 * 표지 이미지의 dHash(64비트)를 16진수 16자리로 돌려준다.
 *
 * 가로로 이웃한 픽셀의 밝기 대소만 비트로 적는다. 절대 밝기를 쓰지 않으므로
 * 해상도나 압축률이 달라도 같은 그림이면 같은 값이 나온다. 9x8로 줄이는 건
 * 한 줄에서 가로 비교를 8쌍 만들기 위해서다.
 */
export const computeCoverHash = async (
  input: Buffer | string,
): Promise<string> => {
  const { data } = await sharp(input)
    .grayscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hex = "";
  for (let y = 0; y < 8; y++) {
    let row = 0;
    for (let x = 0; x < 8; x++) {
      row = (row << 1) | (data[y * 9 + x] < data[y * 9 + x + 1] ? 1 : 0);
    }
    hex += row.toString(16).padStart(2, "0");
  }
  return hex;
};
