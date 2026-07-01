<script setup lang="ts">
/**
 * DraftDrawer — 草稿清单抽屉
 *
 * 列出所有本地草稿，支持单条删除
 */
import { ref, watch } from 'vue'
import { Delete } from '@element-plus/icons-vue'
import { getAllDrafts, deleteDraft, draftKey, type DraftRecord } from '@/utils/db'
import { useAuthStore } from '@/stores/auth'
import { useEditorStore } from '@/stores/editor'

const auth = useAuthStore()
const editor = useEditorStore()

const drafts = ref<DraftRecord[]>([])
const loading = ref(false)

async function loadDrafts() {
  if (!auth.currentName) {
    drafts.value = []
    return
  }
  loading.value = true
  try {
    drafts.value = await getAllDrafts(auth.currentName)
  } finally {
    loading.value = false
  }
}

function handleLoad(record: DraftRecord) {
  emit('load-draft', record)
  emit('update:visible', false)
}

async function handleDelete(record: DraftRecord) {
  await deleteDraft(record.key)
  // 如果删除的是当前语句的草稿，清除角标
  const currentKey = draftKey(auth.currentName, editor.currentObjectId, editor.currentTabseq)
  if (record.key === currentKey) {
    editor.hasDraft = false
  }
  await loadDrafts()
}

watch(() => props.visible, (val) => {
  if (val) loadDrafts()
})

function formatTime(ts: number) {
  return new Date(ts).toLocaleString()
}
</script>

<template>
  <el-drawer
    :model-value="visible"
    direction="rtl"
    size="360px"
    title="草稿清单"
    @update:model-value="emit('update:visible', $event)"
  >
    <div v-if="loading" class="draft-loading">加载中...</div>

    <div v-else-if="drafts.length === 0" class="draft-empty">
      <p>暂无草稿</p>
    </div>

    <div v-else class="draft-list">
      <div v-for="d in drafts" :key="d.key" class="draft-item" @click="handleLoad(d)">
        <div class="draft-info">
          <div class="draft-title">{{ d.dsname || d.objectId + '#' + d.tabseq }}</div>
          <div class="draft-meta">
            保存于 {{ formatTime(d.savedAt) }}
          </div>
          <div class="draft-preview">{{ d.sql.substring(0, 120) }}{{ d.sql.length > 120 ? '...' : '' }}</div>
        </div>
        <el-button
          text
          size="small"
          type="danger"
          :icon="Delete"
          @click.stop="handleDelete(d)"
        />
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.draft-loading,
.draft-empty {
  text-align: center;
  padding: 40px 0;
  color: var(--ns-text-muted);
  font-size: 13px;
}

.draft-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.draft-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.draft-item:hover {
  background: var(--ns-bg-400);
}

.draft-info {
  flex: 1;
  min-width: 0;
}

.draft-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 2px;
}

.draft-meta {
  font-size: 11px;
  color: var(--ns-text-muted);
  margin-bottom: 4px;
}

.draft-preview {
  font-size: 11px;
  font-family: var(--ns-font-mono);
  color: var(--ns-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
