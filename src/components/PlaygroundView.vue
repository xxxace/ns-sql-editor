<script setup lang="ts">
/**
 * PlaygroundView — SQL Playground 独占整版视图
 *
 * 定位：随便写 SQL + 本地命名存档，**不执行**（需求决策：无虚拟表格 + 防误查全库）。
 *
 * 结构：
 * - 顶部工具栏：标题输入 / 新建 / 保存(Ctrl+S) / 存档列表 / 格式化(Shift+Alt+F) / 返回编辑器
 * - 主体：Monaco 编辑器（createEditor 直建，不依赖 editor store 的锁定/草稿逻辑）
 * - 底部：行列状态栏
 * - 右侧：存档列表抽屉（照 DraftDrawer 列表样式）
 *
 * 内容跨视图保留：工作区状态存 stores/playground.ts，v-if 销毁组件不丢内容。
 * 未保存保护：返回/新建/加载存档前，若 store.isPgModified 弹确认。
 */
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Plus, Upload, Tickets, MagicStick, Back, Delete,
} from '@element-plus/icons-vue'
import * as Monaco from 'monaco-editor'
import { createEditor } from '@/utils/monaco'
import { formatSqlText } from '@/utils/sqlFormat'
import { usePlaygroundStore } from '@/stores/playground'
import type { PlaygroundRecord } from '@/utils/db'

const emit = defineEmits<{
  /** 返回编辑器视图（父级切换 viewMode） */
  back: []
}>()

const pg = usePlaygroundStore()

// ---- Monaco ----
const containerRef = ref<HTMLDivElement>()
let editor: Monaco.editor.IStandaloneCodeEditor | null = null
let syncingFromStore = false

// ---- 状态栏 ----
const cursorLine = ref(1)
const cursorColumn = ref(1)

// ---- 存档抽屉 ----
const drawerVisible = ref(false)

// ---- 保存中防连点 ----
const saving = ref(false)

function updateCursorStatus() {
  if (!editor) return
  const pos = editor.getPosition()
  if (pos) {
    cursorLine.value = pos.lineNumber
    cursorColumn.value = pos.column
  }
}

// ---- 格式化（executeEdits 可撤销，同 SqlEditor 策略）----
function runFormat() {
  if (!editor) return
  const sql = editor.getValue()
  if (!sql.trim()) {
    ElMessage.warning('没有可格式化的内容')
    return
  }
  const formatted = formatSqlText(sql)
  if (formatted === null) {
    ElMessage.warning('格式化失败，SQL 包含无法识别的语法，请检查后重试')
    return
  }
  const model = editor.getModel()
  if (!model) return
  syncingFromStore = true
  editor.executeEdits('format', [
    { range: model.getFullModelRange(), text: formatted, forceMoveMarkers: true },
  ])
  editor.pushUndoStop()
  syncingFromStore = false
  pg.updateSql(formatted)
  ElMessage.success('格式化完成')
}

