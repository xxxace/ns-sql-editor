<script setup lang="ts">
/**
 * LinkageCore — Feature B: 联动对比核心组件
 *
 * 可独立使用的核心组件，组合所有子组件：
 * - PageSelector（主会话页面，锁定）
 * - SessionSelector（目标会话选择）
 * - MainStatementList（左列 — 主会话清单）
 * - TargetStatementList（右列 — 目标会话清单）
 * - DiffPanel（复用 — 单语句对比展示）
 * - SyncActions（批量同步按钮）
 *
 * 核心流程：
 * 1. 用户选择目标会话 → SessionSelector emit
 * 2. 核心组件加载目标会话语句清单
 * 3. 对比分析（主 vs 目标）
 * 4. 展示左右双列对照
 * 5. 支持同步（INSERT）和更新（UPDATE）
 */

import { ref, watch, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useEditorStore } from '@/stores/editor'
import { useLinkageStore, type MainStatementItem, type CompareStatementItem } from '@/stores/linkage'
import {
  fetchTargetStatements,
  locateTargetObjectId,
  syncStatement,
  updateFromExternal,
} from '@/api/linkage'
import { searchData } from '@/api/nameson'
// @ts-ignore
import { generateWhere } from '@nameson/sqlutils'
import PageSelector from './PageSelector.vue'
import SessionSelector from './SessionSelector.vue'
import MainStatementList from './MainStatementList.vue'
import TargetStatementList from './TargetStatementList.vue'
import DiffPanelView from './DiffPanelView.vue'
import SessionExpiredDialog from '@/components/SessionExpiredDialog.vue'

const emit = defineEmits<{
  'close': []
}>()

const auth = useAuthStore()
const editor = useEditorStore()
const linkage = useLinkageStore()

// ---- 会话过期弹窗 ----
const expiredDialogVisible = ref(false)
const expiredType = ref<'主会话' | '目标会话'>('目标会话')
const expiredName = ref('')
const refreshingExpired = ref(false)

// ---- 数据加载 ----
const detailSql = 'SELECT OBJECTID,TABSEQ,DSNAME,DBQUERY,SORTBYCONTENT,REF1 FROM PRJOBJDS'

async function loadMainStatements(pageObjectId: string): Promise<MainStatementItem[]> {
  if (!pageObjectId) return []
  const where = generateWhere({ OBJECTID: pageObjectId })
  const res = await searchData(auth.serverUrl, detailSql, where, 'ORDER BY TABSEQ')
  if (res.statusCode === '1' && Array.isArray(res.data)) {
    return (res.data as Record<string, unknown>[]).map((row) => ({
      tabseq: Number(row.TABSEQ ?? 0),
      dsname: String(row.DSNAME ?? ''),
      dbquery: String(row.DBQUERY ?? ''),
      sortByContent: String(row.SORTBYCONTENT ?? ''),
      ref1: String(row.REF1 ?? ''),
    }))
  }
  return []
}

// ---- 独立 Watch #1：主会话页面变化 → 只加载主会话清单 ----
watch(
  () => linkage.selectedPageObjectId,
  async (pageObjectId) => {
    if (!pageObjectId) {
      linkage.setMainStatements([])
      linkage.setCompareResults([])
      return
    }
    linkage.setLoadingMain(true)
    try {
      const items = await loadMainStatements(pageObjectId)
      linkage.setMainStatements(items)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '未知错误'
      ElMessage.error(`加载主会话清单失败: ${msg}`)
    } finally {
      linkage.setLoadingMain(false)
    }
    // 主会话页面变化 → 如果有目标会话，同时重载目标清单
    if (linkage.targetSession) {
      reloadTargetStatements()
    } else {
      maybeCompare()
    }
  },
  { immediate: true },
)

