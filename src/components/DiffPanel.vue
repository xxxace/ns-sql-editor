<script setup lang="ts">
/**
 * DiffPanel — 内联并排 Diff 对比面板
 *
 * 在编辑区下方展开，对比当前修改 vs 原始版本
 */
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as monaco from 'monaco-editor'
import { Close } from '@element-plus/icons-vue'
import { useEditorStore } from '@/stores/editor'

const editor = useEditorStore()

const containerRef = ref<HTMLDivElement>()
let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null

function initDiff() {
  if (!containerRef.value) return
  if (diffEditor) {
    diffEditor.dispose()
  }

  const original = monaco.editor.createModel(editor.originalSql || '-- 原始版本', 'sql')
  const modified = monaco.editor.createModel(editor.currentSql || '-- 当前修改', 'sql')

  diffEditor = monaco.editor.createDiffEditor(containerRef.value, {
    theme: 'ns-sql-dark',
    fontSize: 13,
    fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    renderSideBySide: true,
    readOnly: true,
    originalEditable: false,
    padding: { top: 8 },
    scrollbar: { verticalScrollbarSize: 6 },
    automaticLayout: true,
  })

  diffEditor.setModel({ original, modified })
}

function close() {
  editor.diffVisible = false
}

/** 组件挂载时若 diffVisible 已为 true，直接初始化（v-if 创建的组件不受 watch 触发） */
onMounted(async () => {
  if (editor.diffVisible) {
    await nextTick()
    initDiff()
  }
})

watch(() => editor.diffVisible, async (val) => {
  if (val) {
    await nextTick()
    initDiff()
  } else {
    if (diffEditor) {
      diffEditor.dispose()
      diffEditor = null
    }
  }
})

onBeforeUnmount(() => {
  if (diffEditor) {
    diffEditor.dispose()
    diffEditor = null
  }
})
</script>

<template>
  <transition name="diff-slide">
    <div v-if="editor.diffVisible" class="diff-panel">
      <div class="diff-header">
        <span class="diff-title">变更对比</span>
        <span class="diff-hint">左：原始 &nbsp;|&nbsp; 右：当前修改</span>
        <el-button text size="small" :icon="Close" @click="close" />
      </div>
      <div ref="containerRef" class="diff-container" />
    </div>
  </transition>
</template>

<style scoped>
.diff-panel {
  border-top: 1px solid var(--ns-accent);
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 200px;
  background: var(--ns-bg-800);
}

.diff-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 10px;
  background: var(--ns-bg-750);
  border-bottom: 1px solid var(--ns-border);
  flex-shrink: 0;
  min-height: 30px;
}

.diff-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ns-accent);
}

.diff-hint {
  font-size: 11px;
  color: var(--ns-text-muted);
  flex: 1;
}

.diff-container {
  flex: 1;
  overflow: hidden;
}

.diff-slide-enter-active,
.diff-slide-leave-active {
  transition: all 0.2s ease;
}

.diff-slide-enter-from,
.diff-slide-leave-to {
  height: 0;
  opacity: 0;
}
</style>