// ---- 未保存保护 ----
async function confirmIfModified(action: string): Promise<boolean> {
  if (!pg.isPgModified) return true
  try {
    await ElMessageBox.confirm(
      `当前内容有未保存的修改，${action}将丢失这些修改。确定继续吗？`,
      '未保存的修改',
      {
        confirmButtonText: '继续',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
    return true
  } catch {
    return false
  }
}

// ---- 动作 ----
function handleNew() {
  void (async () => {
    if (!(await confirmIfModified('新建'))) return
    pg.newPg()
    editor?.setValue('')
    editor?.focus()
  })()
}

async function handleSave() {
  if (saving.value) return
  let title = pg.pgTitle
  if (!title.trim()) {
    try {
      const { value } = await ElMessageBox.prompt('请为存档输入标题', '保存存档', {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputPlaceholder: '存档标题',
      })
      title = value ?? ''
    } catch {
      return // cancelled
    }
  }
  if (!title.trim()) {
    ElMessage.warning('标题不能为空')
    return
  }
  saving.value = true
  try {
    await pg.savePg(title)
    ElMessage.success(pg.hasPgCurrent ? '已更新存档' : '已保存存档')
  } catch {
    ElMessage.error('保存失败：本地存储错误')
  } finally {
    saving.value = false
  }
}

function openDrawer() {
  void pg.loadRecords()
  drawerVisible.value = true
}

async function handleLoad(record: PlaygroundRecord) {
  if (!(await confirmIfModified('加载存档'))) return
  pg.loadPg(record)
  editor?.setValue(record.sql)
  editor?.focus()
  drawerVisible.value = false
}

async function handleDelete(record: PlaygroundRecord) {
  try {
    await ElMessageBox.confirm(
      `确定删除存档「${record.title || record.id}」吗？`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  await pg.removePg(record.id)
  // 删除的是当前编辑中的存档 → 内容保留但解除关联
  if (pg.pgCurrentId === record.id) {
    ElMessage.info('已删除存档，当前内容保留在工作区（未保存状态）')
  } else {
    ElMessage.success('已删除')
  }
}

function handleBack() {
  void (async () => {
    if (!(await confirmIfModified('返回编辑器'))) return
    emit('back')
  })()
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString()
}

// ---- 生命周期 ----
onMounted(async () => {
  await nextTick()
  if (!containerRef.value) return

  editor = createEditor(containerRef.value, pg.pgSql, (value) => {
    if (syncingFromStore) return
    pg.updateSql(value)
  })

  editor.onDidChangeCursorPosition(() => updateCursorStatus())
  updateCursorStatus()

  // ---- Ctrl+S 保存 ----
  editor.addAction({
    id: 'ns-pg-save',
    label: '保存存档',
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 1,
    keybindings: [Monaco.KeyMod.CtrlCmd | Monaco.KeyCode.KeyS],
    run: () => {
      void handleSave()
    },
  })

  // ---- Shift+Alt+F 格式化（避开 Ctrl+Shift+F 输入法冲突）----
  editor.addAction({
    id: 'ns-pg-format',
    label: '格式化 SQL',
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 2,
    keybindings: [Monaco.KeyMod.Shift | Monaco.KeyMod.Alt | Monaco.KeyCode.KeyF],
    run: runFormat,
  })

  void pg.loadRecords()
})

onBeforeUnmount(() => {
  editor?.dispose()
  editor = null
})

// 存档加载/新建 → 同步 editor（setValue 是"最初数据"，可接受清空 undo 栈）
watch(
  () => pg.pgSql,
  (val) => {
    if (!editor) return
    if (syncingFromStore) return
    if (editor.getValue() === val) return
    syncingFromStore = true
    editor.setValue(val ?? '')
    nextTick(() => {
      syncingFromStore = false
    })
  },
)
</script>

<template>
  <div class="playground-view">
    <!-- ===== 工具栏 ===== -->
    <div class="pg-toolbar">
      <el-input
        v-model="pg.pgTitle"
        class="pg-title-input"
        placeholder="存档标题"
        clearable
        size="small"
      />

      <div class="toolbar-divider" />

      <el-tooltip content="新建（清空当前内容）" placement="bottom">
        <el-button size="small" text :icon="Plus" @click="handleNew">新建</el-button>
      </el-tooltip>
      <el-tooltip content="保存存档（Ctrl+S）" placement="bottom">
        <el-button size="small" text type="primary" :icon="Upload" :loading="saving" @click="handleSave">保存</el-button>
      </el-tooltip>
      <el-tooltip content="存档列表" placement="bottom">
        <el-button size="small" text :icon="Tickets" @click="openDrawer">存档</el-button>
      </el-tooltip>
      <el-tooltip content="格式化 SQL（Shift+Alt+F）" placement="bottom">
        <el-button size="small" text :icon="MagicStick" @click="runFormat">格式化</el-button>
      </el-tooltip>

      <div class="toolbar-spacer" />

      <el-button size="small" text :icon="Back" @click="handleBack">返回编辑器</el-button>
    </div>

    <!-- ===== 编辑器 ===== -->
    <div class="pg-body">
      <div ref="containerRef" class="pg-monaco-host" />
    </div>

    <!-- ===== 状态栏 ===== -->
    <div class="pg-status-bar">
      <span>SQL Playground — 仅编辑与存档，不执行 SQL</span>
      <span class="status-spacer" />
      <span>行 {{ cursorLine }}, 列 {{ cursorColumn }}</span>
    </div>

    <!-- ===== 存档列表抽屉 ===== -->
    <el-drawer
      v-model="drawerVisible"
      direction="rtl"
      size="360px"
      title="存档列表"
    >
      <div v-if="pg.records.length === 0" class="pg-empty">
        <p>暂无存档</p>
      </div>
      <div v-else class="pg-list">
        <div
          v-for="r in pg.records"
          :key="r.id"
          class="pg-item"
          :class="{ 'is-current': r.id === pg.pgCurrentId }"
          @click="handleLoad(r)"
        >
          <div class="pg-item-info">
            <div class="pg-item-title">{{ r.title || '未命名' }}</div>
            <div class="pg-item-meta">保存于 {{ formatTime(r.savedAt) }}</div>
            <div class="pg-item-preview">{{ r.sql.substring(0, 120) }}{{ r.sql.length > 120 ? '...' : '' }}</div>
          </div>
          <el-button
            text
            size="small"
            type="danger"
            :icon="Delete"
            @click.stop="handleDelete(r)"
          />
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.playground-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ---- 工具栏 ---- */
.pg-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px 8px;
  background: var(--ns-bg-750);
  border-bottom: 1px solid var(--ns-border);
  min-height: 36px;
  flex-shrink: 0;
}

.pg-title-input {
  width: 200px;
  flex-shrink: 0;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--ns-border);
  margin: 0 6px;
  flex-shrink: 0;
}

.toolbar-spacer {
  flex: 1;
}

.pg-toolbar :deep(.el-button) {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 4px;
  white-space: nowrap;
}

.pg-toolbar :deep(.el-button:hover) {
  background: var(--ns-bg-400);
}

/* ---- 编辑器 ---- */
.pg-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.pg-monaco-host {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ---- 状态栏 ---- */
.pg-status-bar {
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

.status-spacer {
  flex: 1;
}

/* ---- 存档列表 ---- */
.pg-empty {
  text-align: center;
  padding: 40px 0;
  color: var(--ns-text-muted);
  font-size: 13px;
}

.pg-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pg-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.pg-item:hover {
  background: var(--ns-bg-400);
}

.pg-item.is-current {
  background: rgba(16, 185, 129, 0.08);
  border-left: 2px solid var(--el-color-success);
  padding-left: 10px;
}

.pg-item-info {
  flex: 1;
  min-width: 0;
}

.pg-item-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 2px;
}

.pg-item-meta {
  font-size: 11px;
  color: var(--ns-text-muted);
  margin-bottom: 4px;
}

.pg-item-preview {
  font-size: 11px;
  font-family: var(--ns-font-mono);
  color: var(--ns-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
