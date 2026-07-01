/**
 * Monaco Editor 工具 — Worker 配置 + 主题 + SQL 智能提示 + 编辑器/diff 工厂函数
 */

import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'

// ---- Worker 配置 ----
self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    return new editorWorker()
  },
}

// ---- 基于 vs-dark 微调 SQL 高亮（函数、字符串降饱和度） ----
monaco.editor.defineTheme('ns-sql-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'function', foreground: 'B8B080' },
    { token: 'predefined', foreground: 'ECD75B' },
    { token: 'predefined.sql', foreground: 'ECD75B' },
    { token: 'string', foreground: 'CE743D' },
    { token: 'string.sql', foreground: 'CE743D' },
    { token: 'string.escape', foreground: 'CE743D' },
    { token: 'operator.sql', foreground: '569CD6' },
  ],
  colors: {},
})

// ============ SQL 智能提示 ============

// ---- 静态关键字/函数/Snippet 数据 ----

const sqlKeywords: string[] = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'EXISTS',
  'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN',
  'ON', 'USING', 'AS',
  'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM',
  'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE',
  'CREATE INDEX', 'DROP INDEX',
  'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
  'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT', 'MINUS',
  'DISTINCT', 'ALL', 'TOP',
  'LIKE', 'BETWEEN', 'IS NULL', 'IS NOT NULL',
  'ASC', 'DESC',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'WITH', 'RECURSIVE',
  'INTO',
]

const sqlFunctions: Array<[string, string]> = [
  ['COUNT', 'COUNT(*) / COUNT(expr) — 计数'],
  ['SUM', 'SUM(expr) — 求和'],
  ['AVG', 'AVG(expr) — 平均值'],
  ['MIN', 'MIN(expr) — 最小值'],
  ['MAX', 'MAX(expr) — 最大值'],
  ['COALESCE', 'COALESCE(a, b, ...) — 返回第一个非 NULL 值'],
  ['NULLIF', 'NULLIF(a, b) — a=b 时返回 NULL'],
  ['CAST', 'CAST(expr AS type) — 类型转换'],
  ['CONVERT', 'CONVERT(type, expr) — 类型转换（Oracle）'],
  ['NVL', 'NVL(expr, alt) — NULL 替换（Oracle）'],
  ['NVL2', 'NVL2(expr, a, b) — NULL 判断替换（Oracle）'],
  ['DECODE', 'DECODE(expr, s1, r1, ..., default) — 条件分支（Oracle）'],
  ['ROW_NUMBER', 'ROW_NUMBER() OVER (...) — 行号'],
  ['RANK', 'RANK() OVER (...) — 排名（有并列）'],
  ['DENSE_RANK', 'DENSE_RANK() OVER (...) — 密集排名'],
  ['LAG', 'LAG(expr, n, def) OVER (...) — 取前 n 行'],
  ['LEAD', 'LEAD(expr, n, def) OVER (...) — 取后 n 行'],
  ['FIRST_VALUE', 'FIRST_VALUE(expr) OVER (...) — 窗口首值'],
  ['LAST_VALUE', 'LAST_VALUE(expr) OVER (...) — 窗口尾值'],
  ['OVER', 'OVER (PARTITION BY ... ORDER BY ...) — 窗口函数框架'],
  ['PARTITION BY', 'PARTITION BY col — 窗口分区'],
]

const stringFunctions: Array<[string, string]> = [
  ['UPPER', 'UPPER(str) — 转大写'],
  ['LOWER', 'LOWER(str) — 转小写'],
  ['TRIM', "TRIM([LEADING|TRAILING|BOTH] c FROM str) — 去空格"],
  ['LTRIM', 'LTRIM(str) — 去左侧空格'],
  ['RTRIM', 'RTRIM(str) — 去右侧空格'],
  ['SUBSTR', 'SUBSTR(str, start, len) — 截取子串（Oracle）'],
  ['SUBSTRING', 'SUBSTRING(str, start, len) — 截取子串'],
  ['LENGTH', 'LENGTH(str) — 字符串长度（Oracle）'],
  ['LEN', 'LEN(str) — 字符串长度'],
  ['CONCAT', 'CONCAT(a, b) — 字符串拼接'],
  ['||', 'str1 || str2 — 字符串拼接（Oracle）'],
  ['REPLACE', 'REPLACE(str, old, new) — 替换'],
  ['INSTR', 'INSTR(str, sub) — 查找子串位置（Oracle）'],
  ['LPAD', 'LPAD(str, n, pad) — 左侧填充（Oracle）'],
  ['RPAD', 'RPAD(str, n, pad) — 右侧填充（Oracle）'],
]

