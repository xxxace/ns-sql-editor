/**
 * Editor Store — 当前编辑状态
 *
 * 管理菜单树选中项、语句清单、SQL 编辑器内容等
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface MenuNode {
  objectId: string
  ename: string
  cname: string
}

export interface StatementItem {
  objectId: string
  tabseq: number
  dsname: string
  updUser: string
  updDttm: string
}

export interface StatementDetail {
  objectId: string
  tabseq: number
  dbquery: string
  sortByContent: string
}

export const useEditorStore = defineStore('editor', () => {
  // ===== 菜单树 =====
  const menuNodes = ref<MenuNode[]>([])
  const selectedMenu = ref<MenuNode | null>(null)

  // ===== 语句清单 =====
  const statements = ref<StatementItem[]>([])
  const selectedStatement = ref<StatementItem | null>(null)

  // ===== 编辑器 =====
  /** 当前编辑器中的 SQL */
  const currentSql = ref('')
  /** 数据库中的原始 SQL（用于回滚和 diff） */
  const originalSql = ref('')
  /** 当前 SORTBYCONTENT */
  const currentSortby = ref('')
  /** 数据库中的原始 SORTBYCONTENT */
  const originalSortby = ref('')
  /** 语句详情 */
  const statementDetail = ref<StatementDetail | null>(null)
  /** 是否已修改 */
  const isModified = ref(false)

  // ===== 草稿 =====
  /** 当前语句是否有草稿 */
  const hasDraft = ref(false)

  // ===== UI 状态 =====
  /** 专注模式：折叠左侧菜单树 + 中列语句清单 */
  const isFocusMode = ref(false)
  /** Diff 面板是否打开 */
  const diffVisible = ref(false)
  /** 草稿抽屉是否打开 */
  const draftDrawerVisible = ref(false)

  // ===== 计算 =====
  const currentObjectId = computed(() => selectedMenu.value?.objectId ?? '')
  const currentTabseq = computed(() => selectedStatement.value?.tabseq ?? 0)

  // ===== 动作 =====

  function setMenuNodes(nodes: MenuNode[]) {
    menuNodes.value = nodes
  }

  function selectMenu(node: MenuNode | null) {
    selectedMenu.value = node
    selectedStatement.value = null
    statements.value = []
    clearEditor()
  }

  function setStatements(items: StatementItem[]) {
    statements.value = items
  }

  function selectStatement(item: StatementItem | null) {
    selectedStatement.value = item
    if (!item) {
      clearEditor()
    }
  }

  function setSql(sql: string, asOriginal = true) {
    currentSql.value = sql
    if (asOriginal) {
      originalSql.value = sql
    }
    isModified.value = false
  }

  function setSortby(sortby: string, asOriginal = true) {
    currentSortby.value = sortby
    if (asOriginal) {
      originalSortby.value = sortby
    }
  }

  function setDetail(detail: StatementDetail) {
    statementDetail.value = detail
  }

  function clearEditor() {
    currentSql.value = ''
    originalSql.value = ''
    currentSortby.value = ''
    originalSortby.value = ''
    statementDetail.value = null
    isModified.value = false
    hasDraft.value = false
    diffVisible.value = false
  }

  /**
   * 标记修改状态
   * 比较当前值和原始值
   */
  function checkModified() {
    isModified.value =
      currentSql.value !== originalSql.value ||
      currentSortby.value !== originalSortby.value
  }

  function toggleFocusMode() {
    isFocusMode.value = !isFocusMode.value
  }

  function toggleDiff() {
    diffVisible.value = !diffVisible.value
  }

  function toggleDraftDrawer() {
    draftDrawerVisible.value = !draftDrawerVisible.value
  }

  return {
    // 状态
    menuNodes,
    selectedMenu,
    statements,
    selectedStatement,
    currentSql,
    originalSql,
    currentSortby,
    originalSortby,
    statementDetail,
    isModified,
    hasDraft,
    isFocusMode,
    diffVisible,
    draftDrawerVisible,
    // 计算
    currentObjectId,
    currentTabseq,
    // 动作
    setMenuNodes,
    selectMenu,
    setStatements,
    selectStatement,
    setSql,
    setSortby,
    setDetail,
    clearEditor,
    checkModified,
    toggleFocusMode,
    toggleDiff,
    toggleDraftDrawer,
  }
})
