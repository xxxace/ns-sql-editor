<script setup lang="ts">
/**
 * EditorView — 主编辑器视图
 *
 * 两个核心状态：
 * - 未登录 → 显示 LoginDialog
 * - 已登录 → 三栏布局编辑器
 */

import { ref, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useEditorStore } from '@/stores/editor'
import { searchData } from '@/api/nameson'
import { getDraft, draftKey, type DraftRecord } from '@/utils/db'
import LoginDialog from '@/components/LoginDialog.vue'
import MenuTree from '@/components/MenuTree.vue'
import StatementList from '@/components/StatementList.vue'
import SqlEditor from '@/components/SqlEditor.vue'
import SqlToolbar from '@/components/SqlToolbar.vue'
import SortByEditor from '@/components/SortByEditor.vue'
import DiffPanel from '@/components/DiffPanel.vue'
import DraftDrawer from '@/components/DraftDrawer.vue'

const auth = useAuthStore()
const editor = useEditorStore()

// ---- 登录弹窗（工具栏触发） ----
const loginDialogVisible = ref(false)

function openLoginFromToolbar() {
  loginDialogVisible.value = true
}

function onLoggedIn() {
  loginDialogVisible.value = false
}

onMounted(() => {
  auth.loadAccounts()
})

// ---- 语句加载 ----
const loadingSql = ref(false)
const DETAIL_SQL = 'SELECT OBJECTID,TABSEQ,DBQUERY,SORTBYCONTENT,ADDUSER,ADDDTTM,UPDDTTM,UPDUSER FROM PRJOBJDS'

async function loadStatement() {
  const objId = editor.currentObjectId
  const seq = editor.currentTabseq
  if (!objId || !seq || !auth.isLoggedIn) return

  loadingSql.value = true
  try {
    const key = draftKey(objId, seq)
    const draft = await getDraft(key)

    if (draft) {
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

    const where = `OBJECTID='${objId}' AND TABSEQ=${seq}`
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
  }
}

// ---- 草稿加载（从抽屉） ----
function handleDraftLoad(record: DraftRecord) {
  const parts = record.key.split('_')
  const objId = parts[1]
  const seq = parseInt(parts[2], 10)

  if (editor.currentObjectId !== objId) {
    const menu = editor.menuNodes.find((m) => m.objectId === objId)
    if (menu) {
      editor.selectMenu(menu)
      setTimeout(() => {
        const stmt = editor.statements.find((s) => s.tabseq === seq)
        if (stmt) {
          editor.selectStatement(stmt)
          editor.setSql(record.sql, true)
          editor.setSortby(record.sortby, true)
          editor.hasDraft = true
        }
      }, 400)
    }
  } else {
    const stmt = editor.statements.find((s) => s.tabseq === seq)
    if (stmt) {
      editor.selectStatement(stmt)
      editor.setSql(record.sql, true)
      editor.setSortby(record.sortby, true)
      editor.hasDraft = true
    }
  }
}

// 语句切换 → 加载内容
watch(() => editor.currentTabseq, (seq) => {
  if (seq) loadStatement()
})
</script>

<template>
  <div class="editor-view">
    <!-- ===== 登录弹窗 ===== -->
    <LoginDialog
      :visible="!auth.isLoggedIn || loginDialogVisible"
      @logged-in="onLoggedIn"
      @update:visible="loginDialogVisible = $event"
    />

    <!-- ===== 已登录内容 ===== -->
    <template v-if="auth.isLoggedIn">
      <SqlToolbar
        @open-login="openLoginFromToolbar"
        @toggle-draft-drawer="editor.toggleDraftDrawer()"
      />

      <div class="editor-layout flex-row flex-1 overflow-hidden">
        <!-- 菜单树（专注模式隐藏） -->
        <Transition name="panel-slide">
          <MenuTree v-if="!editor.isFocusMode" />
        </Transition>

        <!-- 语句清单（专注模式隐藏） -->
        <Transition name="panel-slide">
          <StatementList v-if="!editor.isFocusMode" />
        </Transition>

        <!-- 编辑主区 -->
        <div class="editor-main flex-col flex-1">
          <div class="editor-body flex-1" :class="{ collapsed: editor.diffVisible }">
            <SqlEditor />
          </div>
          <DiffPanel v-if="editor.diffVisible" />
          <SortByEditor v-if="!editor.diffVisible" />
        </div>
      </div>

      <!-- 草稿抽屉 -->
      <DraftDrawer
        :visible="editor.draftDrawerVisible"
        @update:visible="editor.draftDrawerVisible = $event"
        @load-draft="handleDraftLoad"
      />
    </template>
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
  min-height: 0;
  position: relative;
}

.editor-body.collapsed {
  display: none;
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
