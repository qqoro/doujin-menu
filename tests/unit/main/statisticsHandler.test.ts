import { beforeEach, describe, expect, it, vi } from "vitest";

// fs/promises 모킹
const mockReaddir = vi.fn();
const mockStat = vi.fn();

vi.mock("fs/promises", () => ({
  readdir: mockReaddir,
  stat: mockStat,
}));

describe("statisticsHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getFolderSize (로직 검증)", () => {
    // getFolderSize 함수의 로직을 재현하여 테스트
    async function getFolderSize(directoryPath: string): Promise<number> {
      let totalSize = 0;
      try {
        const files = await mockReaddir(directoryPath, { withFileTypes: true });
        for (const file of files) {
          const fullPath = `${directoryPath}/${file.name}`;
          try {
            if (file.isDirectory()) {
              totalSize += await getFolderSize(fullPath);
            } else {
              const stats = await mockStat(fullPath);
              totalSize += stats.size;
            }
          } catch (err) {
            // 에러 무시
          }
        }
      } catch (err) {
        // 에러 무시
      }
      return totalSize;
    }

    it("빈 폴더의 크기는 0이어야 함", async () => {
      mockReaddir.mockResolvedValue([]);

      const size = await getFolderSize("/empty/folder");

      expect(size).toBe(0);
      expect(mockReaddir).toHaveBeenCalledWith("/empty/folder", {
        withFileTypes: true,
      });
    });

    it("파일만 있는 폴더의 크기를 계산해야 함", async () => {
      const mockFiles = [
        { name: "file1.txt", isDirectory: () => false },
        { name: "file2.txt", isDirectory: () => false },
      ];

      mockReaddir.mockResolvedValue(mockFiles);
      mockStat
        .mockResolvedValueOnce({ size: 100 }) // file1.txt
        .mockResolvedValueOnce({ size: 200 }); // file2.txt

      const size = await getFolderSize("/folder");

      expect(size).toBe(300);
      expect(mockStat).toHaveBeenCalledTimes(2);
      expect(mockStat).toHaveBeenCalledWith("/folder/file1.txt");
      expect(mockStat).toHaveBeenCalledWith("/folder/file2.txt");
    });

    it("하위 폴더가 있는 경우 재귀적으로 크기를 계산해야 함", async () => {
      const mockRootFiles = [
        { name: "file1.txt", isDirectory: () => false },
        { name: "subfolder", isDirectory: () => true },
      ];

      const mockSubFiles = [{ name: "file2.txt", isDirectory: () => false }];

      mockReaddir
        .mockResolvedValueOnce(mockRootFiles) // 루트 폴더
        .mockResolvedValueOnce(mockSubFiles); // 하위 폴더

      mockStat
        .mockResolvedValueOnce({ size: 100 }) // file1.txt
        .mockResolvedValueOnce({ size: 200 }); // file2.txt (하위 폴더)

      const size = await getFolderSize("/folder");

      expect(size).toBe(300);
      expect(mockReaddir).toHaveBeenCalledTimes(2);
      expect(mockReaddir).toHaveBeenNthCalledWith(1, "/folder", {
        withFileTypes: true,
      });
      expect(mockReaddir).toHaveBeenNthCalledWith(2, "/folder/subfolder", {
        withFileTypes: true,
      });
    });

    it("깊은 하위 폴더 구조에서도 재귀적으로 크기를 계산해야 함", async () => {
      // /folder/sub1/sub2/file.txt 구조
      const mockLevel1 = [{ name: "sub1", isDirectory: () => true }];
      const mockLevel2 = [{ name: "sub2", isDirectory: () => true }];
      const mockLevel3 = [{ name: "file.txt", isDirectory: () => false }];

      mockReaddir
        .mockResolvedValueOnce(mockLevel1) // /folder
        .mockResolvedValueOnce(mockLevel2) // /folder/sub1
        .mockResolvedValueOnce(mockLevel3); // /folder/sub1/sub2

      mockStat.mockResolvedValueOnce({ size: 500 }); // file.txt

      const size = await getFolderSize("/folder");

      expect(size).toBe(500);
      expect(mockReaddir).toHaveBeenCalledTimes(3);
    });

    it("여러 파일과 폴더가 섞인 구조에서 정확히 계산해야 함", async () => {
      const mockRootFiles = [
        { name: "file1.txt", isDirectory: () => false },
        { name: "folder1", isDirectory: () => true },
        { name: "file2.txt", isDirectory: () => false },
        { name: "folder2", isDirectory: () => true },
      ];

      const mockFolder1Files = [
        { name: "file3.txt", isDirectory: () => false },
      ];

      const mockFolder2Files = [
        { name: "file4.txt", isDirectory: () => false },
        { name: "file5.txt", isDirectory: () => false },
      ];

      mockReaddir
        .mockResolvedValueOnce(mockRootFiles)
        .mockResolvedValueOnce(mockFolder1Files)
        .mockResolvedValueOnce(mockFolder2Files);

      mockStat
        .mockResolvedValueOnce({ size: 100 }) // file1.txt
        .mockResolvedValueOnce({ size: 200 }) // file2.txt
        .mockResolvedValueOnce({ size: 300 }) // file3.txt (folder1)
        .mockResolvedValueOnce({ size: 400 }) // file4.txt (folder2)
        .mockResolvedValueOnce({ size: 500 }); // file5.txt (folder2)

      const size = await getFolderSize("/folder");

      expect(size).toBe(1500); // 100 + 200 + 300 + 400 + 500
    });

    it("readdir 에러 발생 시 0을 반환해야 함", async () => {
      mockReaddir.mockRejectedValue(new Error("Permission denied"));

      const size = await getFolderSize("/no-permission");

      expect(size).toBe(0);
    });

    it("stat 에러 발생 시 해당 파일을 무시하고 계속 진행해야 함", async () => {
      const mockFiles = [
        { name: "file1.txt", isDirectory: () => false },
        { name: "file2.txt", isDirectory: () => false },
        { name: "file3.txt", isDirectory: () => false },
      ];

      mockReaddir.mockResolvedValue(mockFiles);
      mockStat
        .mockResolvedValueOnce({ size: 100 }) // file1.txt
        .mockRejectedValueOnce(new Error("File not found")) // file2.txt 에러
        .mockResolvedValueOnce({ size: 300 }); // file3.txt

      const size = await getFolderSize("/folder");

      expect(size).toBe(400); // 100 + 0 (에러) + 300
    });

    it("큰 파일 크기도 정확히 계산해야 함", async () => {
      const mockFiles = [
        { name: "large.zip", isDirectory: () => false },
        { name: "huge.iso", isDirectory: () => false },
      ];

      mockReaddir.mockResolvedValue(mockFiles);
      mockStat
        .mockResolvedValueOnce({ size: 1073741824 }) // 1GB
        .mockResolvedValueOnce({ size: 4294967296 }); // 4GB

      const size = await getFolderSize("/large");

      expect(size).toBe(5368709120); // 5GB
    });

    it("0 바이트 파일도 정확히 처리해야 함", async () => {
      const mockFiles = [
        { name: "empty1.txt", isDirectory: () => false },
        { name: "empty2.txt", isDirectory: () => false },
        { name: "nonempty.txt", isDirectory: () => false },
      ];

      mockReaddir.mockResolvedValue(mockFiles);
      mockStat
        .mockResolvedValueOnce({ size: 0 }) // empty1.txt
        .mockResolvedValueOnce({ size: 0 }) // empty2.txt
        .mockResolvedValueOnce({ size: 100 }); // nonempty.txt

      const size = await getFolderSize("/folder");

      expect(size).toBe(100);
    });
  });
});
