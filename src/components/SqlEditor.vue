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
import type * as Monaco from 'monaco-editor'
import { createEditor } from '@/utils/monaco'
import { useEditorStore } from '@/stores/editor'

const store = useEditorStore()
const containerRef = ref<HTMLDivElement>()

let editor: Monaco.editor.IStandaloneCodeEditor | null = null
let syncingFromStore = false

onMounted(async () => {
  await nextTick()
  if (!containerRef.value) return

  editor = createEditor(containerRef.value, store.currentSql, (value) => {
    if (syncingFromStore) return
    store.setSql(value, false)
    store.checkModified()
  })
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
    syncingFromStore = true
    // executeEdits 会将替换操作推入 undo 栈，Ctrl+Z 可回退
    editor.executeEdits('store-sync', [{
      range: model.getFullModelRange(),
      text: val ?? '',
      forceMoveMarkers: true,
    }])
    // 格式化/回滚等操作后推送 undo stop，使一次 Ctrl+Z 回退整段变更
    editor.pushUndoStop()
    nextTick(() => { syncingFromStore = false })
  },
)

// 专注模式 / Diff 面板 切换 → 重新布局 Monaco
watch([() => store.isFocusMode, () => store.diffVisible], async () => {
  await nextTick()
  editor?.layout()
})
</script>

<template>
  <div ref="containerRef" class="monaco-host" />
</template>

<style scoped>
.monaco-host {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
