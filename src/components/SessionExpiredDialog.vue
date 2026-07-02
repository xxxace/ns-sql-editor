<script setup lang="ts">
/**
 * SessionExpiredDialog.vue — 会话过期提示弹窗（通用）
 *
 * 主会话和目标会话过期时复用，接受会话类型和连接名。
 * 主会话过期 → 调 reconnect()；目标会话过期 → 调 silentLogin()。
 */

defineProps<{
  visible: boolean
  /** 会话类型 */
  sessionType: '主会话' | '目标会话'
  /** 连接名称 */
  connectionName: string
  /** 是否正在刷新 */
  refreshing?: boolean
}>()

const emit = defineEmits<{
  'refresh': []
  'close': []
}>()
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="`${sessionType}已过期`"
    width="400px"
    :close-on-click-modal="false"
  >
    <div class="expired-content">
      <el-icon :size="40" color="#f87171">
        <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      </el-icon>
      <p class="expired-msg">
        {{ sessionType }} <strong>{{ connectionName }}</strong> 的登录已过期。
      </p>
      <p class="expired-hint">
        点击「刷新」重新登录该会话后可继续操作。
      </p>
    </div>

    <template #footer>
      <el-button @click="emit('close')">关闭</el-button>
      <el-button type="primary" :loading="refreshing" @click="emit('refresh')">
        刷新{{ sessionType }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.expired-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  text-align: center;
}

.expired-msg {
  font-size: 14px;
  margin: 0;
  line-height: 1.6;
}

.expired-hint {
  font-size: 12px;
  color: var(--ns-text-muted);
  margin: 0;
}
</style>
