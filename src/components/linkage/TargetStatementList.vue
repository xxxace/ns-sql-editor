<script setup lang="ts">
/**
 * TargetStatementList — Feature B: 目标会话语句清单（右列）
 *
 * 基于 linkage.targetStatements 渲染基础列表，
 * 叠加 linkage.compareResults 的状态颜色。
 * 选择目标会话后立即有数据，不等对比结果。
 */

import { computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { useLinkageStore, type CompareStatementItem } from '@/stores/linkage'

const emit = defineEmits<{
  'sync': [items: CompareStatementItem[]]
  'update-from-external': [item: CompareStatementItem]
  'toggle-sync-select': [tabseq: number]
  'refresh': []
}>()

const linkage = useLinkageStore()

const canRefresh = computed(() =>
  !linkage.loadingTarget && linkage.hasTargetSession,
)

interface DisplayItem {
  tabseq: number
  dsname: string
  status: string
  cssClass: string
  icon: string
  tooltip: string
  compareItem: CompareStatementItem | null
  isSelected: boolean
}

const displayItems = computed<DisplayItem[]>(() => {
  const targets = linkage.targetStatements
  const compareMap = new Map(
    linkage.compareResults.map((r) => [r.tabseq, r]),
  )

  return targets.map((t) => {
    const cmp = compareMap.get(t.tabseq)
    const isSelected = cmp ? linkage.syncSelected.has(cmp.tabseq) : false

    if (!cmp) {
      // 尚无对比结果：正常显示（目标会话原生数据）
      return {
        tabseq: t.tabseq,
        dsname: t.dsname || '(空)',
        status: t.dsname ? 'loaded' : 'dsname-empty',
        cssClass: t.dsname ? '' : 'status-empty',
        icon: t.dsname ? '' : '⚠',
        tooltip: t.dsname ? '' : 'DSNAME为空',
        compareItem: null,
        isSelected: false,
      }
    }

    switch (cmp.status) {
      case 'dsname-empty':
        return {
          tabseq: cmp.tabseq,
          dsname: cmp.dsname || '(空)',
          status: 'dsname-empty',
          cssClass: 'status-empty',
          icon: '⚠',
          tooltip: `DSNAME为空，无法匹配${cmp.targetDbquery ? '\nDBQUERY: ' + cmp.targetDbquery.substring(0, 100) : ''}`,
          compareItem: cmp,
          isSelected: false,
        }
      case 'only-target':
        return {
          tabseq: cmp.tabseq,
          dsname: cmp.dsname,
          status: 'only-target',
          cssClass: 'status-absent',
          icon: '⬇',
          tooltip: '仅目标会话有，可同步到主会话',
          compareItem: cmp,
          isSelected,
        }
      case 'same':
        return {
          tabseq: cmp.tabseq,
          dsname: cmp.dsname,
          status: 'same',
          cssClass: 'status-same',
          icon: '✓',
          tooltip: '内容一致',
          compareItem: cmp,
          isSelected: false,
        }
      case 'diff':
        return {
          tabseq: cmp.tabseq,
          dsname: cmp.dsname,
          status: 'diff',
          cssClass: 'status-diff',
          icon: '🔄',
          tooltip: '内容差异，可展开对比后从外部更新',
          compareItem: cmp,
          isSelected: false,
        }
      default:
        return {
          tabseq: cmp.tabseq,
          dsname: cmp.dsname,
          status: 'unknown',
          cssClass: '',
          icon: '❓',
          tooltip: '',
          compareItem: cmp,
          isSelected: false,
        }
    }
  })
})

function handleClick(item: DisplayItem) {
  if (item.status === 'same' || item.status === 'diff') {
    linkage.setDiffTabseq(item.tabseq)
  }
}

function isClickable(status: string): boolean {
  return status === 'same' || status === 'diff'
}

function handleSync(item: DisplayItem) {
  if (!item.compareItem) return
  emit('sync', [item.compareItem])
}

async function handleUpdate(item: DisplayItem) {
  if (!item.compareItem) return
  // Diff 面板展开时才显示按钮，点击前确认
  try {
    await ElMessageBox.confirm(
      `确认用目标会话的版本覆盖主会话语句 ${item.tabseq}？\n此操作将更新 DBQUERY、SORTBYCONTENT 和 REF1 字段。`,
      '从外部更新确认',
      { confirmButtonText: '确认更新', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  emit('update-from-external', item.compareItem)
}

function handleToggleSelect(item: DisplayItem) {
  if (item.status === 'only-target') {
    emit('toggle-sync-select', item.tabseq)
  }
}
</script>

<template>
  <div class="stmt-list-panel">
    <div class="list-header">
      <span class="list-title">目标会话语句清单</span>
      <span v-if="linkage.loadingTarget" class="loading-text">加载中...</span>
      <div class="list-header-spacer" />
      <el-button
        text
        size="small"
        :icon="Refresh"
        :disabled="!canRefresh"
        :loading="linkage.loadingTarget"
        @click="emit('refresh')"
      />
    </div>
    <div class="list-body">
      <el-tooltip
        v-for="item in displayItems"
        :key="item.tabseq"
        :content="item.tooltip"
        placement="left"
        :show-after="400"
        :disabled="!item.tooltip"
      >
        <div
          class="list-item"
          :class="[
            item.cssClass,
            {
              clickable: isClickable(item.status),
              active: linkage.diffTabseq === item.tabseq,
              selected: item.isSelected,
            },
          ]"
          @click="handleClick(item)"
        >
          <!-- 勾选框（仅可同步行） -->
          <el-checkbox
            v-if="item.status === 'only-target'"
            :model-value="item.isSelected"
            size="small"
            class="sync-checkbox"
            @click.stop
            @change="handleToggleSelect(item)"
          />
          <span v-else class="sync-checkbox-placeholder" />

          <span class="item-seq">{{ item.tabseq }}</span>
          <span class="item-icon">{{ item.icon }}</span>
          <span class="item-name">{{ item.dsname }}</span>

          <!-- 操作按钮 -->
          <el-button
            v-if="item.status === 'only-target'"
            size="small"
            text
            type="primary"
            class="action-btn"
            @click.stop="handleSync(item)"
          >
            同步
          </el-button>
          <el-button
            v-if="item.status === 'diff' && linkage.diffTabseq === item.tabseq"
            size="small"
            text
            type="warning"
            class="action-btn"
            @click.stop="handleUpdate(item)"
          >
            从外部更新
          </el-button>
        </div>
      </el-tooltip>
      <div v-if="displayItems.length === 0 && !linkage.loadingTarget" class="empty-text">
        {{ linkage.hasTargetSession ? '目标会话无匹配语句' : '请先选择目标会话' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.stmt-list-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ns-border);
  border-radius: 4px;
  overflow: hidden;
  background: var(--ns-bg-800);
}

.list-header {
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #6c5ce7;
  background: var(--ns-bg-750);
  border-bottom: 1px solid var(--ns-border);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.list-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.list-header-spacer {
  flex: 1;
}

.loading-text {
  font-size: 11px;
  color: var(--ns-text-muted);
  font-weight: 400;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.list-body {
  flex: 1;
  overflow-y: auto;
  padding: 2px 0;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 10px;
  font-size: 12px;
  transition: background 0.1s;
  border-left: 2px solid transparent;
}

.list-item:hover {
  background: var(--ns-bg-400);
}

.list-item.clickable {
  cursor: pointer;
}

.list-item.active {
  background: var(--ns-bg-400);
  border-left-color: #6c5ce7;
}

.list-item.selected {
  background: rgba(108, 92, 231, 0.08);
}

.sync-checkbox {
  flex-shrink: 0;
}

.sync-checkbox-placeholder {
  width: 16px;
  flex-shrink: 0;
}

.item-seq {
  font-family: var(--ns-font-mono);
  color: var(--ns-text-muted);
  min-width: 24px;
  font-size: 11px;
}

.item-icon {
  font-size: 11px;
  width: 16px;
  text-align: center;
  flex-shrink: 0;
}

.item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-btn {
  font-size: 11px;
  flex-shrink: 0;
  white-space: nowrap;
}

/* 状态样式 — 同左列 */
.status-empty {
  color: #f87171;
  background: rgba(248, 113, 113, 0.08);
}
.status-empty:hover {
  background: rgba(248, 113, 113, 0.16);
}

.status-absent {
  color: #9ca3af;
  opacity: 0.6;
}

.status-same {
  color: var(--ns-text);
}

.status-diff {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.06);
}
.status-diff:hover {
  background: rgba(251, 191, 36, 0.12);
}

.empty-text {
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--ns-text-muted);
}
</style>
