import { describe, expect, it } from "vitest";
import { detectInstallMode } from "@/lib/pwaInstall";

const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_SAFARI =
  "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

describe("detectInstallMode", () => {
  const base = {
    remote: true,
    secure: true,
    standalone: false,
    userAgent: ANDROID_CHROME,
    hasPrompt: true,
  };

  it("크롬이 설치 이벤트를 주면 설치 창을 띄운다", () => {
    expect(detectInstallMode(base)).toBe("prompt");
  });

  it("와이파이(HTTP), PC 앱, 이미 설치된 앱에서는 버튼이 없다", () => {
    expect(detectInstallMode({ ...base, secure: false })).toBeNull();
    expect(detectInstallMode({ ...base, remote: false })).toBeNull();
    expect(detectInstallMode({ ...base, standalone: true })).toBeNull();
  });

  it("안드로이드라도 설치 이벤트가 없으면 버튼이 없다", () => {
    expect(detectInstallMode({ ...base, hasPrompt: false })).toBeNull();
  });

  it("아이폰·아이패드는 우리 안내를 보여 준다", () => {
    expect(
      detectInstallMode({
        ...base,
        userAgent: IPHONE_SAFARI,
        hasPrompt: false,
      }),
    ).toBe("ios-guide");
    expect(
      detectInstallMode({ ...base, userAgent: IPAD_SAFARI, hasPrompt: false }),
    ).toBe("ios-guide");
  });

  it("아이폰도 HTTP나 설치된 앱에서는 버튼이 없다", () => {
    const ios = { ...base, userAgent: IPHONE_SAFARI, hasPrompt: false };
    expect(detectInstallMode({ ...ios, secure: false })).toBeNull();
    expect(detectInstallMode({ ...ios, standalone: true })).toBeNull();
  });
});
