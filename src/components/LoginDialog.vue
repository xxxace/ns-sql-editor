<script setup lang="ts">
/**
 * LoginDialog — 登录弹窗 + 账户管理
 *
 * 两种模式：
 * 1. 新连接：表单填写 → 登录
 * 2. 已有账号：列表点选 → 快速登录
 */
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { User, Connection, Plus, Delete, Download } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { login as apiLogin } from '@/api/nameson'
import type { StoredAccount } from '@/utils/db'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'logged-in': []
}>()

const auth = useAuthStore()

// ---- 表单 ----
const activeTab = ref<'new' | 'saved'>('saved')

const form = reactive({
  name: '',
  serverUrl: '',
  user: '',
  password: '',
})

const connecting = ref(false)

// ---- 生命周期 ----
onMounted(() => {
  auth.loadAccounts()
})

// ---- 动作 ----

async function handleLogin() {
  if (!form.serverUrl.trim() || !form.user.trim() || !form.name.trim()) {
    ElMessage.warning('请填写连接名、服务器地址和用户名')
    return
  }
  connecting.value = true
  try {
    const ok = await auth.doLogin(
      form.name.trim(),
      form.serverUrl.trim(),
      form.user.trim(),
      form.password,
    )
    if (ok) {
      emit('logged-in')
      emit('update:visible', false)
    }
  } finally {
    connecting.value = false
  }
}

async function handleSelectAccount(account: StoredAccount) {
  connecting.value = true
  try {
    const ok = await auth.loginFromAccount(account)
    if (ok) {
      emit('logged-in')
      emit('update:visible', false)
    }
  } finally {
    connecting.value = false
  }
}

async function handleDeleteAccount(account: StoredAccount) {
  try {
    await ElMessageBox.confirm(
      `确定删除连接「${account.name}」吗？`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
    await auth.removeAccount(account.name)
    ElMessage.success('已删除')
  } catch {
    // cancelled
  }
}

function handleExport() {
  const json = auth.exportAccounts()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'ns-sql-accounts.json'
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('已导出账号清单')
}

function handleReconnect(account: StoredAccount) {
  handleSelectAccount(account)
}

function handleClose() {
  emit('update:visible', false)
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    width="480px"
    class="login-dialog"
    @update:model-value="handleClose"
  >
    <template #header>
      <div class="dialog-title">
        <el-icon :size="18"><Connection /></el-icon>
        <span>NS SQL Editor — 连接管理</span>
      </div>
    </template>

    <el-tabs v-model="activeTab" class="login-tabs">
      <!-- ===== 已保存连接 ===== -->
      <el-tab-pane label="已保存连接" name="saved">
        <div v-if="auth.accounts.length === 0" class="empty-hint">
          <p>暂无保存的连接</p>
          <el-button type="primary" size="small" @click="activeTab = 'new'">
            <el-icon><Plus /></el-icon>新建连接
          </el-button>
        </div>

        <div v-else class="account-list">
          <div
            v-for="acc in auth.accounts"
            :key="acc.name"
            class="account-item"
            @click="handleSelectAccount(acc)"
          >
            <div class="account-info">
              <div class="account-name">{{ acc.name }}</div>
              <div class="account-meta">
                {{ acc.user }}@{{ acc.serverUrl }}
              </div>
              <div class="account-time">
                {{ new Date(acc.lastLoginAt).toLocaleString() }}
              </div>
            </div>
            <div class="account-actions" @click.stop>
              <el-button text size="small" type="primary" :icon="Connection" @click="handleReconnect(acc)">
                重连
              </el-button>
              <el-button text size="small" type="danger" :icon="Delete" @click="handleDeleteAccount(acc)">
                删除
              </el-button>
            </div>
          </div>
        </div>

        <div v-if="auth.accounts.length > 0" class="tab-footer">
          <el-button size="small" @click="activeTab = 'new'">
            <el-icon><Plus /></el-icon>新建连接
          </el-button>
          <el-button size="small" @click="handleExport">
            <el-icon><Download /></el-icon>导出清单
          </el-button>
        </div>
      </el-tab-pane>

      <!-- ===== 新建连接 ===== -->
      <el-tab-pane label="新建连接" name="new">
        <el-form label-position="top" size="default" class="login-form">
          <el-form-item label="连接名">
            <el-input v-model="form.name" placeholder="例如：生产环境-主库" />
          </el-form-item>
          <el-form-item label="服务器地址">
            <el-input v-model="form.serverUrl" placeholder="http://xx.xx.xx.xx:9001/xxxxx.asmx" />
          </el-form-item>
          <el-form-item label="账号">
            <el-input v-model="form.user" placeholder="用户名" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="form.password" type="password" placeholder="密码" show-password />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="connecting" style="width:100%" @click="handleLogin">
              <el-icon><User /></el-icon>连接
            </el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<style scoped>
.login-dialog :deep(.el-dialog__header) {
  padding: 16px 20px 0;
  margin: 0;
}

.login-dialog :deep(.el-dialog__body) {
  padding: 0 20px 20px;
}

.dialog-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
}

.login-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}

.empty-hint {
  text-align: center;
  padding: 32px 0;
  color: var(--ns-text-muted);
}

.empty-hint p {
  margin-bottom: 12px;
}

.account-list {
  max-height: 300px;
  overflow-y: auto;
}

.account-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  margin-bottom: 4px;
}

.account-item:hover {
  background: var(--ns-bg-400);
}

.account-info {
  flex: 1;
  min-width: 0;
}

.account-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--ns-text-primary);
  margin-bottom: 2px;
}

.account-meta {
  font-size: 11px;
  color: var(--ns-text-secondary);
  font-family: var(--ns-font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-time {
  font-size: 10px;
  color: var(--ns-text-muted);
  margin-top: 2px;
}

.account-actions {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
  margin-left: 8px;
}

.tab-footer {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--ns-border);
}

.login-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.login-form :deep(.el-form-item__label) {
  padding-bottom: 2px;
  font-size: 12px;
  color: var(--ns-text-secondary);
}
</style>
