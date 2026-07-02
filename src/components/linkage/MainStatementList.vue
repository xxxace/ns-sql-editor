<script setup lang="ts">
/**
 * MainStatementList — Feature B: 主会话语句清单（左列）
 *
 * 基于 linkage.mainStatements 渲染基础列表，
 * 叠加 linkage.compareResults 的状态颜色。
 * 选择页面后立即有数据，不等目标会话。
 */

import { computed } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { useLinkageStore } from '@/stores/linkage'

const linkage = useLinkageStore()

const emit = defineEmits<{
  'refresh': []
}>()

const canRefresh = computed(() =>
  !linkage.loadingMain && !!linkage.selectedPageObjectId,
)

interface DisplayItem {
  tabseq: number
  dsname: string
  status: string
  cssClass: string
  icon: string
  tooltip: string
}

const displayItems = computed<DisplayItem[]>(() => {
  const mains = linkage.mainStatements
  const compareMap = new Map(
    linkage.compareResults.map((r) => [r.tabseq, r]),
  )

  return mains.map((m) => {
    const cmp = compareMap.get(m.tabseq)
    if (!cmp) {
      // 尚无对比结果：正常显示（主会话原生数据）
      return {
        tabseq: m.tabseq,
        dsname: m.dsname || '(空)',
        status: m.dsname ? 'loaded' : 'dsname-empty',
        cssClass: m.dsname ? '' : 'status-empty',
        icon: m.dsname ? '' : '⚠',
        tooltip: m.dsname ? '' : 'DSNAME为空',
      }
    }
    // 有对比结果：叠加状态
    switch (cmp.status) {
      case 'dsname-empty':
        return {
          tabseq: cmp.tabseq,
          dsname: cmp.dsname || '(空)',
          status: 'dsname-empty',
          cssClass: 'status-empty',
          icon: '⚠',
          tooltip: `DSNAME为空，无法匹配${cmp.mainDbquery ? '\n' + cmp.mainDbquery.substring(0, 100) : ''}`,
        }
      case 'only-main':
        return {
          tabseq: cmp.tabseq,
          dsname: cmp.dsname,
          status: 'only-main',
          cssClass: 'status-absent',
          icon: '',
          tooltip: '仅主会话有',
        }
      case 'same':
        return {
          tabseq: cmp.tabseq,
          dsname: cmp.dsname,
          status: 'same',
          cssClass: 'status-same',
          icon: '✓',
          tooltip: '内容一致',
        }
      case 'diff':
        return {
          tabseq: cmp.tabseq,
          dsname: cmp.dsname,
          status: 'diff',
          cssClass: 'status-diff',
          icon: '🔄',
          tooltip: '内容差异，点击展开对比',
        }
      default:
        return {
          tabseq: cmp.tabseq,
          dsname: cmp.dsname,
          status: 'unknown',
          cssClass: '',
          icon: '❓',
          tooltip: '',
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
</script>

<template>
  <div class="stmt-list-panel">
    <div class="list-header">
      <span class="list-title">主会话语句清单</span>
      <span v-if="linkage.loadingMain" class="loading-text">加载中...</span>
      <div class="list-header-spacer" />
      <el-button
        text
        size="small"
        :icon="Refresh"
        :disabled="!canRefresh"
        :loading="linkage.loadingMain"
        @click="emit('refresh')"
      />
    </div>
    <div class="list-body">
      <el-tooltip
        v-for="item in displayItems"
        :key="item.tabseq"
        :content="item.tooltip"
        placement="right"
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
            },
          ]"
          @click="handleClick(item)"
        >
          <span class="item-seq">{{ item.tabseq }}</span>
          <span class="item-icon">{{ item.icon }}</span>
          <span class="item-name">{{ item.dsname }}</span>
        </div>
      </el-tooltip>
      <div v-if="displayItems.length === 0 && !linkage.loadingMain" class="empty-text">
        {{ linkage.selectedPageObjectId ? '该页面无语句' : '请先选择页面' }}
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
  color: var(--ns-accent);
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

/* 状态样式 */
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
