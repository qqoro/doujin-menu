<script setup lang="ts">
import { ipcRenderer } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { withPairCode } from "@/lib/pairing";
import { Icon } from "@iconify/vue";
import { useNow } from "@vueuse/core";
import { computed } from "vue";
import type { MobileWebStatus } from "../../../../types/ipc";
import CopyField from "./CopyField.vue";
import QrCode from "./QrCode.vue";

const props = defineProps<{
  tailscale: MobileWebStatus["tailscale"];
  customUrl: string | null;
  pairing: NonNullable<MobileWebStatus["pairing"]>;
  checkedAt: number;
  checking: boolean;
}>();

const emit = defineEmits<{ recheck: [] }>();

const TAILSCALE_DOWNLOAD_URL = "https://tailscale.com/download";

const ready = computed(() => {
  if (props.customUrl) {
    return {
      url: props.customUrl,
      badge: "직접 입력 주소",
      description: props.customUrl.startsWith("https://")
        ? "직접 입력한 주소로 접속합니다. HTTPS라 앱 설치와 자동 재생 중 화면 꺼짐 방지도 됩니다."
        : "직접 입력한 주소로 접속합니다. HTTP라 와이파이 접속처럼 앱 설치와 화면 꺼짐 방지는 되지 않습니다.",
      installable: props.customUrl.startsWith("https://"),
    };
  }
  const { state, url } = props.tailscale;
  if ((state === "funnel" || state === "serve") && url) {
    return {
      url,
      badge: state === "funnel" ? "외부 공개" : "tailnet 전용",
      description:
        state === "funnel"
          ? "폰에는 설치가 필요 없습니다. 어디서든 접속되고, 앱 설치와 자동 재생 중 화면 꺼짐 방지도 됩니다."
          : "Tailscale이 로그인된 기기에서만 열립니다. 폰에 Tailscale 없이 쓰려면 아래 명령으로 Funnel을 켜세요.",
      installable: true,
    };
  }
  return null;
});

const now = useNow({ interval: 1000 });
const checkedLabel = computed(() => {
  const seconds = Math.floor((now.value.getTime() - props.checkedAt) / 1000);
  return seconds < 5 ? "방금 확인" : `${seconds}초 전 확인`;
});

const openDownload = () =>
  ipcRenderer.send("open-external-link", TAILSCALE_DOWNLOAD_URL);
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Icon icon="solar:global-bold-duotone" class="text-primary size-5" />
        {{ customUrl ? "밖에서도" : "밖에서도 (Tailscale)" }}
        <Badge v-if="ready" variant="secondary" class="ml-auto">{{
          ready.badge
        }}</Badge>
        <Badge v-else variant="outline" class="ml-auto">설정 필요</Badge>
      </CardTitle>
      <CardDescription>
        {{
          ready?.description ??
          "PC에만 설치하면 밖에서도 접속됩니다. 앱 설치와 자동 재생 중 화면 꺼짐 방지도 이 주소에서만 돼요."
        }}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div v-if="ready" class="flex flex-wrap items-center gap-4">
        <QrCode :value="withPairCode(ready.url, pairing.code)" />
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <CopyField :value="ready.url.replace(/\/$/, '')" />
          <p
            v-if="ready.installable"
            class="text-muted-foreground flex items-start gap-1.5 text-xs"
          >
            <Icon
              icon="solar:download-minimalistic-bold-duotone"
              class="mt-px size-4 shrink-0"
            />
            이 주소로 열면 폰에서 "앱 설치" 버튼이 나타납니다
          </p>
          <CopyField
            v-if="!customUrl && tailscale.state === 'serve'"
            :value="tailscale.command"
            mono
          />
        </div>
      </div>
      <ol
        v-else
        class="marker:text-muted-foreground flex list-decimal flex-col gap-3 pl-5 text-sm"
      >
        <li>
          <div class="flex flex-wrap items-center gap-2">
            PC에 Tailscale 설치 후 로그인
            <Button variant="outline" size="sm" @click="openDownload">
              <Icon icon="solar:square-top-down-bold-duotone" class="size-4" />
              다운로드 페이지
            </Button>
          </div>
        </li>
        <li>
          명령 프롬프트나 PowerShell에서 아래 명령어를 한 번 실행
          <CopyField :value="tailscale.command" mono class="mt-2" />
        </li>
        <li>
          처음 실행하면 명령어가 바로 켜지지 않고
          <b>링크를 하나 출력합니다</b>. 그 링크를 브라우저로 열어 <b>허용</b>을
          누른 뒤, 명령어를 한 번 더 실행하세요
          <p class="text-muted-foreground mt-1 text-xs">
            링크가 안 나오면 이미 허용된 상태입니다. 이 과정은 처음 한
            번뿐입니다.
          </p>
        </li>
        <li>확인되면 여기에 HTTPS 주소와 QR이 나타납니다</li>
      </ol>
    </CardContent>
    <CardFooter v-if="!customUrl" class="flex items-center gap-2">
      <span class="text-muted-foreground text-xs">
        {{
          checking
            ? "Tailscale 상태 확인 중…"
            : `이 페이지를 열어 두면 5초마다 자동으로 확인합니다 · ${checkedLabel}`
        }}
      </span>
      <Button
        variant="outline"
        size="sm"
        class="ml-auto"
        :disabled="checking"
        @click="emit('recheck')"
      >
        <Icon
          icon="solar:refresh-bold-duotone"
          class="size-4"
          :class="checking && 'animate-spin'"
        />
        다시 확인
      </Button>
    </CardFooter>
  </Card>
</template>
