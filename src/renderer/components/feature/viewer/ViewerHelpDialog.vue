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
  { keys: [["→"], ["Space"]], description: "다음 페이지" },
  { keys: [["←"]], description: "이전 페이지" },
  { keys: [["↑"], ["↓"]], description: "(웹툰 모드) 스크롤" },
  { keys: [["Home"]], description: "첫 페이지로 이동" },
  { keys: [["End"]], description: "마지막 페이지로 이동" },
  { keys: [["]"]], description: "다음 책으로 이동" },
  { keys: [["["]], description: "이전 책으로 이동" },
  { keys: [["Ctrl", "+", "1-9"]], description: "자동 넘김 시작 (1-9초 간격)" },
  { keys: [["Ctrl", "+", "0"]], description: "자동 넘김 중지" },
  { keys: [["Esc"]], description: "라이브러리로 돌아가기" },
  { keys: [["마우스 휠 클릭"]], description: "전체화면/창 모드 전환" },
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
          <Icon icon="solar:help-bold-duotone" class="w-6 h-6" />
          뷰어 도움말
        </DialogTitle>
        <DialogDescription>
          뷰어의 사용법과 유용한 단축키 목록입니다.
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-6 py-4">
        <div>
          <h3 class="font-semibold mb-2">기본 조작</h3>
          <ul class="list-disc list-inside text-sm text-muted-foreground">
            <li>화면의 좌우 가장자리를 클릭하여 페이지를 넘길 수 있습니다.</li>
            <li>화면 상단/하단에 마우스를 올리면 컨트롤 바가 나타납니다.</li>
            <li>
              컨트롤 바의 슬라이더를 이용해 원하는 페이지로 빠르게 이동할 수
              있습니다.
            </li>
          </ul>
        </div>

        <div>
          <h3 class="font-semibold mb-2">단축키</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <div
              v-for="kb in keybindings"
              :key="kb.description"
              class="flex items-center justify-between"
            >
              <span class="text-muted-foreground">{{ kb.description }}</span>
              <div class="flex items-center gap-1">
                <template v-for="(keyGroup, groupIndex) in kb.keys" :key="groupIndex">
                  <span class="flex items-center gap-1">
                    <template v-for="key in keyGroup" :key="key">
                      <kbd v-if="key !== '+'">{{ key }}</kbd>
                      <span v-else>+</span>
                    </template>
                  </span>
                  <span v-if="groupIndex < kb.keys.length - 1" class="mx-1">or</span>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
