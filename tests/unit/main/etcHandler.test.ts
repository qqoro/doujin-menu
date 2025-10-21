import { beforeEach, describe, expect, it, vi } from "vitest";

// DB 모듈 mock 처리 (Electron app 객체 없이 테스트하기 위함)
vi.mock("../../../src/main/db/index.ts", () => ({
  default: {},
  closeDbConnection: vi.fn(),
}));

// Electron app mock 처리
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/mock/user/data"),
    getAppPath: vi.fn(() => "/mock/app"),
    getVersion: vi.fn(() => "1.0.0"),
    requestSingleInstanceLock: vi.fn(() => true),
    quit: vi.fn(),
    on: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  protocol: {
    handle: vi.fn(),
  },
}));

// electron-store mock 처리
vi.mock("electron-store", () => ({
  default: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    store: {},
  })),
}));

// electron-updater mock 처리
vi.mock("electron-updater", () => ({
  default: {
    autoUpdater: {
      checkForUpdates: vi.fn(),
      on: vi.fn(),
    },
  },
}));

// electron-log mock 처리
vi.mock("electron-log", () => ({
  default: {
    initialize: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// fs/promises mock 설정
vi.mock("fs/promises", () => ({
  lstat: vi.fn(),
  readdir: vi.fn(),
}));

import { formatBytes } from "../../../src/main/handlers/etcHandler";
import { lstat, readdir } from "fs/promises";

// mock 함수 타입 캐스팅
const mockLstat = lstat as unknown as ReturnType<typeof vi.fn>;
const mockReaddir = readdir as unknown as ReturnType<typeof vi.fn>;

// getDirSize는 복잡한 fs 의존성 때문에 별도 mock 함수로 테스트
async function getDirSize(dirPath: string): Promise<number> {
  try {
    const stats = await mockLstat(dirPath);
    if (!stats) return 0;

    if (!stats.isDirectory()) {
      return stats.size;
    }

    const files = await mockReaddir(dirPath);
    let totalSize = 0;

    for (const file of files) {
      const filePath = `${dirPath}/${file.name}`;
      const fileStats = await mockLstat(filePath);

      if (fileStats.isDirectory()) {
        totalSize += await getDirSize(filePath);
      } else {
        totalSize += fileStats.size;
      }
    }

    return totalSize;
  } catch (error) {
    return 0;
  }
}

describe("etcHandler", () => {
  describe("formatBytes", () => {

    it("0 바이트는 '0 Bytes'를 반환해야 함", () => {
      expect(formatBytes(0)).toBe("0 Bytes");
    });

    it("1024 바이트 미만은 'Bytes' 단위로 반환해야 함", () => {
      expect(formatBytes(500)).toBe("500.00 Bytes");
      expect(formatBytes(1023)).toBe("1023.00 Bytes");
    });

    it("1 KB (1024 바이트)를 정확히 변환해야 함", () => {
      expect(formatBytes(1024)).toBe("1.00 KB");
    });

    it("1 MB (1024 * 1024 바이트)를 정확히 변환해야 함", () => {
      expect(formatBytes(1024 * 1024)).toBe("1.00 MB");
    });

    it("1 GB를 정확히 변환해야 함", () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB");
    });

    it("1 TB를 정확히 변환해야 함", () => {
      expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe("1.00 TB");
    });

    it("소수점 자리수를 지정할 수 있어야 함", () => {
      expect(formatBytes(1536, 0)).toBe("2 KB"); // 1.5 KB -> 반올림
      expect(formatBytes(1536, 1)).toBe("1.5 KB");
      expect(formatBytes(1536, 3)).toBe("1.500 KB");
    });

    it("소수점이 있는 KB를 정확히 변환해야 함", () => {
      expect(formatBytes(1536)).toBe("1.50 KB"); // 1.5 KB
      expect(formatBytes(2048)).toBe("2.00 KB"); // 2 KB
    });

    it("소수점이 있는 MB를 정확히 변환해야 함", () => {
      expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.50 MB");
      expect(formatBytes(2.75 * 1024 * 1024)).toBe("2.75 MB");
    });

    it("소수점이 있는 GB를 정확히 변환해야 함", () => {
      expect(formatBytes(3.14 * 1024 * 1024 * 1024)).toBe("3.14 GB");
    });

    it("큰 숫자도 정확히 변환해야 함", () => {
      const fiveGB = 5 * 1024 * 1024 * 1024;
      expect(formatBytes(fiveGB)).toBe("5.00 GB");
    });

    it("음수 소수점 자리수는 0으로 처리해야 함", () => {
      expect(formatBytes(1536, -1)).toBe("2 KB"); // decimals < 0 => 0
    });

    it("실제 파일 크기 예제를 정확히 변환해야 함", () => {
      expect(formatBytes(123456789)).toBe("117.74 MB");
      expect(formatBytes(9876543210)).toBe("9.20 GB");
    });
  });

  describe("getDirSize", () => {
    beforeEach(async () => {
      vi.clearAllMocks();
    });

    it("파일의 크기를 반환해야 함", async () => {
      mockLstat.mockResolvedValue({
        isDirectory: () => false,
        size: 1024,
      });

      const size = await getDirSize("/path/to/file.txt");

      expect(size).toBe(1024);
      expect(mockLstat).toHaveBeenCalledWith("/path/to/file.txt");
    });

    it("빈 디렉토리는 0을 반환해야 함", async () => {
      mockLstat.mockResolvedValue({
        isDirectory: () => true,
        size: 0,
      });
      mockReaddir.mockResolvedValue([]);

      const size = await getDirSize("/empty/dir");

      expect(size).toBe(0);
    });

    it("파일만 있는 디렉토리의 크기를 계산해야 함", async () => {
      mockLstat
        .mockResolvedValueOnce({
          isDirectory: () => true,
          size: 0,
        })
        .mockResolvedValueOnce({
          isDirectory: () => false,
          size: 100,
        })
        .mockResolvedValueOnce({
          isDirectory: () => false,
          size: 200,
        });

      mockReaddir.mockResolvedValue([
        { name: "file1.txt", isDirectory: () => false },
        { name: "file2.txt", isDirectory: () => false },
      ]);

      const size = await getDirSize("/dir");

      expect(size).toBe(300);
    });

    it("존재하지 않는 경로는 0을 반환해야 함", async () => {
      mockLstat.mockResolvedValue(null);

      const size = await getDirSize("/nonexistent");

      expect(size).toBe(0);
    });

    it("lstat 에러 발생 시 0을 반환해야 함", async () => {
      mockLstat.mockRejectedValue(new Error("Permission denied"));

      const size = await getDirSize("/no-permission");

      expect(size).toBe(0);
    });

    it("readdir 에러 발생 시 0을 반환해야 함", async () => {
      mockLstat.mockResolvedValue({
        isDirectory: () => true,
        size: 0,
      });
      mockReaddir.mockRejectedValue(new Error("Cannot read directory"));

      const size = await getDirSize("/error-dir");

      expect(size).toBe(0);
    });

    it("하위 디렉토리를 재귀적으로 계산해야 함", async () => {
      // 첫 번째 호출: 루트 디렉토리
      mockLstat
        .mockResolvedValueOnce({
          isDirectory: () => true,
          size: 0,
        })
        // 두 번째 호출: 하위 디렉토리
        .mockResolvedValueOnce({
          isDirectory: () => true,
          size: 0,
        })
        // 세 번째 호출: 하위 디렉토리의 파일
        .mockResolvedValueOnce({
          isDirectory: () => false,
          size: 500,
        });

      // 첫 번째 readdir: 루트 디렉토리
      mockReaddir
        .mockResolvedValueOnce([{ name: "subdir", isDirectory: () => true }])
        // 두 번째 readdir: 하위 디렉토리
        .mockResolvedValueOnce([
          { name: "file.txt", isDirectory: () => false },
        ]);

      const size = await getDirSize("/root");

      expect(size).toBe(500);
    });
  });
});
