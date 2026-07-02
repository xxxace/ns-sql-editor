<script setup lang="ts">
/**
 * PageSelector — 主会话页面下拉选择器（Feature B）
 *
 * 默认带入主界面当前选中的页面，用户可手动下拉切换到其他页面。
 * 切换后自动触发目标会话数据重新加载。
 */
import { ref, computed, watch } from "vue";
import { useEditorStore } from "@/stores/editor";
import { useLinkageStore } from "@/stores/linkage";

const editor = useEditorStore();
const linkage = useLinkageStore();

const selectedValue = ref<string>("");

// 菜单选项：扁平化所有子菜单页面（root.children 才是具体页面）
const pageOptions = computed(() => {
  const pages: { value: string; label: string }[] = [];

  editor.menuNodes.forEach((page) => {
    pages.push({
      value: page.objectId,
      label: `${page.cname || page.label || page.ename} (${page.ename})`,
    });
  });
  return pages;
});

// 弹窗打开时默认选中当前页
watch(
  () => linkage.dialogVisible,
  (open) => {
    if (open) {
      const currentId = editor.currentObjectId;
      selectedValue.value = currentId;
      linkage.setSelectedPage(currentId);
    }
  },
  {
    immediate: true,
  },
);

function handleChange(objectId: string) {
  linkage.setSelectedPage(objectId || null);
}
</script>

<template>
  <div class="page-selector">
    <label class="selector-label">主会话页面</label>
    <el-select
      v-model="selectedValue"
      placeholder="选择页面"
      size="small"
      class="selector-select"
      filterable
      @change="handleChange"
    >
      <el-option
        v-for="opt in pageOptions"
        :key="opt.value"
        :label="opt.label"
        :value="opt.value"
      />
    </el-select>
  </div>
</template>

<style scoped>
.page-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.selector-label {
  font-size: 12px;
  color: var(--ns-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.selector-select {
  width: 240px;
}
</style>
