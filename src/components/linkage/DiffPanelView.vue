<script setup lang="ts">
/**
 * DiffPanelView — Feature B 联动专用 Diff 对比面板（可复用）
 *
 * 接收 leftSql/rightSql props 渲染 Monaco Diff Editor。
 * 与现有 DiffPanel.vue 的区别：
 * - 不依赖 editorStore（从 props 接收内容）
 * - 不控制自身可见性（由父组件 v-if 控制）
 */
import { ref, watch, onBeforeUnmount, nextTick } from 'vue'
import * as monaco from 'monaco-editor'
import { Close, ArrowLeft } from '@element-plus/icons-vue'

const props = defineProps<{
  leftSql: string
  rightSql: string
  leftLabel?: string
  rightLabel?: string
}>()

const emit = defineEmits<{
  'close': []
  'update': []
}>()

const containerRef = ref<HTMLDivElement>()
let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null

function initDiff() {
  if (!containerRef.value) return
  if (diffEditor) {
    diffEditor.dispose()
  }

  const original = monaco.editor.createModel(
    props.leftSql || '-- 无数据',
    'sql',
  )
  const modified = monaco.editor.createModel(
    props.rightSql || '-- 无数据',
    'sql',
  )

  diffEditor = monaco.editor.createDiffEditor(containerRef.value, {
    theme: 'ns-sql-dark',
    fontSize: 13,
    fontFamily:
      "'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
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

watch(
  () => [props.leftSql, props.rightSql],
  async () => {
    await nextTick()
    initDiff()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (diffEditor) {
    diffEditor.dispose()
    diffEditor = null
  }
})
</script>

<template>
  <div class="diff-panel">
    <div class="diff-header">
      <el-button text size="small" :icon="ArrowLeft" @click="emit('close')">返回列表</el-button>
      <span class="diff-title">语句对比</span>
      <span class="diff-hint">
        左：{{ leftLabel || '主会话' }} &nbsp;|&nbsp; 右：{{ rightLabel || '目标会话' }}
      </span>
      <el-button size="small" type="warning" plain @click="emit('update')">从外部更新</el-button>
      <el-button text size="small" :icon="Close" @click="emit('close')" />
    </div>
    <div ref="containerRef" class="diff-container" />
  </div>
</template>

<style scoped>
.diff-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--ns-bg-800);
  border: 1px solid var(--ns-accent);
  border-radius: 4px;
  overflow: hidden;
  margin: 8px;
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
</style>
