import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Preset } from "../../../src/types/ipc";

// DB 모킹
const mockSelect = vi.fn();
const mockOrderBy = vi.fn();
const mockInsert = vi.fn();
const mockReturning = vi.fn();
const mockWhere = vi.fn();
const mockUpdate = vi.fn();
const mockDel = vi.fn();

const mockDb = vi.fn(() => ({
  select: mockSelect,
  orderBy: mockOrderBy,
  insert: mockInsert,
  where: mockWhere,
  update: mockUpdate,
  del: mockDel,
}));

vi.mock("../../../src/main/db/index.js", () => ({
  default: mockDb,
}));

// 테스트 대상 함수 import (모킹 후에 import 해야 함)
const {
  handleGetPresets,
  handleAddPreset,
  handleUpdatePreset,
  handleDeletePreset,
} = await import("../../../src/main/handlers/presetHandler.js");

describe("presetHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("handleGetPresets", () => {
    it("모든 프리셋을 이름 순으로 정렬하여 반환해야 함", async () => {
      const mockPresets: Preset[] = [
        {
          id: 1,
          name: "프리셋 A",
          query: "artist:작가1",
        },
        {
          id: 2,
          name: "프리셋 B",
          query: "tag:태그1",
        },
      ];

      // 체이닝된 메서드 모킹
      mockOrderBy.mockReturnValue({ select: vi.fn().mockResolvedValue(mockPresets) });
      mockSelect.mockReturnValue({ orderBy: mockOrderBy });

      const result = await handleGetPresets();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockPresets);
      expect(mockDb).toHaveBeenCalledWith("presets");
      expect(mockOrderBy).toHaveBeenCalledWith("name", "asc");
    });

    it("DB 오류 시 에러를 반환해야 함", async () => {
      const errorMessage = "Database connection failed";
      mockOrderBy.mockReturnValue({
        select: vi.fn().mockRejectedValue(new Error(errorMessage)),
      });
      mockSelect.mockReturnValue({ orderBy: mockOrderBy });

      const result = await handleGetPresets();

      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
    });
  });

  describe("handleAddPreset", () => {
    it("새 프리셋을 추가하고 반환해야 함", async () => {
      const newPreset: Omit<Preset, "id"> = {
        name: "새 프리셋",
        query: "type:만화",
      };

      const addedPreset: Preset = { id: 3, ...newPreset };

      // 체이닝된 메서드 모킹
      mockReturning.mockResolvedValue([addedPreset]);
      mockInsert.mockReturnValue({ returning: mockReturning });

      const result = await handleAddPreset(newPreset);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(addedPreset);
      expect(mockDb).toHaveBeenCalledWith("presets");
      expect(mockInsert).toHaveBeenCalledWith(newPreset);
      expect(mockReturning).toHaveBeenCalledWith("*");
    });

    it("DB 오류 시 에러를 반환해야 함", async () => {
      const newPreset: Omit<Preset, "id"> = {
        name: "새 프리셋",
        query: "type:만화",
      };

      const errorMessage = "Constraint violation";
      mockReturning.mockRejectedValue(new Error(errorMessage));
      mockInsert.mockReturnValue({ returning: mockReturning });

      const result = await handleAddPreset(newPreset);

      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
    });
  });

  describe("handleUpdatePreset", () => {
    it("기존 프리셋을 수정해야 함", async () => {
      const updatedPreset: Preset = {
        id: 1,
        name: "수정된 프리셋",
        query: "artist:수정된작가",
      };

      // 체이닝된 메서드 모킹
      mockUpdate.mockResolvedValue(1); // 1개 행 수정
      mockWhere.mockReturnValue({ update: mockUpdate });

      const result = await handleUpdatePreset(updatedPreset);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(updatedPreset);
      expect(mockDb).toHaveBeenCalledWith("presets");
      expect(mockWhere).toHaveBeenCalledWith("id", updatedPreset.id);
      expect(mockUpdate).toHaveBeenCalledWith(updatedPreset);
    });

    it("DB 오류 시 에러를 반환해야 함", async () => {
      const updatedPreset: Preset = {
        id: 1,
        name: "수정된 프리셋",
        query: "artist:수정된작가",
      };

      const errorMessage = "Preset not found";
      mockUpdate.mockRejectedValue(new Error(errorMessage));
      mockWhere.mockReturnValue({ update: mockUpdate });

      const result = await handleUpdatePreset(updatedPreset);

      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
    });
  });

  describe("handleDeletePreset", () => {
    it("프리셋을 삭제하고 삭제된 ID를 반환해야 함", async () => {
      const presetId = 5;

      // 체이닝된 메서드 모킹
      mockDel.mockResolvedValue(1); // 1개 행 삭제
      mockWhere.mockReturnValue({ del: mockDel });

      const result = await handleDeletePreset(presetId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: presetId });
      expect(mockDb).toHaveBeenCalledWith("presets");
      expect(mockWhere).toHaveBeenCalledWith("id", presetId);
      expect(mockDel).toHaveBeenCalled();
    });

    it("DB 오류 시 에러를 반환해야 함", async () => {
      const presetId = 999;
      const errorMessage = "Preset not found";

      mockDel.mockRejectedValue(new Error(errorMessage));
      mockWhere.mockReturnValue({ del: mockDel });

      const result = await handleDeletePreset(presetId);

      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
    });
  });
});
