<script setup lang="ts">
/**
 * EditorView — 主编辑器视图
 *
 * 两个核心状态：
 * - 未登录 → 显示 LoginDialog
 * - 已登录 → 三栏布局编辑器
 */

import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useEditorStore } from '@/stores/editor'
import { searchData } from '@/api/nameson'
import { getDraft, draftKey, type DraftRecord } from '@/utils/db'
// @ts-ignore
import { generateWhere } from '@nameson/sqlutils'
import LoginDialog from '@/components/LoginDialog.vue'
import MenuTree from '@/components/MenuTree.vue'
import StatementList from '@/components/StatementList.vue'
import SqlEditor from '@/components/SqlEditor.vue'
import SqlToolbar from '@/components/SqlToolbar.vue'
import SortByEditor from '@/components/SortByEditor.vue'
import DiffPanel from '@/components/DiffPanel.vue'
import DraftDrawer from '@/components/DraftDrawer.vue'
import LinkageDialog from '@/components/linkage/LinkageDialog.vue'
import { useLinkageStore } from '@/stores/linkage'

const auth = useAuthStore()
const editor = useEditorStore()
const linkage = useLinkageStore()

// ---- 登录弹窗（工具栏触发） ----
const loginDialogVisible = ref(false)
/** 登录弹窗默认 tab：「添加连接」→ new，「切换连接」→ saved */
const loginDefaultTab = ref<'saved' | 'new'>('saved')

/** LoginDialog 是否应该渲染（v-if 控制生死，比 el-dialog model-value 更可靠） */
const showLoginDialog = computed(() => !auth.isLoggedIn || loginDialogVisible.value)

function openLoginFromToolbar() {
  loginDefaultTab.value = 'saved'
  loginDialogVisible.value = true
}

/** 工具栏「添加连接」→ 直接跳新建 tab */
function openLoginNewTab() {
  loginDefaultTab.value = 'new'
  loginDialogVisible.value = true
}

function onLoggedIn() {
  loginDialogVisible.value = false
}

function onLoginDialogClose(val: boolean) {
  if (!val) loginDialogVisible.value = false
}

// Feature B: 打开联动对比弹窗
// 先设置初始页面再打开弹窗，确保 LinkageCore 能立即加载清单
function handleOpenLinkage() {
  if (editor.currentObjectId) {
    linkage.setSelectedPage(editor.currentObjectId)
  }
  linkage.openDialog()
}

onMounted(() => {
  auth.loadAccounts()
})

// ---- 面板 resize（菜单 ↔ 语句 ↔ 编辑区） ----
const menuWidth = ref(220)
const stmtWidth = ref(220)
const resizing = ref(false)
let resizeTarget: 'menu' | 'stmt' | null = null
let resizeStartX = 0
let resizeStartW = 0

function startResize(target: 'menu' | 'stmt', e: MouseEvent) {
  if (editor.isLoadingSql) return
  resizing.value = true
  resizeTarget = target
  resizeStartX = e.clientX
  resizeStartW = target === 'menu' ? menuWidth.value : stmtWidth.value
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
  e.preventDefault()
}

function onResizeMove(e: MouseEvent) {
  if (!resizeTarget) return
  const delta = e.clientX - resizeStartX
  const newW = Math.max(120, Math.min(500, resizeStartW + delta))
  if (resizeTarget === 'menu') {
    menuWidth.value = newW
  } else {
    stmtWidth.value = newW
  }
}

function onResizeEnd() {
  resizing.value = false
  resizeTarget = null
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
})

// ---- 语句加载 ----
const loadingSql = ref(false)
const DETAIL_SQL = 'SELECT OBJECTID,TABSEQ,DBQUERY,SORTBYCONTENT,ADDUSER,ADDDTTM,UPDDTTM,UPDUSER FROM PRJOBJDS'

/** 加载语句内容
 * @param skipDraftPrompt 从草稿跳转时不弹「是否加载草稿」确认框 */
async function loadStatement(skipDraftPrompt = false) {
  const objId = editor.currentObjectId
  const seq = editor.currentTabseq
  if (!objId || !seq || !auth.isLoggedIn) return

  loadingSql.value = true
  editor.isLoadingSql = true
  try {
    const key = draftKey(auth.currentName, objId, seq)
    const draft = await getDraft(key)

    if (draft && !skipDraftPrompt) {
      try {
        await ElMessageBox.confirm(
          `该语句有本地草稿（${new Date(draft.savedAt).toLocaleString()}），是否加载草稿？`,
          '草稿提示',
          {
            confirmButtonText: '加载草稿',
            cancelButtonText: '加载远程版本',
            type: 'info',
          },
        )
        editor.setSql(draft.sql, true)
        editor.setSortby(draft.sortby, true)
        editor.hasDraft = true
        return
      } catch {
        // 加载远程
      }
    }

    // 草稿跳转 或 远程加载
    if (draft && skipDraftPrompt) {
      editor.setSql(draft.sql, true)
      editor.setSortby(draft.sortby, true)
      editor.hasDraft = true
      return
    }

    const where = generateWhere({ OBJECTID: objId, TABSEQ: seq })
    const res = await searchData(auth.serverUrl, DETAIL_SQL, where)
    if (res.statusCode === '1' && Array.isArray(res.data) && res.data.length > 0) {
      const row = res.data[0] as Record<string, unknown>
      editor.setSql(String(row.DBQUERY ?? ''), true)
      editor.setSortby(String(row.SORTBYCONTENT ?? ''), true)
      editor.hasDraft = false
    } else {
      ElMessage.error(res.message || '加载语句失败')
    }
  } catch {
    ElMessage.error('加载语句网络错误')
  } finally {
    loadingSql.value = false
    editor.isLoadingSql = false
  }
}

