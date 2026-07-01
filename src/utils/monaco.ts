/**
 * Monaco Editor 工具 — Worker 配置 + 主题 + 编辑器/diff 工厂函数
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

// ---- 暗色主题 ----
monaco.editor.defineTheme('vs-dark-custom', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
    { token: 'keyword', foreground: '569CD6' },
    { token: 'string', foreground: 'CE9178' },
    { token: 'number', foreground: 'B5CEA8' },
    { token: 'operator', foreground: 'D4D4D4' },
    { token: 'delimiter', foreground: 'D4D4D4' },
    { token: 'identifier', foreground: '9CDCFE' },
    { token: 'type', foreground: '4EC9B0' },
    { token: 'function', foreground: 'DCDCAA' },
  ],
  colors: {
    'editor.background': '#141418',
    'editor.foreground': '#D4D4DC',
    'editor.lineHighlightBackground': '#23232A',
    'editor.selectionBackground': '#264F78',
    'editor.inactiveSelectionBackground': '#3A3D41',
    'editorCursor.foreground': '#4A9EFF',
    'editorLineNumber.foreground': '#4A4A5A',
    'editorLineNumber.activeForeground': '#8B8B9E',
    'editorIndentGuide.background': '#2A2A35',
    'editorBracketMatch.background': '#3A3D41',
    'editorBracketMatch.border': '#4A9EFF',
    'editorGutter.background': '#141418',
    'editorWidget.background': '#1C1C22',
    'editorWidget.border': '#2A2A35',
    'editorSuggestWidget.background': '#1C1C22',
    'editorSuggestWidget.border': '#2A2A35',
    'editorSuggestWidget.selectedBackground': '#23232A',
    'diffEditor.insertedTextBackground': '#1a3a2a',
    'diffEditor.removedTextBackground': '#3a1a2a',
  },
})

// ---- 工厂函数 ----

const editorDefaults: monaco.editor.IStandaloneEditorConstructionOptions = {
  language: 'sql',
  theme: 'vs-dark-custom',
  fontSize: 13,
  fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
  lineNumbers: 'on',
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'off',
  renderLineHighlight: 'line',
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
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
  // 确保容器大小变化时自动重新布局
  automaticLayout: true,
}

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
    theme: 'vs-dark-custom',
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
