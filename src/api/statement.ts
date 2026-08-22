/**
 * api/statement.ts — 共享语句操作 API
 *
 * Feature A（手动新增占位语句）和 Feature B（同步/更新语句）
 * 共用 buildInsertModel / buildUpdateModel 底层方法。
 */
// @ts-ignore
import type { ColdataModel } from '@nameson/sqlutils'
// @ts-ignore
import { generateDataModel } from '@nameson/sqlutils'
import { saveData } from '@/api/nameson'

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
  nextSeq: number,
  extraFields?: StatementFields,
): Promise<number> {
  // 占位语句：DBQUERY/SORTBYCONTENT 等留空。
  // nextSeq 由调用方基于「已加载到本地的语句清单」本地推算（空清单 → 1，否则 max(TABSEQ)+1），
  // 不再去服务端查询 PRJOBJDS 取最大序号——空清单场景服务端无数据可查，纯属无意义往返。
  // extraFields 用于填补页面级「基础资料」（如 TABNAME），由调用方用菜单信息传入，
  // 保证空清单也能成功创建第一条语句。
  const model = buildInsertModel(objectId, nextSeq, {
    DSNAME: dsname,
    ...extraFields,
  }, currentUser)

  const res = await saveData(serverUrl, [model])
  if (res.statusCode !== '1') {
    throw new Error(res.message || '创建语句失败')
  }
  return nextSeq
}