const dateFunctions: Array<[string, string]> = [
  ['SYSDATE', 'SYSDATE — 当前日期时间（Oracle）'],
  ['SYSTIMESTAMP', 'SYSTIMESTAMP — 当前时间戳（Oracle）'],
  ['TO_DATE', 'TO_DATE(str, fmt) — 字符串转日期（Oracle）'],
  ['TO_CHAR', 'TO_CHAR(date, fmt) — 日期转字符串（Oracle）'],
  ['TO_NUMBER', 'TO_NUMBER(str) — 字符串转数字（Oracle）'],
  ['ADD_MONTHS', 'ADD_MONTHS(date, n) — 日期加 n 月（Oracle）'],
  ['MONTHS_BETWEEN', 'MONTHS_BETWEEN(a, b) — 月份差（Oracle）'],
  ['NEXT_DAY', 'NEXT_DAY(date, day) — 下个星期几（Oracle）'],
  ['LAST_DAY', 'LAST_DAY(date) — 当月最后一天（Oracle）'],
  ['TRUNC', 'TRUNC(date, [fmt]) — 截断日期（Oracle）'],
  ['ROUND', 'ROUND(date, [fmt]) — 四舍五入日期（Oracle）'],
  ['EXTRACT', 'EXTRACT(YEAR FROM date) — 提取日期部分'],
  ['GETDATE', 'GETDATE() — 当前日期时间'],
  ['DATEADD', 'DATEADD(part, n, date) — 日期加'],
  ['DATEDIFF', 'DATEDIFF(part, a, b) — 日期差'],
  ['FORMAT', 'FORMAT(date, fmt) — 格式化日期'],
]

const plsqlKeywords: string[] = [
  'BEGIN', 'DECLARE', 'END', 'IS', 'AS',
  'PROCEDURE', 'FUNCTION', 'PACKAGE', 'BODY',
  'IF', 'THEN', 'ELSIF', 'ELSE', 'END IF',
  'LOOP', 'END LOOP', 'WHILE', 'FOR', 'EXIT', 'CONTINUE',
  'CURSOR', 'FETCH', 'OPEN', 'CLOSE',
  'EXCEPTION', 'WHEN', 'THEN', 'RAISE', 'PRAGMA',
  'RETURN', 'RETURNING', 'BULK COLLECT', 'INTO',
  'COMMIT', 'ROLLBACK', 'SAVEPOINT',
  'MERGE INTO', 'USING', 'MATCHED',
  'CONNECT BY', 'START WITH', 'PRIOR', 'LEVEL',
  'ROWNUM', 'ROWID',
  'DUAL',
]

const dataTypes: Array<[string, string]> = [
  ['VARCHAR2', 'VARCHAR2(n) — 变长字符串（Oracle）'],
  ['NVARCHAR2', 'NVARCHAR2(n) — Unicode 变长字符串（Oracle）'],
  ['CHAR', 'CHAR(n) — 定长字符串'],
  ['NCHAR', 'NCHAR(n) — Unicode 定长字符串'],
  ['NUMBER', 'NUMBER(p, s) — 数字类型（Oracle）'],
  ['INTEGER', 'INTEGER — 整数'],
  ['INT', 'INT / INTEGER — 整数'],
  ['FLOAT', 'FLOAT(p) — 浮点数'],
  ['DATE', 'DATE — 日期类型（Oracle）'],
  ['TIMESTAMP', 'TIMESTAMP — 时间戳'],
  ['CLOB', 'CLOB — 大文本（Oracle）'],
  ['NCLOB', 'NCLOB — Unicode 大文本（Oracle）'],
  ['BLOB', 'BLOB — 二进制大对象'],
  ['RAW', 'RAW(n) — 二进制数据（Oracle）'],
  ['LONG', 'LONG — 长文本（Oracle，已废弃）'],
  ['BOOLEAN', 'BOOLEAN — 布尔类型'],
  ['BINARY_INTEGER', 'BINARY_INTEGER — PL/SQL 整数'],
]

