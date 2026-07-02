<script setup lang="ts">
/**
 * SessionSelector — 目标会话下拉选择器（Feature B）
 *
 * 从已保存账号列表中选择目标会话，支持刷新当前选中会话。
 * 选择后自动触发目标会话数据加载流程。
 */
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useLinkageStore, type SessionInfo } from '@/stores/linkage'

const auth = useAuthStore()
const linkage = useLinkageStore()

const selecting = ref(false)

const accountOptions = computed(() =>
  auth.accounts
    .filter((a) => a.name !== auth.currentName)
    .map((a) => ({
      value: a.name,
      label: `${a.name} (${a.user}@${a.serverUrl})`,
    })),
)

const noOtherAccounts = computed(() => accountOptions.value.length === 0)

const selectedName = ref('')

function handleSelect(name: string) {
  if (!name) {
    linkage.setTargetSession(null)
    selectedName.value = ''
    return
  }
  const account = auth.accounts.find((a) => a.name === name)
  if (!account) return

  selecting.value = true
  selectedName.value = name

  const session: SessionInfo = {
    name: account.name,
    serverUrl: account.serverUrl,
    user: account.user,
    sessionId: account.sessionId,
  }
  linkage.setTargetSession(session)
  selecting.value = false
}
</script>

<template>
  <div class="session-selector">
    <label class="selector-label">目标会话</label>
    <el-select
      v-model="selectedName"
      placeholder="选择要对比的会话"
      size="small"
      class="selector-select"
      clearable
      :loading="selecting"
      :disabled="noOtherAccounts"
      @change="handleSelect"
    >
      <el-option
        v-for="opt in accountOptions"
        :key="opt.value"
        :label="opt.label"
        :value="opt.value"
      />
    </el-select>
    <span v-if="noOtherAccounts" class="no-accounts-hint">无其他可用会话</span>
  </div>
</template>

<style scoped>
.session-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.selector-label {
  font-size: 12px;
  color: var(--ns-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.selector-select {
  width: 280px;
}

.no-accounts-hint {
  font-size: 11px;
  color: var(--ns-text-muted);
  white-space: nowrap;
}
</style>
