<script setup lang="ts">
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { formatPairCode, formatRemaining } from "@/lib/mobilePage";
import { withPairCode } from "@/lib/pairing";
import { Icon } from "@iconify/vue";
import { useNow } from "@vueuse/core";
import { computed } from "vue";
import type { MobileWebStatus } from "../../../../types/ipc";
import CopyField from "./CopyField.vue";
import QrCode from "./QrCode.vue";

const props = defineProps<{
  lan: MobileWebStatus["lan"];
  pairing: NonNullable<MobileWebStatus["pairing"]>;
}>();

const emit = defineEmits<{ selectAddress: [address: string] }>();

const now = useNow({ interval: 1000 });
const remaining = computed(() =>
  formatRemaining(props.pairing.expiresAt - now.value.getTime()),
);
// 화면에 보이는 주소에는 코드를 넣지 않는다
const displayUrl = computed(() => props.lan.url?.replace(/\/$/, "") ?? "");
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Icon
          icon="solar:wi-fi-router-bold-duotone"
          class="text-primary size-5"
        />
        같은 와이파이
        <Badge v-if="lan.url" variant="secondary" class="ml-auto"
          >사용 가능</Badge
        >
      </CardTitle>
      <CardDescription>
        설치 없이 집 안에서 가장 빠르게 씁니다. 브라우저 탭으로만 열리고, 앱
        설치와 자동 재생 중 화면 꺼짐 방지는 되지 않습니다. 공유기가 PC 주소를
        바꾸면 QR을 다시 찍어야 합니다.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <p v-if="!lan.url" class="text-muted-foreground text-sm">
        이 PC가 네트워크에 연결돼 있지 않습니다.
      </p>
      <div v-else class="flex flex-wrap items-center gap-4">
        <QrCode :value="withPairCode(lan.url, pairing.code)" />
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <CopyField :value="displayUrl" />
          <NativeSelect
            v-if="lan.addresses.length > 1"
            :model-value="lan.selected ?? undefined"
            aria-label="PC 주소 선택"
            @update:model-value="emit('selectAddress', String($event))"
          >
            <NativeSelectOption
              v-for="address in lan.addresses"
              :key="address"
              :value="address"
            >
              {{ address }}
            </NativeSelectOption>
          </NativeSelect>
          <div class="text-muted-foreground mt-1 text-xs">
            주소를 직접 입력했을 때의 연결 코드
          </div>
          <div class="font-mono text-2xl font-bold tracking-widest">
            {{ formatPairCode(pairing.code) }}
          </div>
          <div class="text-muted-foreground text-xs">
            {{ remaining }} 후 바뀜 · 이 페이지가 열려 있을 때만 연결됩니다
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