const ddlKeywords: string[] = [
  'PRIMARY KEY', 'FOREIGN KEY', 'REFERENCES',
  'UNIQUE', 'CHECK', 'DEFAULT', 'NOT NULL',
  'CONSTRAINT', 'INDEX', 'UNIQUE INDEX',
  'TABLESPACE', 'STORAGE', 'PCTFREE', 'INITRANS',
  'GRANT', 'REVOKE', 'ROLE',
]

// ---- SQL 上下文解析（别名 → 字段列表）----

interface SqlAliasContext {
  /** alias → table 映射 */
  aliasToTable: Map<string, string>
  /** 主表别名（FROM 第一个表） */
  mainAlias: string
  /** 每个别名对应的字段列表 */
  aliasColumns: Map<string, Set<string>>
}

/**
 * 解析 SQL 文本，提取别名映射和字段归属
 * 支持：FROM table alias、SELECT alias.col、无前缀字段归主表
 */
function parseSqlAliasContext(sql: string): SqlAliasContext {
  const aliasToTable = new Map<string, string>()
  const aliasColumns = new Map<string, Set<string>>()
  let mainAlias = ''

  const clean = sql
    .replace(/--[^\n]*/g, '')           // 去单行注释
    .replace(/\/\*[\s\S]*?\*\//g, '') // 去块注释
    .toUpperCase()

  // 1. 解析 FROM 子句，提取 table alias 映射
  //    支持：FROM TASK A, DEPT B  以及  FROM TASK A JOIN DEPT B ON ...
  const fromMatch = clean.match(
    /FROM\s+([\s\S]+?)(?:\s+WHERE|\s+GROUP|\s+ORDER|\s+HAVING|\s+LIMIT|\s+UNION|\s+EXCEPT|\s+INTERSECT|$)/i
  )
  if (fromMatch) {
    const fromBody = fromMatch[1].trim()
    // 用 JOIN/ON/USING 分割，再按逗号分割多表
    const parts = fromBody
      .split(/\s+(?:JOIN|INNER|LEFT|RIGHT|FULL|CROSS|ON|USING)\s+/i)
      .join(' ')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    parts.forEach((part, idx) => {
      const m = part.match(/^(\w+)\s+(\w+)$/)
      if (m) {
        aliasToTable.set(m[2], m[1])
        if (idx === 0) mainAlias = m[2]
      } else {
        // 只有表名没有别名：用表名作为别名
        const tbl = part.split(/\s+/)[0]
        if (tbl && /^\w+$/.test(tbl)) {
          aliasToTable.set(tbl, tbl)
          if (idx === 0) mainAlias = tbl
        }
      }
    })
  }

  // 2. 解析 SELECT 子句，建立 alias → columns 映射
  const selectMatch = clean.match(/SELECT\s+([\s\S]+?)\s+FROM\b/i)
  if (selectMatch) {
    const selectBody = selectMatch[1].trim()
    const cols = selectBody.split(',')
    for (const col of cols) {
      const c = col.trim()
      if (c === '*' || c.endsWith('.*')) continue
      const dotMatch = c.match(/^(\w+)\.(\w+)/)
      if (dotMatch) {
        // A.COL_NAME → 归属到别名 A
        const alias = dotMatch[1]
        const colName = dotMatch[2]
        if (!aliasColumns.has(alias)) aliasColumns.set(alias, new Set())
        aliasColumns.get(alias)!.add(colName)
      } else {
        // 无前缀：归属到主表别名
        const colName = c.split(/\s+AS\s+|\s+/i)[0]
        if (mainAlias) {
          if (!aliasColumns.has(mainAlias)) aliasColumns.set(mainAlias, new Set())
          aliasColumns.get(mainAlias)!.add(colName)
        }
      }
    }
  }

  // 3. 扫描全文本，补充所有 alias.column 引用（WHERE/ORDER/GROUP 等）
  for (const alias of aliasToTable.keys()) {
    const re = new RegExp(`\\b${alias}\\.(\\w+)`, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(clean)) !== null) {
      if (!aliasColumns.has(alias)) aliasColumns.set(alias, new Set())
      aliasColumns.get(alias)!.add(m[1])
    }
  }

  return { aliasToTable, mainAlias, aliasColumns }
}

