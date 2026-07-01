/**
 * 构建 SaveDatas 接口所需的 DataModel 结构
 *
 * 完整格式：
 * [{
 *   Tablename: 'PRJOBJDS',
 *   DataType: 'UPDATE',
 *   PKvalues: "OBJECTID:'871002',TABSEQ:1",
 *   Coldatas: [
 *     { COLDATANAME: 'DBQUERY',      NEWCOLDATA: '...', OLDCOLDATA: '...' },
 *     { COLDATANAME: 'SORTBYCONTENT', NEWCOLDATA: '...', OLDCOLDATA: '...' },
 *   ]
 * }]
 */

export interface ColdataItem {
  COLDATANAME: string
  NEWCOLDATA: string
  OLDCOLDATA: string
}

export interface DataModelItem {
  Tablename: string
  DataType: string
  PKvalues: string
  Coldatas: ColdataItem[]
}

/**
 * 构建更新 PRJOBJDS 表的数据模型
 *
 * 注意：TABSEQ 是数字类型不加引号，OBJECTID 是字符串类型加引号
 */
export function buildUpdateModel(
  objectId: string,
  tabseq: number,
  newSql: string,
  oldSql: string,
  newSortby?: string,
  oldSortby?: string,
): DataModelItem {
  const coldatas: ColdataItem[] = [
    {
      COLDATANAME: 'DBQUERY',
      NEWCOLDATA: newSql,
      OLDCOLDATA: oldSql,
    },
  ]

  if (newSortby !== undefined || oldSortby !== undefined) {
    coldatas.push({
      COLDATANAME: 'SORTBYCONTENT',
      NEWCOLDATA: newSortby ?? '',
      OLDCOLDATA: oldSortby ?? '',
    })
  }

  return {
    Tablename: 'PRJOBJDS',
    DataType: 'UPDATE',
    PKvalues: `OBJECTID:'${objectId}',TABSEQ:${tabseq}`,
    Coldatas: coldatas,
  }
}