// ---- 目标会话加载（可复用） ----
async function reloadTargetStatements() {
  const session = linkage.targetSession
  if (!session || !linkage.selectedPageObjectId) {
    linkage.setTargetStatements([])
    linkage.setCompareResults([])
    return
  }

  const pageNode = editor.menuNodes.find((n) => n.objectId === linkage.selectedPageObjectId)
  if (!pageNode) {
    ElMessage.warning('未找到选中页面')
    return
  }

  linkage.loadingTarget = true
  linkage.targetExpired = false
  try {
    const targetObjectId = await locateTargetObjectId(
      session.serverUrl,
      session.user,
      session.sessionId ?? 0,
      pageNode.ename,
    )
    if (!targetObjectId) {
      ElMessage.warning(`目标会话中未找到页面 ${pageNode.ename}`)
      linkage.setTargetStatements([])
      linkage.setCompareResults([])
      return
    }

    const targetStmts = await fetchTargetStatements(
      session.serverUrl,
      session.user,
      session.sessionId ?? 0,
      targetObjectId,
    )
    linkage.setTargetStatements(targetStmts)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误'
    if (msg.includes('expired') || msg.includes('session') || msg.includes('401')) {
      expiredType.value = '目标会话'
      expiredName.value = session.name
      expiredDialogVisible.value = true
      linkage.setTargetExpired(true)
    } else {
      ElMessage.error(`加载目标会话数据失败: ${msg}`)
    }
  } finally {
    linkage.loadingTarget = false
  }

  maybeCompare()
}

// ---- 独立 Watch #2：目标会话变化 → 重载目标会话清单 ----
watch(
  () => linkage.targetSession,
  (session) => {
    if (!session) {
      linkage.setTargetStatements([])
      linkage.setCompareResults([])
      return
    }
    reloadTargetStatements()
  },
)

// ---- 自动对比：两边数据都就绪时触发 ----
function maybeCompare() {
  const mainItems = linkage.mainStatements
  const targetItems = linkage.targetStatements
  if (mainItems.length === 0 || targetItems.length === 0) {
    linkage.setCompareResults([])
    return
  }
  const results = compareStatements(mainItems, targetItems)
  linkage.setCompareResults(results)
}

// ---- 对比逻辑 ----
function compareStatements(
  mainDetails: MainStatementItem[],
  targetStmts: import('@/stores/linkage').TargetStatementItem[],
): CompareStatementItem[] {
  const results: CompareStatementItem[] = []
  const targetDsnameMap = new Map(
    targetStmts.filter((t) => t.dsname).map((t) => [t.dsname.toLowerCase(), t]),
  )

  // 处理主会话中的每条语句
  for (const main of mainDetails) {
    if (!main.dsname) {
      results.push({
        tabseq: main.tabseq,
        dsname: '',
        status: 'dsname-empty',
        mainDbquery: main.dbquery,
        mainSortby: main.sortByContent,
        mainRef1: main.ref1,
      })
      continue
    }

    const targetMatch = targetDsnameMap.get(main.dsname.toLowerCase())

    if (!targetMatch) {
      results.push({
        tabseq: main.tabseq,
        dsname: main.dsname,
        status: 'only-main',
        targetRaw: undefined,
      })
      continue
    }

    // 对比 DBQUERY / SORTBYCONTENT / REF1
    const isSame =
      main.dbquery === targetMatch.dbquery &&
      main.sortByContent === targetMatch.sortByContent &&
      main.ref1 === targetMatch.ref1

    results.push({
      tabseq: main.tabseq,
      dsname: main.dsname,
      status: isSame ? 'same' : 'diff',
      mainDbquery: main.dbquery,
      targetDbquery: targetMatch.dbquery,
      mainSortby: main.sortByContent,
      targetSortby: targetMatch.sortByContent,
      mainRef1: main.ref1,
      targetRef1: targetMatch.ref1,
      targetRaw: targetMatch,
    })
  }

  // 处理仅在目标会话中的语句
  for (const target of targetStmts) {
    if (!target.dsname) {
      results.push({
        tabseq: target.tabseq,
        dsname: '',
        status: 'dsname-empty',
        targetDbquery: target.dbquery,
        targetSortby: target.sortByContent,
        targetRef1: target.ref1,
        targetRaw: target,
      })
      continue
    }

    const existsInMain = mainDetails.some(
      (m) => m.dsname.toLowerCase() === target.dsname.toLowerCase(),
    )
    if (!existsInMain) {
      results.push({
        tabseq: target.tabseq,
        dsname: target.dsname,
        status: 'only-target',
        targetDbquery: target.dbquery,
        targetSortby: target.sortByContent,
        targetRef1: target.ref1,
        targetRaw: target,
      })
    }
  }

  return results
}

