<script setup lang="ts">
import { computed } from "vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Icon } from "@iconify/vue";
import { useKeybindingStore } from "@/store/keybindingStore";
import { getKeyLabel } from "@/lib/keybindings/utils";

const emit = defineEmits<{ (e: "update:open", value: boolean): void }>();

const store = useKeybindingStore();

// store에서 뷰어 바인딩을 가져와 기존 도움말 형식으로 변환
// 각 key는 정규화된 문자열(예: 'Ctrl+1', 'ArrowRight')이므로
// getKeyLabel로 표시용 라벨로 변환 후 1개짜리 배열로 감쌈
const viewerBindings = computed(() => {
  return store.getBindingsForContext("viewer").map((binding) => ({
    keys: binding.keys.map((key) => [getKeyLabel(key)]),
    description: binding.description,
  }));
});

// 마우스 관련 항목은 keybinding 시스템 밖이므로 별도 정적 배열 유지
const mouseBindings = [
  { keys: [["Ctrl", "휠"]], description: "이미지 확대/축소" },
  { keys: [["휠 클릭"]], description: "전체화면 전환" },
];
</script>

<template>
  <Dialog @update:open="emit('update:open', $event)">
    <DialogTrigger as-child>
      <slot />
    </DialogTrigger>
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Icon icon="solar:help-bold-duotone" class="h-6 w-6" />
          뷰어 도움말
        </DialogTitle>
        <DialogDescription>
          뷰어의 사용법과 유용한 단축키 목록입니다.
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-6 py-4">
        <div>
          <h3 class="mb-2 font-semibold">기본 조작</h3>
          <ul class="text-muted-foreground list-inside list-disc text-sm">
            <li>
              화면의 좌우 가장자리를 클릭하여 페이지를 넘길 수 있습니다. (읽기
              방향 설정에 따라 방향이 달라집니다)
            </li>
            <li>마우스 휠로 페이지를 넘길 수 있습니다. (웹툰 모드 제외)</li>
            <li>화면 상단/하단에 마우스를 올리면 컨트롤 바가 나타납니다.</li>
            <li>
              컨트롤 바의 슬라이더를 이용해 원하는 페이지로 빠르게 이동할 수
              있습니다.
            </li>
            <li>확대된 이미지를 마우스로 드래그하여 이동할 수 있습니다.</li>
            <li>더블 페이지 모드에서는 두 페이지를 동시에 볼 수 있습니다.</li>
            <li>
              페이지를 이동하면 확대/축소 상태가 자동으로 초기화됩니다. (웹툰
              모드 제외)
            </li>
            <li>
              웹툰 모드에서는 확대/축소 기능을 사용할 수 있으며, 스크롤 시에도
              줌 레벨이 유지됩니다.
            </li>
            <li>
              웹툰 태그가 있는 책을 열면 자동으로 웹툰 모드로 전환됩니다. (다른
              책으로 이동하거나 뷰어를 나가면 원래 설정으로 복원됩니다)
            </li>
          </ul>
        </div>

        <div>
          <h3 class="mb-2 font-semibold">단축키</h3>
          <div class="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <!-- keybinding store에서 동적으로 가져온 뷰어 단축키 -->
            <div
              v-for="kb in viewerBindings"
              :key="kb.description"
              class="flex items-center justify-between"
            >
              <span class="text-muted-foreground">{{ kb.description }}</span>
              <div class="flex flex-wrap items-center gap-1">
                <template
                  v-for="(keyGroup, groupIndex) in kb.keys"
                  :key="groupIndex"
                >
                  <span class="flex items-center gap-1">
                    <template v-for="(key, index) in keyGroup" :key="key">
                      <kbd>{{ key }}</kbd>
                      <span
                        v-if="
                          keyGroup.length !== 1 && index !== keyGroup.length - 1
                        "
                        >+</span
                      >
                    </template>
                  </span>
                  <span v-if="groupIndex < kb.keys.length - 1" class="mx-1"
                    >or</span
                  >
                </template>
              </div>
            </div>

            <!-- 마우스 관련 항목은 keybinding 시스템 밖이므로 별도 렌더링 -->
            <div
              v-for="kb in mouseBindings"
              :key="kb.description"
              class="flex items-center justify-between"
            >
              <span class="text-muted-foreground">{{ kb.description }}</span>
              <div class="flex flex-wrap items-center gap-1">
                <template
                  v-for="(keyGroup, groupIndex) in kb.keys"
                  :key="groupIndex"
                >
                  <span class="flex items-center gap-1">
                    <template v-for="(key, index) in keyGroup" :key="key">
                      <kbd>{{ key }}</kbd>
                      <span
                        v-if="
                          keyGroup.length !== 1 && index !== keyGroup.length - 1
                        "
                        >+</span
                      >
                    </template>
                  </span>
                  <span v-if="groupIndex < kb.keys.length - 1" class="mx-1"
                    >or</span
                  >
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
