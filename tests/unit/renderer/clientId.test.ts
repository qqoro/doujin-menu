import { describe, expect, it } from "vitest";
import { createClientId } from "@/lib/clientId";

describe("createClientId", () => {
  it("randomUUID가 없는 HTTP 페이지에서도 id를 만든다", () => {
    const insecureCrypto = {
      getRandomValues: <T extends ArrayBufferView>(array: T) =>
        globalThis.crypto.getRandomValues(array),
    };
    const a = createClientId(insecureCrypto);
    const b = createClientId(insecureCrypto);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
});
