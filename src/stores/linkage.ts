/**
 * stores/linkage.ts — Feature B: 联动对比状态管理
 *
 * 管理目标会话选择、差异分析结果、同步队列等状态。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// ---- 类型 ----

/** 目标会话中一条语句 */
export interface TargetStatementItem {
  objectId: string
  tabseq: number
  dsname: string
  dbquery: string
  sortByContent: string
  ref1: string
  addUser: string
  addDttm: string
  updUser: string
  updDttm: string
}

/** 清单对比中一条语句的状态 */
export type StatementCompareStatus =
  | 'same'           // 内容一致
  | 'diff'           // 内容差异
  | 'only-main'      // 仅在主会话
  | 'only-target'    // 仅在目标会话
  | 'dsname-empty'   // DSNAME 为空

/** 对比后的语句条目（用于左右双列展示） */
export interface CompareStatementItem {
  /** 原始序号 */
  tabseq: number
  /** 语句名称 */
  dsname: string
  /** 对比状态 */
  status: StatementCompareStatus
  /** 主会话中的 DBQUERY（仅 same/diff 有效） */
  mainDbquery?: string
  /** 目标会话中的 DBQUERY（仅 same/diff/only-target 有效） */
  targetDbquery?: string
  /** 主会话中的 SORTBYCONTENT */
  mainSortby?: string
  /** 目标会话中的 SORTBYCONTENT */
  targetSortby?: string
  /** 主会话中的 REF1 */
  mainRef1?: string
  /** 目标会话中的 REF1 */
  targetRef1?: string
  /** 原始完整数据（同步用） */
  targetRaw?: TargetStatementItem
}

/** 主会话中一条语句（从 DB 加载的清单） */
export interface MainStatementItem {
  tabseq: number
  dsname: string
  dbquery: string
  sortByContent: string
  ref1: string
}

/** 选中的会话信息 */
export interface SessionInfo {
  name: string
  serverUrl: string
  user: string
  sessionId: number | null
}

// ---- Store ----

export const useLinkageStore = defineStore('linkage', () => {
  // ===== 状态 =====

  /** 联动弹窗是否可见 */
  const dialogVisible = ref(false)

  /** 选中的目标会话 */
  const targetSession = ref<SessionInfo | null>(null)

  /** 目标会话是否正在加载 */
  const loadingTarget = ref(false)

  /** 主会话正在加载 */
  const loadingMain = ref(false)

  /** 主会话语句清单 */
  const mainStatements = ref<MainStatementItem[]>([])

  /** 目标会话语句清单 */
  const targetStatements = ref<TargetStatementItem[]>([])

  /** 对比结果（主会话视角） */
  const compareResults = ref<CompareStatementItem[]>([])

  /** 当前展开 Diff 对比的语句 tabseq */
  const diffTabseq = ref<number | null>(null)

  /** 勾选待同步的语句 tabseq 集合 */
  const syncSelected = ref<Set<number>>(new Set())

  /** 同步中 */
  const syncing = ref(false)

  /** 目标会话是否过期（需要刷新） */
  const targetExpired = ref(false)

  /** 当前选中的主会话页面 OBJECTID（默认跟随主页） */
  const selectedPageObjectId = ref<string | null>(null)

  // ===== 计算 =====

  const hasTargetSession = computed(() => targetSession.value !== null)

  /** 可同步的语句（仅在目标会话中的） */
  const syncableItems = computed(() =>
    compareResults.value.filter((r) => r.status === 'only-target'),
  )

  /** 可更新的语句（内容差异的） */
  const updatableItems = computed(() =>
    compareResults.value.filter((r) => r.status === 'diff'),
  )

  // ===== 动作 =====

  function openDialog() {
    dialogVisible.value = true
    syncSelected.value = new Set()
    diffTabseq.value = null
    // selectedPageObjectId 由调用方（EditorView）在 openDialog 前设置
    // 不在此处重置，确保弹窗打开时已携带初始页面
  }

  function closeDialog() {
    dialogVisible.value = false
    targetSession.value = null
    mainStatements.value = []
    targetStatements.value = []
    compareResults.value = []
    syncSelected.value = new Set()
    diffTabseq.value = null
    syncing.value = false
    loadingTarget.value = false
    loadingMain.value = false
    targetExpired.value = false
    selectedPageObjectId.value = null
  }

  function setTargetSession(session: SessionInfo | null) {
    targetSession.value = session
    targetStatements.value = []
    compareResults.value = []
    syncSelected.value = new Set()
    diffTabseq.value = null
    targetExpired.value = false
  }

  function setMainStatements(items: MainStatementItem[]) {
    mainStatements.value = items
  }

  function setLoadingMain(val: boolean) {
    loadingMain.value = val
  }

  function setTargetStatements(items: TargetStatementItem[]) {
    targetStatements.value = items
  }

  function setCompareResults(results: CompareStatementItem[]) {
    compareResults.value = results
  }

  function setDiffTabseq(tabseq: number | null) {
    diffTabseq.value = tabseq
  }

  function toggleSyncSelect(tabseq: number) {
    const set = new Set(syncSelected.value)
    if (set.has(tabseq)) {
      set.delete(tabseq)
    } else {
      set.add(tabseq)
    }
    syncSelected.value = set
  }

  function selectAllSyncable() {
    const all = syncableItems.value.map((s) => s.tabseq)
    syncSelected.value = new Set(all)
  }

  function clearSyncSelection() {
    syncSelected.value = new Set()
  }

  function setSyncing(val: boolean) {
    syncing.value = val
  }

  function setTargetExpired(val: boolean) {
    targetExpired.value = val
  }

  function setSelectedPage(objectId: string | null) {
    selectedPageObjectId.value = objectId
  }

  return {
    // 状态
    dialogVisible,
    targetSession,
    loadingTarget,
    loadingMain,
    mainStatements,
    targetStatements,
    compareResults,
    diffTabseq,
    syncSelected,
    syncing,
    targetExpired,
    selectedPageObjectId,
    // 计算
    hasTargetSession,
    syncableItems,
    updatableItems,
    // 动作
    openDialog,
    closeDialog,
    setMainStatements,
    setLoadingMain,
    setTargetSession,
    setTargetStatements,
    setCompareResults,
    setDiffTabseq,
    toggleSyncSelect,
    selectAllSyncable,
    clearSyncSelection,
    setSyncing,
    setTargetExpired,
    setSelectedPage,
  }
})
