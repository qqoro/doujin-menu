<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Icon } from "@iconify/vue";

const emit = defineEmits<{ (e: "update:open", value: boolean): void }>();

const keybindings = [
  {
    keys: [["→"], ["↓"], ["PageDown"], ["Space"]],
    description: "다음 페이지",
    line: true,
  },
  { keys: [["←"], ["↑"], ["PageUp"]], description: "이전 페이지", line: true },
  { keys: [["↑"], ["↓"]], description: "(웹툰 모드) 스크롤" },
  { keys: [["Home"]], description: "첫 페이지로 이동" },
  { keys: [["End"]], description: "마지막 페이지로 이동" },
  { keys: [["]"]], description: "다음 책으로 이동" },
  { keys: [["["]], description: "이전 책으로 이동" },
  { keys: [["\\"]], description: "랜덤 책으로 이동" },
  { keys: [["A"]], description: "자동 다음 책 토글" },
  { keys: [["+"], ["="]], description: "이미지 확대" },
  { keys: [["-"], ["_"]], description: "이미지 축소" },
  { keys: [["0"]], description: "확대/축소 초기화" },
  { keys: [["Ctrl", "휠"]], description: "이미지 확대/축소" },
  { keys: [["Ctrl", "1-9"]], description: "자동 넘김 시작 (1-9초 간격)" },
  { keys: [["Ctrl", "0"]], description: "자동 넘김 중지" },
  { keys: [["`"]], description: "책 정보 보기/숨기기" },
  { keys: [["Esc"]], description: "라이브러리로 돌아가기" },
  { keys: [["Enter"]], description: "전체화면/창 모드 전환" },
  { keys: [["휠 클릭"]], description: "완전 전체화면/창 모드 전환" },
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
            <li>화면의 좌우 가장자리를 클릭하여 페이지를 넘길 수 있습니다.</li>
            <li>화면 상단/하단에 마우스를 올리면 컨트롤 바가 나타납니다.</li>
            <li>
              컨트롤 바의 슬라이더를 이용해 원하는 페이지로 빠르게 이동할 수
              있습니다.
            </li>
            <li>확대된 이미지를 마우스로 드래그하여 이동할 수 있습니다.</li>
            <li>
              페이지를 이동하면 확대/축소 상태가 자동으로 초기화됩니다. (웹툰
              모드 제외)
            </li>
            <li>
              웹툰 모드에서는 확대/축소 기능을 사용할 수 있으며, 스크롤 시에도
              줌 레벨이 유지됩니다.
            </li>
          </ul>
        </div>

        <div>
          <h3 class="mb-2 font-semibold">단축키</h3>
          <div class="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div
              v-for="kb in keybindings"
              :key="kb.description"
              class="flex items-center justify-between"
              :class="{ 'col-span-full': kb.line }"
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
