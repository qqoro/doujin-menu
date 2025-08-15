<script setup lang="ts">
import { LicenseInfo } from "@/api";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@iconify/vue";
import { useQuery } from "@tanstack/vue-query";

defineProps<{
  open: boolean;
}>();
const emit = defineEmits(["update:open"]);

const {
  data: licenses,
  isLoading,
  error,
} = useQuery({
  queryKey: [],
  queryFn: () => {
    return import("@/assets/licenses.json");
  },
  select(data) {
    return Object.values(data.default) as LicenseInfo[];
  },
});

const closeDialog = () => {
  emit("update:open", false);
};
</script>

<template>
  <Dialog :open="open" @update:open="closeDialog">
    <DialogContent class="max-w-3xl h-[80vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>오픈소스 라이선스</DialogTitle>
        <DialogDescription>
          이 애플리케이션에 사용된 오픈소스 라이브러리 목록입니다.
        </DialogDescription>
      </DialogHeader>

      <div v-if="isLoading" class="flex-1 flex items-center justify-center">
        <Icon
          icon="solar:spinner-8-bold-duotone"
          class="w-12 h-12 animate-spin"
        />
        <p class="ml-2">라이선스 정보를 불러오는 중...</p>
      </div>
      <div
        v-else-if="error"
        class="flex-1 flex items-center justify-center text-red-500"
      >
        <Icon
          icon="solar:danger-triangle-bold-duotone"
          class="w-12 h-12 mr-2"
        />
        <p>오류: {{ error.message }}</p>
      </div>
      <div v-else class="flex-1 overflow-y-auto pr-4">
        <Accordion type="single" class="w-full" collapsible>
          <AccordionItem
            v-for="license in licenses"
            :key="license.name + license.version"
            :value="license.name + license.version"
          >
            <AccordionTrigger>
              <div class="flex flex-col items-start">
                <span class="font-semibold"
                  >{{ license.name }} ({{ license.version }})</span
                >
                <span class="text-sm text-muted-foreground">{{
                  license.licenses
                }}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <pre
                class="whitespace-pre-wrap text-xs bg-muted p-4 rounded-md"
                >{{
                  license.licenseText || "라이선스 텍스트를 찾을 수 없습니다."
                }}</pre
              >
              <p
                v-if="license?.repository"
                class="text-xs text-muted-foreground mt-2"
              >
                Repository:
                <a
                  :href="license?.repository"
                  target="_blank"
                  class="text-blue-400 hover:underline"
                  >{{ license?.repository }}</a
                >
              </p>
              <p
                v-if="license?.publisher"
                class="text-xs text-muted-foreground"
              >
                Publisher: {{ license?.publisher }}
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </DialogContent>
  </Dialog>
</template>