// ---- 同步操作 ----
async function handleSync(items: CompareStatementItem[]) {
  // 检查编辑器是否有未保存修改
  if (editor.isModified) {
    try {
      await ElMessageBox.confirm(
        '当前语句有未保存的修改，刷新将丢失变更，是否继续？',
        '未保存的修改',
        { confirmButtonText: '确认刷新', cancelButtonText: '取消', type: 'warning' },
      )
    } catch {
      return
    }
  }

  linkage.setSyncing(true)
  let successCount = 0
  let failCount = 0

  for (const item of items) {
    if (!item.targetRaw || !linkage.selectedPageObjectId) continue
    try {
      await syncStatement(
        auth.serverUrl,
        linkage.selectedPageObjectId,
        auth.currentUser,
        item.targetRaw,
      )
      successCount++
    } catch {
      failCount++
    }
  }

  linkage.setSyncing(false)

  if (successCount > 0) {
    ElMessage.success(`同步完成：${successCount} 条成功${failCount > 0 ? `，${failCount} 条失败` : ''}`)
  }
  if (failCount > 0 && successCount === 0) {
    ElMessage.error(`同步失败：${failCount} 条全部失败`)
  }

  // 刷新主会话清单 + 目标会话清单
  linkage.clearSyncSelection()
  if (linkage.selectedPageObjectId) {
    loadMainStatements(linkage.selectedPageObjectId).then((items) => linkage.setMainStatements(items))
  }
  if (linkage.targetSession) {
    const session = linkage.targetSession
    linkage.setTargetSession(null)
    setTimeout(() => linkage.setTargetSession(session), 50)
  }
}

// ---- 手动刷新 ----
async function handleRefreshMain() {
  if (!linkage.selectedPageObjectId) return
  linkage.setLoadingMain(true)
  try {
    const items = await loadMainStatements(linkage.selectedPageObjectId)
    linkage.setMainStatements(items)
  } finally {
    linkage.setLoadingMain(false)
  }
  // 如果有目标会话，同时刷新目标
  if (linkage.targetSession) {
    reloadTargetStatements()
  } else {
    maybeCompare()
  }
}

async function handleRefreshTarget() {
  if (!linkage.targetSession) return
  await reloadTargetStatements()
}

// ---- Diff 面板内「从外部更新」 ----
async function handleDiffUpdate() {
  if (!linkage.diffTabseq) return
  const cmp = linkage.compareResults.find((r) => r.tabseq === linkage.diffTabseq)
  if (!cmp || cmp.status !== 'diff') return
  await handleUpdateFromExternal(cmp)
}