// ---- Snippets（不包含 range，在 provider 中动态注入）----

const snippets: Array<{
  label: string
  kind: monaco.languages.CompletionItemKind
  detail: string
  insertText: string
  insertTextRules: monaco.languages.CompletionItemInsertTextRule
  documentation: string
}> = [
  {
    label: 'sel',
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: 'SELECT * FROM',
    insertText: 'SELECT ${1:*} FROM ${2:table}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'SELECT 模板',
  },
  {
    label: 'selc',
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: 'SELECT cols FROM WHERE',
    insertText: 'SELECT ${1:columns}\nFROM ${2:table}\nWHERE ${3:condition}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'SELECT 带 WHERE 模板',
  },
  {
    label: 'join',
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: 'JOIN 模板',
    insertText: 'SELECT ${1:*}\nFROM ${2:table_a} a\n${3:INNER} JOIN ${4:table_b} b\n  ON b.${5:key} = a.${5:key}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'JOIN 模板',
  },
  {
    label: 'group',
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: 'GROUP BY 模板',
    insertText: 'SELECT ${1:cols}, ${2:aggregate(expr)}\nFROM ${3:table}\nGROUP BY ${1:cols}\nHAVING ${4:condition}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'GROUP BY 模板',
  },
  {
    label: 'ins',
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: 'INSERT INTO 模板',
    insertText: 'INSERT INTO ${1:table} (${2:columns})\nVALUES (${3:values})',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'INSERT INTO 模板',
  },
  {
    label: 'upd',
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: 'UPDATE 模板',
    insertText: 'UPDATE ${1:table}\nSET ${2:col} = ${3:value}\nWHERE ${4:condition}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'UPDATE 模板',
  },
  {
    label: 'del',
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: 'DELETE FROM 模板',
    insertText: 'DELETE FROM ${1:table}\nWHERE ${2:condition}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'DELETE FROM 模板',
  },
  {
    label: 'with',
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: 'WITH CTE 模板',
    insertText: 'WITH ${1:cte} AS (\n  SELECT ${2:*}\n  FROM ${3:table}\n  WHERE ${4:condition}\n)\nSELECT *\nFROM ${1:cte}',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'WITH (CTE) 模板',
  },
  {
    label: 'case',
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: 'CASE WHEN 模板',
    insertText: 'CASE\n  WHEN ${1:condition} THEN ${2:result1}\n  ELSE ${3:result2}\nEND',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'CASE WHEN 模板',
  },
  {
    label: 'proc',
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: 'PL/SQL PROCEDURE 模板',
    insertText: 'CREATE OR REPLACE PROCEDURE ${1:proc_name}(\n  ${2:params}\n) IS\nBEGIN\n  ${3:-- body}\nEND ${1:proc_name};',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'PL/SQL Procedure 模板',
  },
  {
    label: 'func',
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: 'PL/SQL FUNCTION 模板',
    insertText:
      'CREATE OR REPLACE FUNCTION ${1:func_name}(\n  ${2:params}\n) RETURN ${3:return_type} IS\n  ${4:result} ${3:return_type};\nBEGIN\n  ${5:-- body}\n  RETURN ${4:result};\nEND ${1:func_name};',
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    documentation: 'PL/SQL Function 模板',
  },
]

// ---- 注册 Completion Provider ----

