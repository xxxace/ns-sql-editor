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
import { User, Connection, Plus, Delete, Download, Loading } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import type { StoredAccount } from '@/utils/db'

const props = defineProps<{
  visible: boolean
  /** 是否允许关闭弹窗。首次登录=false（强制登录），切换连接=true */
  closable?: boolean
  /** 默认激活的 tab */
  defaultTab?: 'saved' | 'new'
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'logged-in': []
}>()

const auth = useAuthStore()

// ---- 表单 ----
const activeTab = ref<'new' | 'saved'>(props.defaultTab ?? 'saved')

const form = reactive({
  name: '',
  serverUrl: '',
  user: '',
  password: '',
})

const connectingAccount = ref<string | null>(null)
const connectingNew = ref(false)

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
  connectingNew.value = true
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
    connectingNew.value = false
  }
}

async function handleSelectAccount(account: StoredAccount) {
  if (connectingAccount.value) return
  connectingAccount.value = account.name
  try {
    const ok = await auth.loginFromAccount(account)
    if (ok) {
      emit('logged-in')
      emit('update:visible', false)
    }
  } finally {
    connectingAccount.value = null
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
    :show-close="closable"
    :close-on-click-modal="closable"
    :close-on-press-escape="closable"
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
      <el-tab-pane label="已保存连接" name="saved" :disabled="connectingAccount !== null || connectingNew">
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
            :class="{ 'is-connecting': connectingAccount === acc.name, 'is-disabled': connectingAccount !== null && connectingAccount !== acc.name }"
            @click="connectingAccount === null && handleSelectAccount(acc)"
          >
            <div class="account-info">
              <div class="account-name">
                {{ acc.name }}
                <el-icon v-if="connectingAccount === acc.name" class="is-loading" size="14">
                  <Loading />
                </el-icon>
              </div>
              <div class="account-meta">
                {{ acc.user }}@{{ acc.serverUrl }}
              </div>
              <div class="account-time">
                {{ new Date(acc.lastLoginAt).toLocaleString() }}
              </div>
            </div>
            <div class="account-actions" @click.stop>
              <el-button
                text
                size="small"
                type="primary"
                :icon="Connection"
                :loading="connectingAccount === acc.name"
                :disabled="connectingAccount !== null && connectingAccount !== acc.name"
                @click="handleReconnect(acc)"
              >
                {{ connectingAccount === acc.name ? '连接中' : '重连' }}
              </el-button>
              <el-button
                text
                size="small"
                type="danger"
                :icon="Delete"
                :disabled="connectingAccount !== null"
                @click="handleDeleteAccount(acc)"
              >
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
      <el-tab-pane label="新建连接" name="new" :disabled="connectingAccount !== null || connectingNew">
        <el-form label-position="top" size="default" class="login-form" :disabled="connectingNew">
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
            <el-button type="primary" :loading="connectingNew" :disabled="connectingAccount !== null" style="width:100%" @click="handleLogin">
              <el-icon><User /></el-icon>连接
            </el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>

    <!-- 连接中遮罩 -->
    <div v-if="connectingAccount !== null || connectingNew" class="login-mask">
      <div class="login-mask-content">
        <el-icon class="is-loading" :size="28"><Loading /></el-icon>
        <span>{{ connectingAccount ?? '正在连接...' }}</span>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.login-dialog :deep(.el-dialog__header) {
  padding: 16px 20px 0;
  margin: 0;
}

.login-dialog :deep(.el-dialog__body) {
  position: relative;
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

.account-item.is-connecting {
  background: var(--ns-bg-400);
  cursor: wait;
}

.account-item.is-connecting .account-name {
  color: var(--el-color-primary);
}

.account-item.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.account-item.is-disabled:hover {
  background: transparent;
}

.account-name .is-loading {
  margin-left: 6px;
  vertical-align: middle;
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
  font-size: 11px;
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

.login-mask {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ns-bg-500);
  border-radius: 8px;
  pointer-events: auto;
}

.login-mask-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--el-color-primary);
  font-size: 14px;
  font-weight: 500;
}

.login-mask-content .is-loading {
  animation: rotating 1.2s linear infinite;
}

@keyframes rotating {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
