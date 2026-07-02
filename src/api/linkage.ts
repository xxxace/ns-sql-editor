/**
 * api/linkage.ts — Feature B: 联动对比 API
 *
 * 负责查询目标会话语句清单、同步缺失语句（INSERT）、差异更新（UPDATE）。
 * 所有目标会话调用使用 searchDataWithAuth / saveDataWithAuth，不走 injectAuth()。
 */
// @ts-ignore
import { generateWhere } from '@nameson/sqlutils'
import { searchDataWithAuth, saveData } from '@/api/nameson'
import { getMaxTabseq, buildInsertModel, buildUpdateModel } from '@/api/statement'
import type { TargetStatementItem } from '@/stores/linkage'

// ---- SQL 常量 ----

/** 同语句查询（目标会话） */
const TARGET_STATEMENT_SQL =
  'SELECT OBJECTID,TABSEQ,DBQUERY,SORTBYCONTENT,ADDUSER,ADDDTTM,UPDUSER,UPDDTTM FROM PRJOBJDS'

/** 清单查询（目标会话，含 DSNAME 和 REF1） */
const TARGET_STATEMENTS_SQL =
  'SELECT OBJECTID,TABSEQ,DSNAME,DBQUERY,SORTBYCONTENT,REF1,ADDUSER,ADDDTTM,UPDUSER,UPDDTTM FROM PRJOBJDS'

// ---- fetchTargetStatement — 查询目标会话单条同语句 ----

/**
 * 查询目标会话中与当前语句同 ENMAE+DSNAME 的语句
 *
 * 规则 2: SELECT ... FROM PRJOBJDS WHERE OBJECTID =
 *   (SELECT OBJECTID FROM PRJOBJECT WHERE ENAME=... AND DSNAME=...)
 *   AND TABSEQ = ...
 *
 * 注意：OBJECTID 和 PRJOBJECT 定位复用现有的 generateWhere 模式，
 * 这里通过两个步骤：先定位目标 OBJECTID，再按 TABSEQ 查询。
 * 但目标环境 PRJOBJECT 的 OBJECTID 可能不同，所以需要两步查询。
 *
 * 简化方案：直接在主会话预查询目标 OBJECTID（由调用方传入 targetObjectId）
 */
export async function fetchTargetStatement(
  serverUrl: string,
  user: string,
  sessionId: number | string,
  targetObjectId: string,
  tabseq: number,
): Promise<TargetStatementItem | null> {
  const where = generateWhere({
    OBJECTID: targetObjectId,
    TABSEQ: tabseq,
  })
  const res = await searchDataWithAuth(
    serverUrl,
    TARGET_STATEMENT_SQL,
    where,
    '',
    user,
    sessionId,
  )
  if (
    res.statusCode === '1' &&
    Array.isArray(res.data) &&
    res.data.length > 0
  ) {
    return mapToTargetItem(res.data[0] as Record<string, unknown>)
  }
  return null
}

// ---- fetchTargetStatements — 查询目标会话语句清单 ----

/**
 * 查询目标会话的完整语句清单
 *
 * 规则 3: SELECT ... FROM PRJOBJDS WHERE OBJECTID =
 *   (SELECT OBJECTID FROM PRJOBJECT WHERE ENAME=...)
 *   ORDER BY TABSEQ
 *
 * 同样需要调用方传入目标 OBJECTID（由主会话 ENAME 在目标环境定位）
 */
export async function fetchTargetStatements(
  serverUrl: string,
  user: string,
  sessionId: number | string,
  targetObjectId: string,
): Promise<TargetStatementItem[]> {
  const where = generateWhere({ OBJECTID: targetObjectId })
  const res = await searchDataWithAuth(
    serverUrl,
    TARGET_STATEMENTS_SQL,
    where,
    'ORDER BY TABSEQ',
    user,
    sessionId,
  )
  if (
    res.statusCode === '1' &&
    Array.isArray(res.data)
  ) {
    return (res.data as Record<string, unknown>[]).map(mapToTargetItem)
  }
  return []
}

