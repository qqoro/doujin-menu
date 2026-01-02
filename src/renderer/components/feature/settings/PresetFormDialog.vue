<script setup lang="ts">
import SmartSearchInput from "@/components/common/SmartSearchInput.vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";
import { Preset } from "../../../../types/ipc";

const props = defineProps<{ open: boolean; editingPreset: Preset | null }>();
const emit = defineEmits(["update:open", "save"]);

const presetName = ref("");
const presetQuery = ref("");

const dialogTitle = computed(() =>
  props.editingPreset ? "프리셋 수정" : "새 프리셋 추가",
);
const dialogDescription = computed(() =>
  props.editingPreset
    ? "프리셋의 이름과 검색어를 수정합니다."
    : "새로운 검색 프리셋의 이름과 검색어를 입력합니다.",
);

watch(
  () => props.open,
  (newVal) => {
    if (newVal) {
      if (props.editingPreset) {
        presetName.value = props.editingPreset.name;
        presetQuery.value = props.editingPreset.query;
      } else {
        presetName.value = "";
        presetQuery.value = "";
      }
    }
  },
  { immediate: true },
);

const handleSubmit = () => {
  if (!presetName.value || !presetQuery.value) {
    // 간단한 유효성 검사
    toast.error("이름과 검색어를 모두 입력해주세요.");
    return;
  }

  const newPreset: Omit<Preset, "id"> | Preset = props.editingPreset
    ? {
        ...props.editingPreset,
        name: presetName.value,
        query: presetQuery.value,
      }
    : { name: presetName.value, query: presetQuery.value };

  emit("save", newPreset);
};

const handleOpenChange = (value: boolean) => {
  emit("update:open", value);
};
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
        <DialogDescription>{{ dialogDescription }}</DialogDescription>
      </DialogHeader>
      <div class="grid gap-4 py-4">
        <div class="grid grid-cols-4 items-center gap-4">
          <Label for="name" class="text-right"> 이름 </Label>
          <Input
            id="name"
            v-model="presetName"
            class="col-span-3"
            placeholder="예: 나의 최애 작가"
          />
        </div>
        <div class="grid grid-cols-4 items-center gap-4">
          <Label for="query" class="text-right"> 검색어 </Label>
          <SmartSearchInput
            id="query"
            v-model="presetQuery"
            class="col-span-3"
            placeholder="예: artist:작가명 tag:태그명"
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" @click="handleSubmit">저장</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