// ---- 草稿加载（从抽屉） ----
function handleDraftLoad(record: DraftRecord) {
  const objId = record.objectId
  const seq = record.tabseq

  if (editor.currentObjectId !== objId) {
    const menu = editor.menuNodes.find((m) => m.objectId === objId)
    if (menu) {
      editor.selectMenu(menu)
      setTimeout(() => {
        const stmt = editor.statements.find((s) => s.tabseq === seq)
        if (stmt) {
          editor.skipNextLoad = true
          editor.selectStatement(stmt)
          editor.setSql(record.sql, true)
          editor.setSortby(record.sortby, true)
          editor.hasDraft = true
          editor.isLoadingSql = false
        }
      }, 400)
    }
  } else {
    const stmt = editor.statements.find((s) => s.tabseq === seq)
    if (stmt) {
      editor.skipNextLoad = true
      editor.selectStatement(stmt)
      editor.setSql(record.sql, true)
      editor.setSortby(record.sortby, true)
      editor.hasDraft = true
    }
  }
}

// 语句切换 → 加载内容（草稿跳转时跳过）
watch(() => editor.currentTabseq, (seq) => {
  if (seq && !editor.skipNextLoad) loadStatement()
  if (seq && editor.skipNextLoad) {
    // 重置标志位，等待下次切换时恢复
    editor.skipNextLoad = false
  }
})

// ---- 右键菜单「刷新语句」 ----
async function handleReloadStatement() {
  if (editor.isModified) {
    try {
      await ElMessageBox.confirm(
        '当前语句有未保存的修改，刷新将丢失这些变更。确定刷新吗？',
        '未保存的修改',
        {
          confirmButtonText: '刷新',
          cancelButtonText: '取消',
          type: 'warning',
        },
      )
    } catch {
      return
    }
  }
  loadStatement(true)
}
</script>

<template>
  <div class="editor-view">
    <!-- ===== 登录弹窗 ===== -->
    <!-- v-if 控制生死：登录后组件销毁，比 el-dialog model-value 更可靠 -->
    <!-- closable: 首次登录不可关闭，工具栏"切换连接"可关闭 -->
    <LoginDialog
      v-if="showLoginDialog"
      :visible="true"
      :closable="auth.isLoggedIn"
      :default-tab="loginDefaultTab"
      @logged-in="onLoggedIn"
      @update:visible="onLoginDialogClose"
    />

    <!-- ===== 已登录内容 ===== -->
    <template v-if="auth.isLoggedIn">
      <SqlToolbar
        @open-login="openLoginFromToolbar"
        @open-login-new="openLoginNewTab"
        @toggle-draft-drawer="editor.toggleDraftDrawer()"
        @open-linkage="handleOpenLinkage"
      />

      <div class="editor-layout flex-row flex-1 overflow-hidden">
        <!-- 菜单树（专注模式隐藏） -->
        <Transition name="panel-slide">
          <MenuTree
            v-if="!editor.isFocusMode"
            :style="{ width: menuWidth + 'px' }"
          />
        </Transition>

        <!-- 分割线 1：菜单 ↔ 语句 -->
        <div
          v-if="!editor.isFocusMode"
          class="resize-handle"
          @mousedown="startResize('menu', $event)"
        />

        <!-- 语句清单（专注模式隐藏） -->
        <Transition name="panel-slide">
          <StatementList
            v-if="!editor.isFocusMode"
            :style="{ width: stmtWidth + 'px' }"
          />
        </Transition>

        <!-- 分割线 2：语句 ↔ 编辑区 -->
        <div
          v-if="!editor.isFocusMode"
          class="resize-handle"
          @mousedown="startResize('stmt', $event)"
        />

        <!-- 编辑主区 -->
        <div class="editor-main flex-col flex-1">
          <div class="editor-body flex-1" :class="{ collapsed: editor.diffVisible }">
            <SqlEditor @reload="handleReloadStatement" />
            <!-- loading 遮罩层 -->
            <Transition name="fade">
              <div v-if="editor.isLoadingSql" class="loading-overlay">
                <div class="loading-spinner">
                  <div class="spinner" />
                  <span>处理中...</span>
                </div>
              </div>
            </Transition>
          </div>
          <DiffPanel v-if="editor.diffVisible" />
          <SortByEditor v-if="!editor.diffVisible" />
        </div>
      </div>

      <!-- 草稿抽屉 -->
      <DraftDrawer
        v-if="editor.draftDrawerVisible"
        @load-draft="handleDraftLoad"
      />

      <!-- Feature B: 联动对比弹窗 -->
      <LinkageDialog />
    </template>

    <!-- 全局 resize 遮罩（拖拽时不触发 iframe/编辑区事件） -->
    <div v-if="resizing" class="resize-overlay" />
  </div>
</template>

<style scoped>
.editor-view {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor-layout {
  flex: 1;
  min-height: 0;
}

.editor-main {
  min-width: 0;
}

.editor-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.editor-body.collapsed {
  display: none;
}

/* ---- resize 拖拽手柄 ---- */
.resize-handle {
  width: 1px;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
  transition: background 0.15s;
  position: relative;
  z-index: 5;
}

.resize-handle:hover,
.resize-handle:active {
  background: var(--ns-accent);
}

.resize-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  cursor: col-resize;
  /* 透明遮罩防止拖拽时触发编辑器/iframe 事件 */
}

/* ---- loading 遮罩 ---- */
.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(30, 30, 30, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  backdrop-filter: blur(2px);
}

.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--ns-accent);
  font-size: 13px;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 2px solid var(--ns-border);
  border-top-color: var(--ns-accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  width: 0 !important;
  min-width: 0 !important;
  opacity: 0;
}
</style>
