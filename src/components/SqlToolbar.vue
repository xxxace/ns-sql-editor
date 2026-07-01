<script setup lang="ts">
/**
 * SqlToolbar — 编辑区工具栏
 *
 * 功能按钮（从左到右）：
 * 1. [添加连接] — 打开登录弹窗新建连接
 * 2. [切换连接] — 打开登录弹窗切换连接 (hover 显示当前连接信息)
 * 3. ————————————————
 * 4. [格式化] — SQL 格式化
 * 5. [保存] — 更新到数据库
 * 6. [回滚] — 还原到原始版本
 * 7. [草稿] — 保存/管理草稿
 * 8. [Diff] — 对比变更
 * 9. [专注模式] — 折叠左侧面板
 */

import { ref } from 'vue'
import { ElMessage, ElTooltip } from 'element-plus'
import {
  Plus, Switch, Brush, Upload, RefreshLeft,
  DocumentCopy, View, FullScreen, Close,
} from '@element-plus/icons-vue'
import { format as sqlFormat } from 'sql-formatter'
import { useAuthStore } from '@/stores/auth'
import { useEditorStore } from '@/stores/editor'
import { saveData } from '@/api/nameson'
import { saveDraft, draftKey, deleteDraft } from '@/utils/db'
import { buildUpdateModel } from '@/utils/dataModel'

const emit = defineEmits<{
  'open-login': []
  'format': []
  'save-draft': []
  'toggle-draft-drawer': []
}>()

const auth = useAuthStore()
const editor = useEditorStore()

const saving = ref(false)

// ---- 动作 ----

function handleAddConnection() {
  emit('open-login')
}

function handleSwitchConnection() {
  emit('open-login')
}

function handleFormat() {
  if (!editor.currentSql.trim()) {
    ElMessage.warning('没有可格式化的内容')
    return
  }
  try {
    const formatted = sqlFormat(editor.currentSql, {
      language: 'plsql',
      tabWidth: 2,
      useTabs: false,
      keywordCase: 'upper',
      linesBetweenQueries: 2,
    })
    editor.setSql(formatted, false)
    editor.checkModified()
    ElMessage.success('格式化完成')
  } catch {
    ElMessage.warning('格式化失败，请检查 SQL 语法')
  }
}

async function handleSave() {
  if (!editor.currentSql.trim()) return
  if (!editor.selectedStatement) {
    ElMessage.warning('请先选择一条语句')
    return
  }
  saving.value = true
  try {
    const model = buildUpdateModel(
      editor.currentObjectId,
      editor.currentTabseq,
      editor.currentSql,
      editor.originalSql,
      editor.currentSortby,
      editor.originalSortby,
    )
    const res = await saveData(auth.serverUrl, [model])
    if (res.statusCode === '1') {
      // 更新 original 为当前值
      editor.setSql(editor.currentSql, true)
      editor.setSortby(editor.currentSortby, true)
      editor.isModified = false
      // 删除草稿
      const key = draftKey(editor.currentObjectId, editor.currentTabseq)
      await deleteDraft(key)
      editor.hasDraft = false
      ElMessage.success('已更新到数据库')
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } catch (e: unknown) {
    ElMessage.error('保存网络错误')
  } finally {
    saving.value = false
  }
}

function handleRollback() {
  editor.setSql(editor.originalSql, true)
  editor.setSortby(editor.originalSortby, true)
  editor.isModified = false
  ElMessage.info('已回滚到原始版本')
}

async function handleSaveDraft() {
  if (!editor.currentSql.trim() || !editor.selectedStatement) {
    ElMessage.warning('请先选择一条语句')
    return
  }
  try {
    const key = draftKey(editor.currentObjectId, editor.currentTabseq)
    await saveDraft({
      key,
      sql: editor.currentSql,
      sortby: editor.currentSortby,
      dsname: editor.selectedStatement.dsname,
      savedAt: Date.now(),
    })
    editor.hasDraft = true
    ElMessage.success('草稿已保存')
  } catch {
    ElMessage.error('草稿保存失败')
  }
}

function handleDiff() {
  editor.toggleDiff()
}

function handleFocusMode() {
  editor.toggleFocusMode()
}
</script>

<template>
  <div class="sql-toolbar" role="toolbar" aria-label="编辑器工具栏">
    <!-- 连接区 -->
    <div class="toolbar-section">
      <el-tooltip content="添加新的服务器连接" placement="bottom">
        <el-button size="small" text :icon="Plus" @click="handleAddConnection">添加连接</el-button>
      </el-tooltip>
      <el-tooltip :content="auth.currentConnectionInfo" placement="bottom" :show-after="300">
        <el-button size="small" text :icon="Switch" @click="handleSwitchConnection">切换连接</el-button>
      </el-tooltip>
    </div>

    <div class="toolbar-divider" />

    <!-- 操作区 -->
    <div class="toolbar-section">
      <el-tooltip content="格式化 SQL" placement="bottom">
        <el-button size="small" text :icon="Brush" :disabled="!editor.currentSql" @click="handleFormat">格式化</el-button>
      </el-tooltip>
      <el-tooltip content="更新到数据库" placement="bottom">
        <el-button size="small" text :icon="Upload" :loading="saving" :disabled="!editor.isModified" @click="handleSave">保存</el-button>
      </el-tooltip>
      <el-tooltip content="回滚到原始版本" placement="bottom">
        <el-button size="small" text :icon="RefreshLeft" :disabled="!editor.isModified" @click="handleRollback">回滚</el-button>
      </el-tooltip>
      <el-tooltip content="保存草稿（本地缓存）" placement="bottom">
        <el-button size="small" text :icon="DocumentCopy" :disabled="!editor.currentSql" @click="handleSaveDraft">草稿</el-button>
      </el-tooltip>
      <el-tooltip content="对比变更" placement="bottom">
        <el-button size="small" text :icon="View" :disabled="!editor.currentSql" @click="handleDiff">Diff</el-button>
      </el-tooltip>
    </div>

    <div class="toolbar-spacer" />

    <!-- 视图区 -->
    <div class="toolbar-section">
      <el-tooltip :content="editor.isFocusMode ? '退出专注模式' : '专注模式'" placement="bottom">
        <el-button
          size="small"
          text
          :type="editor.isFocusMode ? 'primary' : undefined"
          :icon="editor.isFocusMode ? Close : FullScreen"
          @click="handleFocusMode"
        >{{ editor.isFocusMode ? '退出专注' : '专注' }}</el-button>
      </el-tooltip>
    </div>
  </div>
</template>

<style scoped>
.sql-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px 8px;
  background: var(--ns-bg-750);
  border-bottom: 1px solid var(--ns-border);
  min-height: 36px;
  flex-shrink: 0;
  overflow-x: auto;
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: 1px;
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

.sql-toolbar :deep(.el-button) {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 4px;
  white-space: nowrap;
}

.sql-toolbar :deep(.el-button:hover) {
  background: var(--ns-bg-400);
}
</style>
