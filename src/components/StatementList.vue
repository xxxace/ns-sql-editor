<script setup lang="ts">
/**
 * StatementList — 中间语句清单
 *
 * 加载：SELECT OBJECTID,TABSEQ,DSNAME,UPDUSER,UPDDTTM FROM PRJOBJDS WHERE OBJECTID=... ORDER BY TABSEQ
 */
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Tickets } from '@element-plus/icons-vue'
import { searchData } from '@/api/nameson'
import { draftKey, getDraft } from '@/utils/db'
import { useAuthStore } from '@/stores/auth'
import { useEditorStore, type StatementItem } from '@/stores/editor'

const auth = useAuthStore()
const editor = useEditorStore()

const loading = ref(false)

const LIST_SQL_PREFIX = 'SELECT OBJECTID,TABSEQ,DSNAME,UPDUSER,UPDDTTM FROM PRJOBJDS'

async function loadStatements(objectId: string) {
  if (!objectId || !auth.isLoggedIn) return
  loading.value = true
  try {
    const where = `OBJECTID='${objectId}'`
    const res = await searchData(auth.serverUrl, LIST_SQL_PREFIX, where, 'ORDER BY TABSEQ')
    if (res.statusCode === '1' && Array.isArray(res.data)) {
      const items: StatementItem[] = res.data.map((row: Record<string, unknown>) => ({
        objectId: String(row.OBJECTID ?? ''),
        tabseq: Number(row.TABSEQ ?? 0),
        dsname: String(row.DSNAME ?? ''),
        updUser: String(row.UPDUSER ?? ''),
        updDttm: String(row.UPDDTTM ?? ''),
      }))
      editor.setStatements(items)
      // 检查每条是否有草稿
      checkDrafts(items)
    } else {
      ElMessage.error(res.message || '加载语句清单失败')
    }
  } catch (e: unknown) {
    ElMessage.error('加载语句清单网络错误')
  } finally {
    loading.value = false
  }
}

async function checkDrafts(items: StatementItem[]) {
  for (const item of items) {
    const key = draftKey(item.objectId, item.tabseq)
    const draft = await getDraft(key)
    if (draft) {
      item._hasDraft = true as unknown as string
    }
  }
}

async function handleSelect(item: StatementItem & { _hasDraft?: string }) {
  editor.selectStatement(item)
}

// 菜单切换时加载清单
watch(() => editor.currentObjectId, (id) => {
  if (id) loadStatements(id)
})
</script>

<template>
  <div class="statement-list flex-col">
    <div class="panel-header">
      <span>语句清单</span>
    </div>
    <div class="panel-body">
      <div
        v-for="item in (editor.statements as (StatementItem & { _hasDraft?: string })[])"
        :key="item.tabseq"
        class="statement-item"
        :class="{ active: editor.selectedStatement?.tabseq === item.tabseq }"
        @click="handleSelect(item)"
      >
        <div class="statement-seq">{{ item.tabseq }}</div>
        <div class="statement-info">
          <div class="statement-name">{{ item.dsname }}</div>
          <div class="statement-meta">{{ item.updUser }} · {{ item.updDttm?.substring(0, 10) }}</div>
        </div>
        <el-badge v-if="item._hasDraft" :value="''" :is-dot="true" class="draft-badge" />
      </div>
      <div v-if="editor.statements.length === 0 && !loading" class="empty-text">
        请先选择菜单项
      </div>
    </div>
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
  gap: 8px;
  padding: 7px 10px;
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
  font-size: 10px;
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
</style>