// ---- 从外部更新 ----
async function handleUpdateFromExternal(item: CompareStatementItem) {
  linkage.setSyncing(true)
  try {
    await updateFromExternal(
      auth.serverUrl,
      linkage.selectedPageObjectId || editor.currentObjectId,
      item.tabseq,
      auth.currentUser,
      item.targetDbquery ?? '',
      item.targetSortby ?? '',
      item.targetRef1 ?? '',
      item.mainDbquery ?? '',
      item.mainSortby ?? '',
      item.mainRef1 ?? '',
    )
    ElMessage.success(`已从外部更新语句 ${item.tabseq}`)
    // 刷新主会话清单后重对比
    if (linkage.selectedPageObjectId) {
      const items = await loadMainStatements(linkage.selectedPageObjectId)
      linkage.setMainStatements(items)
      maybeCompare()
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '更新失败'
    ElMessage.error(msg)
  } finally {
    linkage.setSyncing(false)
  }
}

// ---- 会话过期刷新 ----
async function handleRefreshExpired() {
  refreshingExpired.value = true
  try {
    if (expiredType.value === '主会话') {
      const ok = await auth.reconnect()
      if (ok) {
        expiredDialogVisible.value = false
        ElMessage.success('主会话已刷新')
      }
    } else {
      // 目标会话 → silentLogin
      const session = linkage.targetSession
      if (!session) return
      const result = await auth.silentLogin(session.name)
      if (result.sessionId) {
        linkage.setTargetSession({ ...session, sessionId: result.sessionId })
        expiredDialogVisible.value = false
        linkage.targetExpired = false
        ElMessage.success('目标会话已刷新')
      } else {
        ElMessage.error(result.sessionErr || '刷新目标会话失败')
      }
    }
  } finally {
    refreshingExpired.value = false
  }
}

// ---- Diff 面板数据（拼接 SORTBYCONTENT）----
function concatSql(sql: string, sortBy: string): string {
  const s = sortBy.trim()
  return s ? sql + '\n' + s : sql
}

const diffLeftSql = computed(() => {
  if (!linkage.diffTabseq) return ''
  const cmp = linkage.compareResults.find((r) => r.tabseq === linkage.diffTabseq)
  return concatSql(cmp?.mainDbquery ?? '', cmp?.mainSortby ?? '')
})

const diffRightSql = computed(() => {
  if (!linkage.diffTabseq) return ''
  const cmp = linkage.compareResults.find((r) => r.tabseq === linkage.diffTabseq)
  return concatSql(cmp?.targetDbquery ?? '', cmp?.targetSortby ?? '')
})

// ---- 批量同步 ----
const batchSyncLabel = computed(() => {
  const count = linkage.syncSelected.size
  return count > 0 ? `批量同步 (${count}条)` : '批量同步'
})

function handleBatchSync() {
  const items = linkage.compareResults.filter(
    (r) => r.status === 'only-target' && linkage.syncSelected.has(r.tabseq),
  )
  if (items.length === 0) {
    ElMessage.warning('请先勾选需要同步的语句')
    return
  }
  handleSync(items)
}

function handleSelectAll() {
  linkage.selectAllSyncable()
}
</script>

<template>
  <div class="linkage-core">
    <!-- 顶部：页面选择 + 会话选择 + 批量操作 -->
    <div class="linkage-toolbar">
      <PageSelector />
      <SessionSelector />
      <div class="toolbar-spacer" />
      <el-button
        size="small"
        :disabled="linkage.syncSelected.size === 0 || linkage.syncing"
        @click="handleSelectAll"
      >
        全选可同步
      </el-button>
      <el-button
        size="small"
        type="primary"
        :disabled="linkage.syncSelected.size === 0 || linkage.syncing"
        :loading="linkage.syncing"
        @click="handleBatchSync"
      >
        {{ batchSyncLabel }}
      </el-button>
    </div>

    <!-- 中间：左右双列清单（无 Diff 时显示） -->
    <div v-if="!linkage.diffTabseq" class="linkage-lists">
      <MainStatementList
        @refresh="handleRefreshMain"
      />
      <TargetStatementList
        @sync="handleSync"
        @update-from-external="handleUpdateFromExternal"
        @toggle-sync-select="linkage.toggleSyncSelect"
        @refresh="handleRefreshTarget"
      />
    </div>

    <!-- Diff 全屏面板（有 Diff 时占满剩余空间） -->
    <DiffPanelView
      v-if="linkage.diffTabseq"
      :left-sql="diffLeftSql"
      :right-sql="diffRightSql"
      :left-label="`主会话 (${diffLeftSql ? '当前' : '空'})`"
      :right-label="`目标会话 (${diffRightSql ? '外部' : '空'})`"
      @close="linkage.setDiffTabseq(null)"
      @update="handleDiffUpdate"
    />

    <!-- 会话过期弹窗 -->
    <SessionExpiredDialog
      :visible="expiredDialogVisible"
      :session-type="expiredType"
      :connection-name="expiredName"
      :refreshing="refreshingExpired"
      @refresh="handleRefreshExpired"
      @close="expiredDialogVisible = false"
    />
  </div>
</template>

<style scoped>
.linkage-core {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 0;
}

.linkage-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--ns-bg-750);
  border-bottom: 1px solid var(--ns-border);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.toolbar-spacer {
  flex: 1;
}

.linkage-lists {
  display: flex;
  flex: 1;
  gap: 8px;
  padding: 8px;
  min-height: 0;
  overflow: hidden;
}
</style>
