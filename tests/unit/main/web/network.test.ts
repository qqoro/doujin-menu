import { describe, expect, it } from "vitest";
import type os from "node:os";
import {
  classifyRoute,
  findDefaultRouteAddress,
  isPrivateIPv4,
  pickLanAddresses,
  selectLanAddress,
} from "../../../../src/main/web/network.js";

const iface = (address: string, internal = false) =>
  ({ family: "IPv4", address, internal }) as os.NetworkInterfaceInfo;

describe("isPrivateIPv4", () => {
  it("사설 대역 리터럴만 참", () => {
    expect(isPrivateIPv4("192.168.0.10")).toBe(true);
    expect(isPrivateIPv4("10.1.2.3")).toBe(true);
    expect(isPrivateIPv4("172.16.0.1")).toBe(true);
    expect(isPrivateIPv4("172.31.255.1")).toBe(true);
  });

  it("공인 IP, Tailscale 대역, 도메인은 거짓", () => {
    expect(isPrivateIPv4("172.32.0.1")).toBe(false);
    expect(isPrivateIPv4("8.8.8.8")).toBe(false);
    expect(isPrivateIPv4("100.101.102.103")).toBe(false);
    expect(isPrivateIPv4("evil.example.com")).toBe(false);
    expect(isPrivateIPv4("192.168.0.10.evil.com")).toBe(false);
    expect(isPrivateIPv4("192.168.0.256")).toBe(false);
  });
});

describe("pickLanAddresses", () => {
  it("가상 어댑터, Tailscale, 루프백을 빼고 순서를 지킨다", () => {
    expect(
      pickLanAddresses({
        "Wi-Fi": [iface("192.168.0.5")],
        "vEthernet (WSL)": [iface("172.20.0.1")],
        "VirtualBox Host-Only Network": [iface("192.168.56.1")],
        "VMware Network Adapter VMnet8": [iface("192.168.200.1")],
        Tailscale: [iface("100.90.1.2")],
        Loopback: [iface("127.0.0.1", true)],
        이더넷: [
          {
            family: "IPv6",
            address: "fe80::1",
            internal: false,
          } as os.NetworkInterfaceInfo,
          iface("10.0.0.3"),
        ],
      }),
    ).toEqual(["192.168.0.5", "10.0.0.3"]);
  });
});

describe("selectLanAddress", () => {
  it("저장값이 후보에 있으면 그것을 쓴다", () => {
    expect(selectLanAddress(["192.168.0.5", "10.0.0.3"], "10.0.0.3")).toBe(
      "10.0.0.3",
    );
  });

  it("저장값의 어댑터가 사라지면 첫 후보로 대체한다", () => {
    expect(selectLanAddress(["192.168.0.5"], "10.0.0.3")).toBe("192.168.0.5");
    expect(selectLanAddress(["192.168.0.5"], undefined)).toBe("192.168.0.5");
  });

  it("후보가 없으면 null", () => {
    expect(selectLanAddress([], "")).toBeNull();
  });

  it("저장값이 없으면 기본 경로의 주소를 먼저 쓴다 (이름이 '이더넷 3'인 가상 어댑터 대비)", () => {
    const candidates = ["192.168.56.1", "172.30.1.11"];
    expect(selectLanAddress(candidates, "", "172.30.1.11")).toBe("172.30.1.11");
    expect(selectLanAddress(candidates, "192.168.56.1", "172.30.1.11")).toBe(
      "192.168.56.1",
    );
    expect(selectLanAddress(candidates, "", "100.124.184.22")).toBe(
      "192.168.56.1",
    );
    expect(selectLanAddress(candidates, "", null)).toBe("192.168.56.1");
  });
});

describe("findDefaultRouteAddress", () => {
  it("인터넷으로 나가는 쪽의 IPv4 주소를 돌려주거나, 없으면 null", async () => {
    const address = await findDefaultRouteAddress();
    expect(address === null || /^\d+\.\d+\.\d+\.\d+$/.test(address)).toBe(true);
  });
});

describe("classifyRoute", () => {
  it("Host 이름으로 접속 경로를 나눈다", () => {
    expect(classifyRoute("192.168.0.5", null)).toBe("lan");
    expect(classifyRoute("home.tail1.ts.net", null)).toBe("tailscale");
    expect(classifyRoute("menu.example.com", "menu.example.com")).toBe(
      "custom",
    );
  });

  it("로컬 주소로 들어온 요청은 이 PC", () => {
    expect(classifyRoute("127.0.0.1", null)).toBe("local");
    expect(classifyRoute("localhost", "menu.example.com")).toBe("local");
  });
});
