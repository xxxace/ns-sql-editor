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
 * 10. [锁定/解锁] — 切换编辑器只读/可编辑状态（默认锁定）
 */

import { ref } from 'vue'
import { ElMessage, ElMessageBox, ElTooltip } from 'element-plus'
import {
  Plus, Switch, Brush, Upload, RefreshLeft,
  DocumentCopy, View, FullScreen, Close, ArrowDown, Tickets, Lock, Unlock, Link,
} from '@element-plus/icons-vue'
import { format as sqlFormat } from 'sql-formatter'
import { useAuthStore } from '@/stores/auth'
import { useEditorStore } from '@/stores/editor'
import { saveData } from '@/api/nameson'
import { saveDraft, draftKey, deleteDraft } from '@/utils/db'
// @ts-ignore
import { generateDataModel } from '@nameson/sqlutils'

const emit = defineEmits<{
  'open-login': []
  'open-login-new': []
  'format': []
  'save-draft': []
  'toggle-draft-drawer': []
  'open-linkage': []
}>()

const auth = useAuthStore()
const editor = useEditorStore()

const saving = ref(false)

// ---- 动作 ----

function handleAddConnection() {
  emit('open-login-new')
}

function handleSwitchConnection() {
  emit('open-login')
}

function handleFormat() {
  if (!editor.currentSql.trim()) {
    ElMessage.warning('没有可格式化的内容')
    return
  }
  // 依次尝试 plsql → sql，覆盖 Oracle 特有语法
  const dialects: Array<'plsql' | 'sql'> = ['plsql', 'sql']
  for (const lang of dialects) {
    try {
      const formatted = sqlFormat(editor.currentSql, {
        language: lang,
        tabWidth: 2,
        useTabs: false,
        keywordCase: 'upper',
        linesBetweenQueries: 2,
        denseOperators: false,
        newlineBeforeSemicolon: false,
      })
      editor.setSql(formatted, false)
      editor.checkModified()
      ElMessage.success(`格式化完成 (${lang === 'plsql' ? 'Oracle PL/SQL' : '通用 SQL'})`)
      return
    } catch {
      // fallback to next dialect
    }
  }
  ElMessage.warning('格式化失败，SQL 包含无法识别的语法，请检查后重试')
}

async function handleSave() {
  if (!editor.currentSql.trim()) return
  if (!editor.selectedStatement) {
    ElMessage.warning('请先选择一条语句')
    return
  }
  try {
    await ElMessageBox.confirm(
      '确认将修改保存到数据库？',
      '保存确认',
      {
        confirmButtonText: '确认保存',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }
  saving.value = true
  try {
    const dataModel = generateDataModel({
      tableName: 'PRJOBJDS',
      user: auth.currentUser,
    })
    // NUMBER 类型字段声明：TABSEQ 是数字主键，避免 PKvalues 被错误加引号
    dataModel.setKeyTypeMap({ NUMBER: ['TABSEQ'] })
    dataModel.setPKvalues({ OBJECTID: editor.currentObjectId, TABSEQ: editor.currentTabseq })
    dataModel.setColdatas(
      { DBQUERY: editor.currentSql, SORTBYCONTENT: editor.currentSortby },
      { DBQUERY: editor.originalSql, SORTBYCONTENT: editor.originalSortby },
    )
    const model = dataModel.build()
    const res = await saveData(auth.serverUrl, [model])
    if (res.statusCode === '1') {
      // 更新 original 为当前值
      editor.setSql(editor.currentSql, true)
      editor.setSortby(editor.currentSortby, true)
      editor.isModified = false
      // 删除草稿
      const key = draftKey(auth.currentName, editor.currentObjectId, editor.currentTabseq)
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

function handleDraftCommand(cmd: string) {
  if (cmd === 'save') handleSaveDraft()
  if (cmd === 'manage') emit('toggle-draft-drawer')
}

async function handleSaveDraft() {
  if (!editor.currentSql.trim() || !editor.selectedStatement) {
    ElMessage.warning('请先选择一条语句')
    return
  }
  try {
    const key = draftKey(auth.currentName, editor.currentObjectId, editor.currentTabseq)
    await saveDraft({
      key,
      connectionName: auth.currentName,
      objectId: editor.currentObjectId,
      tabseq: editor.currentTabseq,
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

function handleToggleLock() {
  editor.toggleLock()
  ElMessage.info(editor.isLocked ? '编辑器已锁定（只读）' : '编辑器已解锁（可编辑）')
}

function handleLinkage() {
  emit('open-linkage')
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
        <el-button size="small" text :icon="Brush" :disabled="!editor.currentSql || editor.isLoadingSql" @click="handleFormat">格式化</el-button>
      </el-tooltip>
      <el-tooltip content="更新到数据库" placement="bottom">
        <el-button size="small" text :icon="Upload" :loading="saving" :disabled="!editor.isModified || editor.isLoadingSql" @click="handleSave">保存</el-button>
      </el-tooltip>
      <el-tooltip content="回滚到原始版本" placement="bottom">
        <el-button size="small" text :icon="RefreshLeft" :disabled="!editor.isModified || editor.isLoadingSql" @click="handleRollback">回滚</el-button>
      </el-tooltip>
      <el-dropdown trigger="click" @command="handleDraftCommand">
        <el-button size="small" text :icon="DocumentCopy">
          草稿
          <el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-item command="save" :disabled="!editor.selectedStatement || editor.isLoadingSql">
            <el-icon><DocumentCopy /></el-icon>保存当前草稿
          </el-dropdown-item>
          <el-dropdown-item command="manage">
            <el-icon><Tickets /></el-icon>管理草稿
          </el-dropdown-item>
        </template>
      </el-dropdown>
      <el-tooltip content="对比变更" placement="bottom">
        <el-button size="small" text :icon="View" :disabled="!editor.currentSql || editor.isLoadingSql" @click="handleDiff">变更对比</el-button>
      </el-tooltip>
    </div>

    <div class="toolbar-divider" />

    <!-- 联动区 -->
    <div class="toolbar-section">
      <el-tooltip content="对比两个服务间的语句差异，支持同步和更新" placement="bottom">
        <el-button size="small" text :icon="Link" @click="handleLinkage">跨服务对比</el-button>
      </el-tooltip>
    </div>

    <div class="toolbar-spacer" />

    <!-- 视图区 -->
    <div class="toolbar-section">
      <el-tooltip :content="editor.isLocked ? '点击解锁以编辑 SQL' : '点击锁定防止误操作'" placement="bottom">
        <el-button
          size="small"
          text
          :type="editor.isLocked ? 'warning' : 'primary'"
          :icon="editor.isLocked ? Lock : Unlock"
          @click="handleToggleLock"
        >{{ editor.isLocked ? '解锁编辑' : '锁定编辑' }}</el-button>
      </el-tooltip>
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
