<script setup lang="ts">
/**
 * SortByEditor — 底部折叠面板，编辑 SORTBYCONTENT
 */
import { ref } from 'vue'
import { ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import { useEditorStore } from '@/stores/editor'

const editor = useEditorStore()
const collapsed = ref(true)

function toggle() {
  collapsed.value = !collapsed.value
}

function onSortbyInput(val: string) {
  editor.currentSortby = val
  editor.checkModified()
}
</script>

<template>
  <div class="sortby-editor" :class="{ collapsed }">
    <div class="sortby-header" @click="toggle">
      <span>SORTBYCONTENT</span>
      <el-icon :size="14">
        <ArrowDown v-if="collapsed" />
        <ArrowUp v-else />
      </el-icon>
    </div>
    <div v-show="!collapsed" class="sortby-body">
      <el-input
        :model-value="editor.currentSortby"
        placeholder="ORDER BY 内容..."
        size="small"
        @update:model-value="onSortbyInput"
      />
    </div>
  </div>
</template>

<style scoped>
.sortby-editor {
  border-top: 1px solid var(--ns-border);
  flex-shrink: 0;
}

.sortby-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  color: var(--ns-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  user-select: none;
}

.sortby-header:hover {
  background: var(--ns-bg-750);
}

.sortby-body {
  padding: 6px 10px;
}

.sortby-body :deep(.el-input__wrapper) {
  background: var(--ns-bg-900);
  box-shadow: none;
  border: 1px solid var(--ns-border);
}

.sortby-body :deep(.el-input__inner) {
  font-family: var(--ns-font-mono);
  font-size: 12px;
}
</style>
