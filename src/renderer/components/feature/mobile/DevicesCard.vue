<script setup lang="ts">
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatRelativeTime, ROUTE_LABELS } from "@/lib/mobilePage";
import { Icon } from "@iconify/vue";
import { useNow } from "@vueuse/core";
import type { MobileDeviceInfo } from "../../../../types/ipc";

defineProps<{ devices: MobileDeviceInfo[] }>();
const emit = defineEmits<{ revoke: [id: string] }>();

const now = useNow({ interval: 30_000 });
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Icon icon="solar:devices-bold-duotone" class="text-primary size-5" />
        연결된 기기
      </CardTitle>
      <CardDescription>
        해제하면 그 기기는 다음 접속 때 코드를 다시 입력해야 합니다.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <p v-if="devices.length === 0" class="text-muted-foreground text-sm">
        아직 연결된 기기가 없습니다.
      </p>
      <ul v-else class="divide-y">
        <li
          v-for="device in devices"
          :key="device.id"
          class="flex items-center gap-2 py-2 text-sm"
        >
          <Icon
            icon="solar:smartphone-bold-duotone"
            class="text-muted-foreground size-4 shrink-0"
          />
          <span class="truncate">{{ device.name }}</span>
          <span class="text-muted-foreground shrink-0 text-xs">{{
            formatRelativeTime(device.lastSeenAt, now.getTime())
          }}</span>
          <Badge variant="outline" class="ml-auto shrink-0">{{
            ROUTE_LABELS[device.route]
          }}</Badge>
          <Button
            variant="outline"
            size="sm"
            @click="emit('revoke', device.id)"
          >
            해제
          </Button>
        </li>
      </ul>
    </CardContent>
  </Card>
</template>
