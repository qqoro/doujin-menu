import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  KeybindingContext,
  KeybindingOverride,
  ResolvedBinding,
} from "../lib/keybindings/types";
import { defaultActions } from "../lib/keybindings/defaults";

export const useKeybindingStore = defineStore("keybinding", () => {
  // 사용자 오버라이드 목록 (electron-store에서 로드된 값)
  const overrides = ref<KeybindingOverride[]>([]);

  // 기본값 + 오버라이드 병합된 최종 바인딩
  const resolvedBindings = computed<ResolvedBinding[]>(() => {
    return defaultActions.map((action) => {
      const override = overrides.value.find((o) => o.actionId === action.id);
      return {
        ...action,
        keys: override ? override.keys : action.defaultKeys,
        isModified: !!override,
      };
    });
  });

  // 키 → 액션 역매핑 (O(1) 조회용 캐시)
  const keyToActionMap = computed(() => {
    const map = new Map<string, Map<string, ResolvedBinding>>();
    for (const binding of resolvedBindings.value) {
      if (!map.has(binding.context)) {
        map.set(binding.context, new Map());
      }
      const contextMap = map.get(binding.context)!;
      for (const key of binding.keys) {
        contextMap.set(key, binding);
      }
    }
    return map;
  });

  // 특정 컨텍스트의 바인딩 목록 반환
  function getBindingsForContext(
    context: KeybindingContext,
  ): ResolvedBinding[] {
    return resolvedBindings.value.filter((b) => b.context === context);
  }

  // 컨텍스트 + 키로 액션 찾기 (없으면 null)
  function findActionByKey(
    context: KeybindingContext,
    key: string,
  ): ResolvedBinding | null {
    return keyToActionMap.value.get(context)?.get(key) ?? null;
  }

  // 저장된 오버라이드 로드 (앱 시작 시 electron-store에서 불러올 때 사용)
  function loadOverrides(saved: KeybindingOverride[]) {
    overrides.value = saved;
  }

  // 액션의 키 변경 (동일 컨텍스트 내 충돌하는 키 자동 해제)
  function setKeys(
    actionId: string,
    keys: string[],
  ): { removedFrom?: { actionId: string; key: string }[] } {
    const action = defaultActions.find((a) => a.id === actionId);
    if (!action) return {};

    // 같은 컨텍스트에서 충돌하는 키를 가진 다른 액션에서 해당 키 제거
    const removedFrom: { actionId: string; key: string }[] = [];
    for (const key of keys) {
      const existing = findActionByKey(action.context, key);
      if (existing && existing.id !== actionId) {
        const existingKeys = existing.keys.filter((k) => k !== key);
        _setOverride(existing.id, existingKeys);
        removedFrom.push({ actionId: existing.id, key });
      }
    }

    _setOverride(actionId, keys);
    return { removedFrom };
  }

  // 개별 액션을 기본값으로 복원
  function resetAction(actionId: string) {
    overrides.value = overrides.value.filter((o) => o.actionId !== actionId);
  }

  // 전체 오버라이드 초기화 (모든 액션을 기본값으로)
  function resetAll() {
    overrides.value = [];
  }

  // 내부 헬퍼: 오버라이드 설정 또는 제거
  function _setOverride(actionId: string, keys: string[]) {
    const action = defaultActions.find((a) => a.id === actionId);
    if (!action) return;

    // 변경 후 키가 기본값과 동일하면 오버라이드 제거 (불필요한 저장 방지)
    const isDefault =
      JSON.stringify([...keys].sort()) ===
      JSON.stringify([...action.defaultKeys].sort());
    if (isDefault) {
      overrides.value = overrides.value.filter((o) => o.actionId !== actionId);
    } else {
      const existing = overrides.value.find((o) => o.actionId === actionId);
      if (existing) {
        existing.keys = keys;
      } else {
        overrides.value.push({ actionId, keys });
      }
    }
  }

  // 현재 오버라이드 배열 반환 (electron-store 저장용)
  function getOverrides(): KeybindingOverride[] {
    return JSON.parse(JSON.stringify(overrides.value));
  }

  return {
    resolvedBindings,
    getBindingsForContext,
    findActionByKey,
    loadOverrides,
    setKeys,
    resetAction,
    resetAll,
    getOverrides,
  };
});
