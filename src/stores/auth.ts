/**
 * Auth Store — 账号管理 + 当前会话
 *
 * 所有连接信息缓存在 IndexedDB，切换连接需重新登录刷新 session。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as apiLogin } from '@/api/nameson'
import {
  getAllAccounts,
  saveAccount,
  deleteAccount,
  updateSession,
  type StoredAccount,
} from '@/utils/db'
import { ElMessage } from 'element-plus'

export const useAuthStore = defineStore('auth', () => {
  // ===== 状态 =====
  const accounts = ref<StoredAccount[]>([])
  const accountsLoaded = ref(false)

  const currentName = ref('')
  const currentUser = ref('')
  const serverUrl = ref('')
  const sessionId = ref<number | null>(null)
  const isLoggedIn = ref(false)

  // ===== 计算 =====
  const currentConnectionInfo = computed(() => {
    if (!isLoggedIn.value) return ''
    return `${currentName.value} | ${currentUser.value}@${serverUrl.value} | Session: ${sessionId.value}`
  })

  // ===== 动作 =====

  /** 加载账号列表 */
  async function loadAccounts() {
    accounts.value = await getAllAccounts()
    accountsLoaded.value = true
  }

  /** 登录 */
  async function doLogin(
    name: string,
    url: string,
    user: string,
    pwd: string,
  ): Promise<boolean> {
    try {
      const result = await apiLogin(url, user, pwd)
      if (result.statusCode !== '1') {
        ElMessage.error(result.message || '登录失败')
        return false
      }
      const sid = result.data
      // 更新内存
      currentName.value = name
      currentUser.value = user
      serverUrl.value = url
      sessionId.value = sid
      isLoggedIn.value = true
      // 持久化
      await saveAccount({
        name,
        serverUrl: url,
        user,
        password: pwd,
        sessionId: sid,
        lastLoginAt: Date.now(),
        createdAt: Date.now(),
      })
      await loadAccounts()
      ElMessage.success('连接成功')
      return true
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '网络错误'
      ElMessage.error(`登录失败: ${msg}`)
      return false
    }
  }

  /** 从已保存账号恢复登录 */
  async function loginFromAccount(account: StoredAccount): Promise<boolean> {
    return doLogin(account.name, account.serverUrl, account.user, account.password)
  }

  /** 重新连接（刷新 session） */
  async function reconnect(): Promise<boolean> {
    if (!currentName.value || !serverUrl.value) return false
    const account = accounts.value.find((a) => a.name === currentName.value)
    if (!account) return false
    return doLogin(currentName.value, serverUrl.value, account.user, account.password)
  }

  /** 删除账号 */
  async function removeAccount(name: string) {
    await deleteAccount(name)
    if (currentName.value === name) {
      currentName.value = ''
      currentUser.value = ''
      serverUrl.value = ''
      sessionId.value = null
      isLoggedIn.value = false
    }
    await loadAccounts()
  }

  /** 登出（清会话） */
  function logout() {
    currentName.value = ''
    currentUser.value = ''
    serverUrl.value = ''
    sessionId.value = null
    isLoggedIn.value = false
  }

  /** 导出账号清单 */
  function exportAccounts(): string {
    const data = accounts.value.map(({ name, serverUrl: u, user, lastLoginAt: l }) => ({
      name,
      serverUrl: u,
      user,
      lastLoginAt: new Date(l).toISOString(),
    }))
    return JSON.stringify(data, null, 2)
  }

  return {
    // 状态
    accounts,
    accountsLoaded,
    currentName,
    currentUser,
    serverUrl,
    sessionId,
    isLoggedIn,
    // 计算
    currentConnectionInfo,
    // 动作
    loadAccounts,
    doLogin,
    loginFromAccount,
    reconnect,
    removeAccount,
    logout,
    exportAccounts,
  }
})
