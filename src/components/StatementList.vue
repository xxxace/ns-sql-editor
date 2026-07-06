<script setup lang="ts">
/**
 * StatementList — 中间语句清单
 *
 * 加载：SELECT OBJECTID,TABSEQ,DSNAME,UPDUSER,UPDDTTM FROM PRJOBJDS WHERE OBJECTID=... ORDER BY TABSEQ
 */
import { ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { RefreshRight, Plus } from "@element-plus/icons-vue";
import { searchData } from "@/api/nameson";
import { draftKey, getDraft } from "@/utils/db";
// @ts-ignore
import { generateWhere } from "@nameson/sqlutils";
import { useAuthStore } from "@/stores/auth";
import { useEditorStore, type StatementItem } from "@/stores/editor";
import NewStatementDialog from "@/components/NewStatementDialog.vue";

const auth = useAuthStore();
const editor = useEditorStore();

const loading = ref(false);
const newStmtDialogRef = ref<InstanceType<typeof NewStatementDialog>>();

const LIST_SQL_PREFIX =
  "SELECT OBJECTID,TABSEQ,DSNAME,UPDUSER,UPDDTTM FROM PRJOBJDS";

async function loadStatements(objectId: string) {
  if (!objectId || !auth.isLoggedIn) return;
  loading.value = true;
  try {
    const where = generateWhere({ OBJECTID: objectId });
    const res = await searchData(
      auth.serverUrl,
      LIST_SQL_PREFIX,
      where,
      "ORDER BY TABSEQ",
    );
    if (res.statusCode === "1" && Array.isArray(res.data)) {
      const items: StatementItem[] = res.data.map(
        (row: Record<string, unknown>) => ({
          objectId: String(row.OBJECTID ?? ""),
          tabseq: Number(row.TABSEQ ?? 0),
          dsname: String(row.DSNAME ?? ""),
          updUser: String(row.UPDUSER ?? ""),
          updDttm: String(row.UPDDTTM ?? ""),
        }),
      );
      editor.setStatements(items);
      // 检查每条是否有草稿
      checkDrafts(items);
    } else {
      ElMessage.error(res.message || "加载语句清单失败");
    }
  } catch (e: unknown) {
    ElMessage.error("加载语句清单网络错误");
  } finally {
    loading.value = false;
  }
}

async function checkDrafts(items: StatementItem[]) {
  for (const item of items) {
    const key = draftKey(auth.currentName, item.objectId, item.tabseq);
    const draft = await getDraft(key);
    if (draft) {
      (item as any)._hasDraft = true;
    }
  }
}

async function handleSelect(item: StatementItem & { _hasDraft?: string }) {
  // loading 中禁止切换
  if (editor.isLoadingSql) return;
  // 有未保存修改时提醒用户
  if (editor.isModified && editor.selectedStatement?.tabseq !== item.tabseq) {
    try {
      await ElMessageBox.confirm(
        "当前语句有未保存的修改，切换将丢失这些变更。确定切换吗？",
        "未保存的修改",
        {
          confirmButtonText: "放弃并切换",
          cancelButtonText: "取消",
          type: "warning",
        },
      );
    } catch {
      return;
    }
  }
  editor.selectStatement(item);
}

// Feature A: 打开新增语句弹窗
function handleNewStatement() {
  newStmtDialogRef.value?.open();
}

// Feature A: 新增语句创建成功后刷新 + 自动切换
async function onStatementCreated(tabseq: number) {
  // 刷新清单
  if (editor.currentObjectId) {
    await loadStatements(editor.currentObjectId);
  }
  // 自动切换到新语句（editor.locked 自动解锁）
  const newStmt = editor.statements.find((s) => s.tabseq === tabseq);
  if (newStmt) {
    editor.selectStatement(newStmt);
    editor.isLocked = false; // 新空语句需立即编写
    ElMessage.success(`已创建新语句 ${tabseq}，可以在编辑器中编写 SQL 了`);
  }
}

// 菜单切换时加载清单
watch(
  () => editor.currentObjectId,
  (id) => {
    if (id) loadStatements(id);
  },
);

// 切换会话时清空当前清单（等待新菜单选中后自动重新加载）
watch(
  () => auth.currentName,
  (newName, oldName) => {
    if (oldName && newName !== oldName) {
      editor.setStatements([]);
    }
  },
);
</script>

<template>
  <div class="statement-list flex-col">
    <div class="panel-header">
      <span>语句清单</span>
      <div class="panel-header-actions">
        <el-button
          text
          size="small"
          :icon="Plus"
          :disabled="!editor.currentObjectId || editor.isLoadingSql"
          title="新增语句"
          @click="handleNewStatement"
        />
        <el-button
          text
          size="small"
          :icon="RefreshRight"
          :loading="loading"
          @click="
            editor.currentObjectId && loadStatements(editor.currentObjectId)
          "
        />
      </div>
    </div>
    <div class="panel-body">
      <el-popover
        v-for="item in editor.statements as (StatementItem & {
          _hasDraft?: string;
        })[]"
        width="230"
        placement="right-start"
        :key="item.tabseq"
        :title="item.dsname"
      >
        <template #reference>
          <div
            class="statement-item"
            :class="{
              active: editor.selectedStatement?.tabseq === item.tabseq,
            }"
            @click="handleSelect(item)"
          >
            <div class="statement-seq">{{ item.tabseq }}</div>
            <div class="statement-info">
              <div class="statement-name">{{ item.dsname }}</div>
              <div class="statement-meta">
                {{ item.updUser }} · {{ item.updDttm?.substring(0, 16) }}
              </div>
            </div>
            <el-badge
              v-if="item._hasDraft"
              :value="''"
              :is-dot="true"
              class="draft-badge"
            />
          </div>
        </template>

        <div>
          <div>OBJECTID: {{ item.objectId }}</div>
          <div>TABSEQ: {{ item.tabseq }}</div>
          <div>UPDUSER: {{ item.updUser }}</div>
          <div>UPDDTTM: {{ item.updDttm }}</div>
        </div>
      </el-popover>
      <div v-if="editor.statements.length === 0 && !loading" class="empty-text">
        请先选择菜单项
      </div>
    </div>

    <!-- Feature A: 新增语句弹窗 -->
    <NewStatementDialog ref="newStmtDialogRef" @created="onStatementCreated" />
  </div>
</template>

<style scoped>
.statement-list {
  width: 220px;
  min-width: 160px;
  border-right: 1px solid var(--ns-border);
  height: 100%;
}

.statement-item {
  display: flex;
  align-items: flex-start;
  gap: 2px;
  padding: 7px;
  cursor: pointer;
  transition: background 0.1s;
  border-left: 2px solid transparent;
}

.statement-item:hover {
  background: var(--ns-bg-400);
}

.statement-item.active {
  background: var(--ns-bg-400);
  border-left-color: var(--ns-accent);
}

.statement-seq {
  font-size: 11px;
  font-family: var(--ns-font-mono);
  color: var(--ns-text-muted);
  min-width: 18px;
  text-align: center;
  padding-top: 1px;
}

.statement-info {
  flex: 1;
  min-width: 0;
}

.statement-name {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.statement-meta {
  font-size: 12px;
  color: var(--ns-text-muted);
  margin-top: 1px;
  font-family: var(--ns-font-mono);
}

.draft-badge {
  flex-shrink: 0;
  margin-top: 4px;
}

.empty-text {
  padding: 20px 10px;
  font-size: 12px;
  color: var(--ns-text-muted);
  text-align: center;
}

.panel-header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
</style>