function registerSqlCompletionProvider() {
  const allKeywords = [...sqlKeywords, ...plsqlKeywords, ...ddlKeywords]
  const allFunctions: Array<[string, string]> = [
    ...sqlFunctions,
    ...stringFunctions,
    ...dateFunctions,
    ...dataTypes,
  ]

  monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: [' ', '.', ',', '('],
    provideCompletionItems: (_model, position) => {
      const sqlText = _model.getValue()
      const lineUntilPos = _model.getLineContent(position.lineNumber).substring(0, position.column - 1)
      const word = _model.getWordUntilPosition(position)

      // 计算 range（替换当前 word）
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }

      // ===== 别名 column 提示：匹配 `alias.` 模式 =====
      const aliasDotMatch = lineUntilPos.match(/(\w+)\.$/)
      if (aliasDotMatch) {
        const alias = aliasDotMatch[1].toUpperCase()
        const ctx = parseSqlAliasContext(sqlText)

        // 收集该 alias 对应的字段
        const columns = ctx.aliasColumns.get(alias)
        if (columns && columns.size > 0) {
          const items: monaco.languages.CompletionItem[] = [...columns].map(col => ({
            label: col,
            kind: monaco.languages.CompletionItemKind.Field,
            detail: `${alias}.${col}  (${ctx.aliasToTable.get(alias) || '?'})`,
            documentation: `字段：${alias}.${col}\n表：${ctx.aliasToTable.get(alias) || '未知'}`,
            insertText: col,
            range: {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: position.column, // `.` 后面开始
              endColumn: position.column,
            },
          }))
          return { suggestions: items }
        }
      }

      // ===== 基础关键字/函数/Snippet 提示 =====
      const keywordItems: monaco.languages.CompletionItem[] = allKeywords.map(kw => ({
        label: kw,
        kind: monaco.languages.CompletionItemKind.Keyword,
        detail: 'keyword',
        documentation: `${kw} 关键字`,
        insertText: kw,
        range,
      }))

      const functionItems: monaco.languages.CompletionItem[] = allFunctions.map(([name, doc]) => ({
        label: name,
        kind: monaco.languages.CompletionItemKind.Function,
        detail: doc.split(' — ')[0] || 'function',
        documentation: { value: `\`\`\`sql\n${doc}\n\`\`\`` },
        insertText: name,
        range,
      }))

      const snippetItems = snippets.map(s => ({
        ...s,
        range,
      }))

      return { suggestions: [...keywordItems, ...functionItems, ...snippetItems] }
    },
  })
}

registerSqlCompletionProvider()

// ============ 工厂函数 ============

/**
 * 添加 VS Code 风格的 Ctrl+Shift+Z 重做快捷键（Monaco 默认只有 Ctrl+Y）
 */
function addRedoKeybinding() {
  monaco.editor.addKeybindingRules([
    {
      keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ,
      command: 'redo',
    },
  ])
}

addRedoKeybinding()

const editorDefaults: monaco.editor.IStandaloneEditorConstructionOptions = {
  language: 'sql',
  theme: 'ns-sql-dark',
  fontSize: 13,
  fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  lineNumbers: 'on',
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'off',
  renderLineHighlight: 'line',
  cursorSmoothCaretAnimation: 'on',
  cursorBlinking: 'smooth',
  smoothScrolling: true,
  padding: { top: 8 },
  suggest: { showKeywords: true, showSnippets: true },
  bracketPairColorization: { enabled: true },
  autoClosingBrackets: 'always',
  autoClosingQuotes: 'always',
  tabSize: 2,
  folding: true,
  lineDecorationsWidth: 8,
  overviewRulerBorder: false,
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
  automaticLayout: true,
}

export function createEditor(
  container: HTMLElement,
  value: string,
  onChange?: (value: string) => void,
): monaco.editor.IStandaloneCodeEditor {
  const ed = monaco.editor.create(container, { ...editorDefaults, value })
  if (onChange) {
    ed.onDidChangeModelContent(() => onChange(ed.getValue()))
  }
  return ed
}

export function createDiffEditor(
  container: HTMLElement,
  original: string,
  modified: string,
): monaco.editor.IStandaloneDiffEditor {
  const diff = monaco.editor.createDiffEditor(container, {
    theme: 'ns-sql-dark',
    fontSize: 13,
    fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    renderSideBySide: true,
    readOnly: true,
    originalEditable: false,
    padding: { top: 8 },
    scrollbar: { verticalScrollbarSize: 6 },
    automaticLayout: true,
  })

  const origModel = monaco.editor.createModel(original, 'sql')
  const modModel = monaco.editor.createModel(modified, 'sql')
  diff.setModel({ original: origModel, modified: modModel })

  return diff
}
