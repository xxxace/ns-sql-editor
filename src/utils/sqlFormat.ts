/**
 * sqlFormat — SQL 格式化纯函数模块
 *
 * 从 SqlEditor.runFormat 抽离的「文本 → 文本」算法部分，
 * 供 SqlEditor 与 Playground 共用，避免两处重复 dialect fallback 逻辑。
 * 本模块不依赖 Vue / store / Monaco，只做纯文本转换。
 */

import { format as sqlFormat } from 'sql-formatter'

/**
 * 格式化 SQL 文本。
 * 依次尝试 plsql / sql 两种 dialect，任一成功即返回格式化结果；
 * 全部失败返回 null（语法无法识别）。
 */
export function formatSqlText(sql: string): string | null {
  const dialects: Array<'plsql' | 'sql'> = ['plsql', 'sql']
  for (const lang of dialects) {
    try {
      return sqlFormat(sql, {
        language: lang,
        tabWidth: 2,
        useTabs: false,
        keywordCase: 'upper',
        linesBetweenQueries: 2,
        denseOperators: false,
        newlineBeforeSemicolon: false,
      })
    } catch {
      // fallback to next dialect
    }
  }
  return null
}
