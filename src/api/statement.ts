/**
 * api/statement.ts — 共享语句操作 API
 *
 * Feature A（手动新增占位语句）和 Feature B（同步/更新语句）
 * 共用 getMaxTabseq / buildInsertModel / buildUpdateModel 底层方法。
 */
// @ts-ignore
import type { ColdataModel } from '@nameson/sqlutils'
// @ts-ignore
import { generateWhere, generateDataModel } from '@nameson/sqlutils'
import { searchData, saveData } from '@/api/nameson'

// ---- 类型 ----

/** INSERT 共用的字段集（调用方决定填什么） */
export interface StatementFields {
  DSNAME?: string
  DBQUERY?: string
  SORTBYCONTENT?: string
  REF1?: string
  REF2?: string
  REF3?: string
  TABTY?: string
  TABNAME?: string
  PK_COLNAMES?: string
  [key: string]: unknown
}

// ---- 最大序号查询 ----

const MAXSEQ_SQL = 'SELECT OBJECTID,TABSEQ,DSNAME,DBQUERY,SORTBYCONTENT,ADDUSER,ADDDTTM,UPDUSER,UPDDTTM FROM PRJOBJDS'

/**
 * 获取下一条语句的 TABSEQ（MAX+1）
 *
 * 规则 4: SELECT NVL(MAX(TABSEQ), 0) + 1 FROM PRJOBJDS WHERE OBJECTID=...
 */
export async function getMaxTabseq(serverUrl: string, objectId: string): Promise<number> {
  const where = generateWhere({ OBJECTID: objectId })
  const res = await searchData(serverUrl, MAXSEQ_SQL, where, 'ORDER BY TABSEQ DESC')
  if (res.statusCode !== '1' || !Array.isArray(res.data)) {
    throw new Error(res.message || '获取最大序号失败')
  }
  if (res.data.length === 0) {
    return 1 // 该 OBJECTID 下没有任何语句，返回 1
  }
  const maxSeq = Number((res.data[0] as Record<string, unknown>).TABSEQ ?? 0)
  return maxSeq + 1
}

// ---- INSERT ColdataModel 构建 ----

/**
 * 构建 INSERT ColdataModel — Feature A & B 共用
 *
 * 规则 5: TABSEQ = DSSTMSEQ = DSSTMTY = nextSeq（三值相同）
 * ADDUSER/ADDDTTM/UPDUSER/UPDDTTM → 由 generateDataModel 自动填充
 *
 * @param objectId  主会话 OBJECTID
 * @param newTabseq 新 TABSEQ 值
 * @param fields    要写入的额外字段（调用方决定填什么）
 * @param currentUser 当前用户名
 */
export function buildInsertModel(
  objectId: string,
  newTabseq: number,
  fields: StatementFields,
  currentUser: string,
): ColdataModel {
  const dm = generateDataModel({
    tableName: 'PRJOBJDS',
    user: currentUser,
  })

  dm.setKeyTypeMap({
    NUMBER: ['TABSEQ', 'DSSTMSEQ', 'DSSTMTY'],
  })

  dm.setPKvalues({
    OBJECTID: objectId,
    TABSEQ: newTabseq,
  })

  // 三值相同 + 调用方传入的额外字段
  const coldatas: Record<string, unknown> = {
    OBJECTID: objectId,
    TABSEQ: newTabseq,
    DSSTMSEQ: newTabseq,
    DSSTMTY: newTabseq,
    ...fields,
  }

  // oldData 为空 → INSERT
  dm.setColdatas(coldatas, undefined)
  return dm.build()
}

// ---- UPDATE ColdataModel 构建 ----

/**
 * 构建 UPDATE ColdataModel — Feature B「从外部更新」
 *
 * 规则 6: 覆盖 DBQUERY, SORTBYCONTENT, REF1（仅三个语句相关字段）
 * UPDUSER/UPDDTTM → 由 generateDataModel 自动填充
 *
 * @param objectId       主会话 OBJECTID (PK)
 * @param tabseq         主会话 TABSEQ (PK)
 * @param targetDbquery  目标会话 DBQUERY
 * @param targetSortby   目标会话 SORTBYCONTENT
 * @param targetRef1     目标会话 REF1
 * @param originalDbquery 主会话原始 DBQUERY（差分用）
 * @param originalSortby  主会话原始 SORTBYCONTENT（差分用）
 * @param originalRef1    主会话原始 REF1（差分用）
 * @param currentUser     当前用户名
 */
export function buildUpdateModel(
  objectId: string,
  tabseq: number,
  targetDbquery: string,
  targetSortby: string,
  targetRef1: string,
  originalDbquery: string,
  originalSortby: string,
  originalRef1: string,
  currentUser: string,
): ColdataModel {
  const dm = generateDataModel({
    tableName: 'PRJOBJDS',
    user: currentUser,
  })

  dm.setKeyTypeMap({ NUMBER: ['TABSEQ'] })
  dm.setPKvalues({ OBJECTID: objectId, TABSEQ: tabseq })

  dm.setColdatas(
    {
      DBQUERY: targetDbquery,
      SORTBYCONTENT: targetSortby,
      REF1: targetRef1,
    },
    {
      DBQUERY: originalDbquery,
      SORTBYCONTENT: originalSortby,
      REF1: originalRef1,
    },
  )

  return dm.build()
}

// ---- createStatement — Feature A 专用 ----

/**
 * 创建占位语句（Feature A）
 *
 * 用户只填 DSNAME，DBQUERY 留空，创建后切换到新语句编辑
 */
export async function createStatement(
  serverUrl: string,
  objectId: string,
  dsname: string,
  currentUser: string,
): Promise<number> {
  let nextSeq: number
  try {
    nextSeq = await getMaxTabseq(serverUrl, objectId)
  } catch (e) {
    throw new Error(`获取序号失败: ${e instanceof Error ? e.message : '未知错误'}`)
  }

  const model = buildInsertModel(objectId, nextSeq, {
    DSNAME: dsname,
    // DBQUERY, SORTBYCONTENT 等全部留空 — 占位语句
  }, currentUser)

  const res = await saveData(serverUrl, [model])
  if (res.statusCode !== '1') {
    throw new Error(res.message || '创建语句失败')
  }
  return nextSeq
}