// ---- syncStatement — 同步缺失语句（INSERT） ----

/**
 * 同步一条缺失语句到主会话
 *
 * Feature B: 将目标会话中的语句复制到主会话（INSERT）
 * 规则 5b: DSNAME/DBQUERY/SORTBYCONTENT/REF1-3 等 → 复制源数据
 */
export async function syncStatement(
  mainServerUrl: string,
  mainObjectId: string,
  currentUser: string,
  source: TargetStatementItem,
): Promise<void> {
  let nextSeq: number
  try {
    nextSeq = await getMaxTabseq(mainServerUrl, mainObjectId)
  } catch (e) {
    throw new Error(`获取序号失败: ${e instanceof Error ? e.message : '未知错误'}`)
  }

  const model = buildInsertModel(mainObjectId, nextSeq, {
    DSNAME: source.dsname,
    DBQUERY: source.dbquery,
    SORTBYCONTENT: source.sortByContent,
    REF1: source.ref1,
  }, currentUser)

  // 同步写入主会话，不走 injectAuth，但主会话就是当前登录，直接用 saveData
  const res = await saveData(mainServerUrl, [model])
  if (res.statusCode !== '1') {
    throw new Error(res.message || '同步失败')
  }
}

// ---- updateFromExternal — 差异语句更新（UPDATE） ----

/**
 * 从外部更新主会话语句
 *
 * Feature B: 用目标会话内容覆盖主会话的 DBQUERY/SORTBYCONTENT/REF1
 * 规则 6: UPDATE 操作
 */
export async function updateFromExternal(
  mainServerUrl: string,
  mainObjectId: string,
  tabseq: number,
  currentUser: string,
  targetDbquery: string,
  targetSortby: string,
  targetRef1: string,
  originalDbquery: string,
  originalSortby: string,
  originalRef1: string,
): Promise<void> {
  const model = buildUpdateModel(
    mainObjectId,
    tabseq,
    targetDbquery,
    targetSortby,
    targetRef1,
    originalDbquery,
    originalSortby,
    originalRef1,
    currentUser,
  )

  const res = await saveData(mainServerUrl, [model])
  if (res.statusCode !== '1') {
    throw new Error(res.message || '更新失败')
  }
}

// ---- locateTargetObjectId — 在目标环境定位 OBJECTID ----

/**
 * 在目标会话环境中，通过 ENAME 定位对应的 OBJECTID
 *
 * 主会话的 OBJECTID 在目标环境可能不同，需用 ENAME 重新查询。
 */
const LOCATE_OBJECT_SQL = 'SELECT OBJECTID FROM PRJOBJECT'

export async function locateTargetObjectId(
  serverUrl: string,
  user: string,
  sessionId: number | string,
  ename: string,
): Promise<string | null> {
  const where = generateWhere({ ENAME: ename })
  const res = await searchDataWithAuth(
    serverUrl,
    LOCATE_OBJECT_SQL,
    where,
    '',
    user,
    sessionId,
  )
  if (
    res.statusCode === '1' &&
    Array.isArray(res.data) &&
    res.data.length > 0
  ) {
    return String((res.data[0] as Record<string, unknown>).OBJECTID ?? '')
  }
  return null
}

// ---- 内部工具 ----

function mapToTargetItem(row: Record<string, unknown>): TargetStatementItem {
  return {
    objectId: String(row.OBJECTID ?? ''),
    tabseq: Number(row.TABSEQ ?? 0),
    dsname: String(row.DSNAME ?? ''),
    dbquery: String(row.DBQUERY ?? ''),
    sortByContent: String(row.SORTBYCONTENT ?? ''),
    ref1: String(row.REF1 ?? ''),
    addUser: String(row.ADDUSER ?? ''),
    addDttm: String(row.ADDDTTM ?? ''),
    updUser: String(row.UPDUSER ?? ''),
    updDttm: String(row.UPDDTTM ?? ''),
  }
}
