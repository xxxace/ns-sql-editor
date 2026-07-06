<script setup lang="ts">
/**
 * SqlEditor — Monaco Editor 组件封装
 *
 * 内部管理 Monaco 实例生命周期：
 * - 挂载时创建 editor
 * - 监听 Store.currentSql 变化同步到 editor
 * - 用户输入时同步回 Store
 * - 卸载时销毁
 */

import { ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { ElMessage } from "element-plus";
import * as Monaco from "monaco-editor";
import { format as sqlFormat } from "sql-formatter";
import { createEditor } from "@/utils/monaco";
import { useEditorStore } from "@/stores/editor";

const store = useEditorStore();
const containerRef = ref<HTMLDivElement>();

const emit = defineEmits<{
  reload: [];
}>();

// ---- 状态栏数据 ----
const cursorLine = ref(1);
const cursorColumn = ref(1);
const selectedChars = ref(0);
const indentSpaces = ref(0);

let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
let syncingFromStore = false;
let toggleLockDisposable: Monaco.IDisposable | undefined;
let formatActionDisposable: Monaco.IDisposable | undefined;
let isFormatting = false;

/**
 * 格式化 SQL — 直接操作 editor（executeEdits = 可撤销），不走 store → watch 路径。
 *
 * store → watch 路径用 setValue 会清空 undo 栈（加载/回滚应该是"最初数据"），
 * 但格式化应该是可撤销的，所以这里绕过 watch 直接写 editor，再同步 store。
 */
function runFormat() {
  if (isFormatting || store.isLoadingSql || store.isLocked) return;
  const sql = editor?.getValue() ?? "";
  if (!sql.trim()) {
    ElMessage.warning("没有可格式化的内容");
    return;
  }
  isFormatting = true;
  try {
    const dialects: Array<"plsql" | "sql"> = ["plsql", "sql"];
    for (const lang of dialects) {
      try {
        const formatted = sqlFormat(sql, {
          language: lang,
          tabWidth: 2,
          useTabs: false,
          keywordCase: "upper",
          linesBetweenQueries: 2,
          denseOperators: false,
          newlineBeforeSemicolon: false,
        });

        const model = editor!.getModel();
        if (!model) return;

        // 直接写 editor（进入 undo 栈 → 用户可用 Ctrl+Z 撤销格式化）
        syncingFromStore = true;
        editor!.executeEdits("format", [
          {
            range: model.getFullModelRange(),
            text: formatted,
            forceMoveMarkers: true,
          },
        ]);
        editor!.pushUndoStop();

        // 同步 store → watch 因 modelVal === formatted 直接 return，不触发 setValue
        store.setSql(formatted, false);
        store.checkModified();
        syncingFromStore = false;

        ElMessage.success(
          `格式化完成 (${lang === "plsql" ? "Oracle PL/SQL" : "通用 SQL"})`,
        );
        return;
      } catch {
        // fallback to next dialect
      }
    }
    ElMessage.warning("格式化失败，SQL 包含无法识别的语法，请检查后重试");
  } finally {
    isFormatting = false;
    syncingFromStore = false;
  }
}

function updateCursorStatus() {
  if (!editor) return;
  const pos = editor.getPosition();
  if (pos) {
    cursorLine.value = pos.lineNumber;
    cursorColumn.value = pos.column;
  }
  const sel = editor.getSelection();
  const model = editor.getModel();
  if (sel && model) {
    if (sel.isEmpty()) {
      selectedChars.value = 0;
    } else {
      const text = model.getValueInRange(sel);
      selectedChars.value = text.length;
    }
  }
  // 缩进：当前行前导空格
  if (model && pos) {
    const line = model.getLineContent(pos.lineNumber);
    const match = line.match(/^(\s*)/);
    indentSpaces.value = match ? match[1].length : 0;
  }
}

onMounted(async () => {
  await nextTick();
  if (!containerRef.value) return;

  editor = createEditor(containerRef.value, store.currentSql, (value) => {
    if (syncingFromStore) return;
    store.setSql(value, false);
    store.checkModified();
  });

  // 初始锁定状态（默认 readOnly）
  editor.updateOptions({ readOnly: store.isLocked });

  // 注册光标事件 → 状态栏
  editor.onDidChangeCursorPosition(() => updateCursorStatus());
  editor.onDidChangeCursorSelection(() => updateCursorStatus());
  // 初始状态
  updateCursorStatus();

  // ---- 右键菜单：刷新语句 ----
  editor.addAction({
    id: "ns-reload-statement",
    label: "刷新语句",
    contextMenuGroupId: "navigation",
    contextMenuOrder: 1,
    run: () => {
      if (store.isLoadingSql) return;
      emit("reload");
    },
  });

  // ---- 右键菜单：切换编辑锁定（动态标签） ----
  function registerToggleLock() {
    toggleLockDisposable?.dispose();
    toggleLockDisposable = editor!.addAction({
      id: "ns-toggle-lock",
      label: store.isLocked ? "🔓 解锁编辑" : "🔒 锁定编辑",
      contextMenuGroupId: "navigation",
      contextMenuOrder: 2,
      run: () => {
        if (store.isLoadingSql) return;
        store.isLocked = !store.isLocked;
      },
    });
  }
  registerToggleLock();
  watch(() => store.isLocked, registerToggleLock);

  // ---- 右键菜单 + 快捷键：格式化 SQL ----
  // 快捷键 Shift+Alt+F（VS Code 风格），避免 Ctrl+Shift+F 被 Windows 中文输入法
  // 的简繁体切换（Ctrl+Shift+F）在系统层面拦截，导致 Monaco 永远收不到该按键。
  formatActionDisposable = editor.addAction({
    id: "ns-format",
    label: "格式化 SQL",
    contextMenuGroupId: "navigation",
    contextMenuOrder: 1.5,
    keybindings: [
      Monaco.KeyMod.Shift | Monaco.KeyMod.Alt | Monaco.KeyCode.KeyF,
    ],
    run: runFormat,
  });
});

onBeforeUnmount(() => {
  toggleLockDisposable?.dispose();
  formatActionDisposable?.dispose();
  editor?.dispose();
  editor = null;
});

// Store → Monaco（setValue 清空 undo 栈 — 每次加载/回滚都是"最初数据"）
//
// 格式化不走这里（见 runFormat），因为格式化需要可撤销。
// executeEdits 的问题：每次加载新语句都会推入 undo 栈，导致 Ctrl+Z 能回到上一个语句。
watch(
  () => store.currentSql,
  (val) => {
    if (!editor) return;
    if (syncingFromStore) return;
    const modelVal = editor.getValue();
    if (modelVal === val) return;

    const wasReadOnly = editor.getOption(
      Monaco.editor.EditorOption.readOnly,
    ) as boolean;
    if (wasReadOnly) editor.updateOptions({ readOnly: false });

    syncingFromStore = true;
    editor.setValue(val ?? "");
    nextTick(() => {
      syncingFromStore = false;
      if (editor)
        editor.updateOptions({
          readOnly: store.isLocked || store.isLoadingSql,
        });
    });
  },
);

// 专注模式 / Diff 面板 切换 → 重新布局 Monaco
watch([() => store.isFocusMode, () => store.diffVisible], async () => {
  await nextTick();
  editor?.layout();
});

// 锁定/解锁 / 保存中 → 切换 Monaco readOnly
watch(
  [() => store.isLocked, () => store.isLoadingSql],
  ([locked, loading]) => {
    editor?.updateOptions({ readOnly: locked || loading });
  },
  { immediate: false },
);
</script>

<template>
  <div class="editor-wrapper">
    <div ref="containerRef" class="monaco-host" />
    <div class="status-bar">
      <span class="status-item"
        >行 {{ cursorLine }}, 列 {{ cursorColumn }}</span
      >
      <span v-if="selectedChars > 0" class="status-item status-selected"
        >(已选择{{ selectedChars }})</span
      >
      <span class="status-item status-indent">空格: {{ indentSpaces }}</span>
    </div>
  </div>
</template>

<style scoped>
.editor-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.monaco-host {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.status-bar {
  height: 22px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  font-size: 11px;
  color: #fff;
  background: #007acc;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  user-select: none;
}

.status-item {
  white-space: nowrap;
}

.status-selected {
  color: var(--ns-accent);
}

.status-indent {
  margin-left: auto;
}
</style>
