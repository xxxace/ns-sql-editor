<script setup lang="ts">
/**
 * SqlEditor — Monaco Editor 组件封装
 *
 * 内部管理 Monaco 实例生命周期：
 * - 挂载时创建 editor
 * - 监听 Store.currentSql 变化同步到 editor
 * - 用户输入时同步回 Store
 * - 卸载时销毁
 */

import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as Monaco from 'monaco-editor'
import { createEditor } from '@/utils/monaco'
import { useEditorStore } from '@/stores/editor'

const store = useEditorStore()
const containerRef = ref<HTMLDivElement>()

// ---- 状态栏数据 ----
const cursorLine = ref(1)
const cursorColumn = ref(1)
const selectedChars = ref(0)
const indentSpaces = ref(0)

let editor: Monaco.editor.IStandaloneCodeEditor | null = null
let syncingFromStore = false

function updateCursorStatus() {
  if (!editor) return
  const pos = editor.getPosition()
  if (pos) {
    cursorLine.value = pos.lineNumber
    cursorColumn.value = pos.column
  }
  const sel = editor.getSelection()
  const model = editor.getModel()
  if (sel && model) {
    if (sel.isEmpty()) {
      selectedChars.value = 0
    } else {
      const text = model.getValueInRange(sel)
      selectedChars.value = text.length
    }
  }
  // 缩进：当前行前导空格
  if (model && pos) {
    const line = model.getLineContent(pos.lineNumber)
    const match = line.match(/^(\s*)/)
    indentSpaces.value = match ? match[1].length : 0
  }
}

onMounted(async () => {
  await nextTick()
  if (!containerRef.value) return

  editor = createEditor(containerRef.value, store.currentSql, (value) => {
    if (syncingFromStore) return
    store.setSql(value, false)
    store.checkModified()
  })

  // 初始锁定状态（默认 readOnly）
  editor.updateOptions({ readOnly: store.isLocked })

  // 注册光标事件 → 状态栏
  editor.onDidChangeCursorPosition(() => updateCursorStatus())
  editor.onDidChangeCursorSelection(() => updateCursorStatus())
  // 初始状态
  updateCursorStatus()
})

onBeforeUnmount(() => {
  editor?.dispose()
  editor = null
})

// Store → Monaco（使用 executeEdits 保留 undo 栈，而非 setValue 清空历史）
watch(
  () => store.currentSql,
  (val) => {
    if (!editor) return
    const model = editor.getModel()
    if (!model) return
    const modelVal = editor.getValue()
    if (modelVal === val) return

    // 锁定状态下 executeEdits 也会被 Monaco 拦截 → 临时解绑
    const wasReadOnly = editor.getOption(Monaco.editor.EditorOption.readOnly) as boolean
    if (wasReadOnly) editor.updateOptions({ readOnly: false })

    syncingFromStore = true
    // executeEdits 会将替换操作推入 undo 栈，Ctrl+Z 可回退
    editor.executeEdits('store-sync', [{
      range: model.getFullModelRange(),
      text: val ?? '',
      forceMoveMarkers: true,
    }])
    // 格式化/回滚等操作后推送 undo stop，使一次 Ctrl+Z 回退整段变更
    editor.pushUndoStop()
    nextTick(() => {
      syncingFromStore = false
      // 恢复锁定（仅在原本锁定的情况下）
      if (wasReadOnly && editor) editor.updateOptions({ readOnly: true })
    })
  },
)

// 专注模式 / Diff 面板 切换 → 重新布局 Monaco
watch([() => store.isFocusMode, () => store.diffVisible], async () => {
  await nextTick()
  editor?.layout()
})

// 锁定/解锁 → 切换 Monaco readOnly
watch(() => store.isLocked, (locked) => {
  editor?.updateOptions({ readOnly: locked })
}, { immediate: false })
</script>

<template>
  <div class="editor-wrapper">
    <div ref="containerRef" class="monaco-host" />
    <div class="status-bar">
      <span class="status-item">行 {{ cursorLine }}, 列 {{ cursorColumn }}</span>
      <span v-if="selectedChars > 0" class="status-item status-selected">(已选择{{ selectedChars }})</span>
      <span class="status-item status-indent">空格: {{ indentSpaces }}</span>
    </div>
  </div>
</template>

<style scoped>
.editor-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.monaco-host {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.status-bar {
  height: 22px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  font-size: 11px;
  color: #fff;
  background: #007acc;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  user-select: none;
}

.status-item {
  white-space: nowrap;
}

.status-selected {
  color: var(--ns-accent);
}

.status-indent {
  margin-left: auto;
}
</style>
