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
  type StoredAccount,
} from '@/utils/db'
import { parseConnections, resolveImportItems } from '@/utils/connectionTransfer'
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
        updatedAt: Date.now(),
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

  /**
   * 编辑已有连接 — 仅落库并同步会话状态，不自动重连（需求决策）。
   *
   * 规则：
   * - password 为 undefined → 保留原密码；为字符串 → 直接覆盖（空串 = 清空密码）
   * - 改名 = 删旧建新（先存新 key 成功后再删旧 key，防止中途失败丢数据）
   * - 改名撞名（目标连接名已存在）→ 拒绝，防止覆盖他人连接
   * - 编辑的是当前连接且 serverUrl / user 变更 → 旧 session 必然失效，登出并提示重连；
   *   仅改连接名/密码 → 同步当前会话状态，session 保留
   *
   * @returns sessionInvalidated=true 表示当前会话已失效，调用方应提示用户重新连接
   */
  async function updateAccount(
    oldName: string,
    patch: { name: string; serverUrl: string; user: string; password?: string },
  ): Promise<{ ok: boolean; error?: string; sessionInvalidated?: boolean }> {
    const old = accounts.value.find((a) => a.name === oldName)
    if (!old) return { ok: false, error: `未找到连接: ${oldName}` }

    const newName = patch.name.trim()
    const newUrl = patch.serverUrl.trim()
    const newUser = patch.user.trim()
    if (!newName || !newUrl || !newUser) {
      return { ok: false, error: '连接名、服务器地址和用户名不能为空' }
    }
    if (newName !== oldName && accounts.value.some((a) => a.name === newName)) {
      return { ok: false, error: `连接名「${newName}」已存在` }
    }

    const merged: StoredAccount = {
      ...old,
      name: newName,
      serverUrl: newUrl,
      user: newUser,
      ...(patch.password !== undefined ? { password: patch.password } : {}),
      updatedAt: Date.now(),
    }

    // 先存新 key（改名场景），成功后再删旧 key
    await saveAccount(merged)
    if (newName !== oldName) {
      await deleteAccount(oldName)
    }
    await loadAccounts()

    // 当前连接同步
    let sessionInvalidated = false
    if (currentName.value === oldName) {
      if (newUrl !== old.serverUrl || newUser !== old.user) {
        // 服务器地址或账号变更 → 旧 session 必然失效
        sessionInvalidated = true
        logout()
      } else {
        currentName.value = newName
        currentUser.value = newUser
        serverUrl.value = newUrl
      }
    }
    return { ok: true, sessionInvalidated }
  }

  /** 登出（清会话） */
  function logout() {
    currentName.value = ''
    currentUser.value = ''
    serverUrl.value = ''
    sessionId.value = null
    isLoggedIn.value = false
  }

  /**
   * 静默登录 — Feature B 目标会话刷新
   *
   * 用目标账号凭据重新登录，返回新 sessionId。
   * **不更新 authStore 状态**（不切换当前主会话）。
   *
   * @returns { sessionId, sessionErr } — sessionErr 非空表示登录失败
   */
  async function silentLogin(name: string): Promise<{ sessionId: number | null; sessionErr?: string }> {
    const account = accounts.value.find((a) => a.name === name)
    if (!account) {
      return { sessionId: null, sessionErr: `未找到账号: ${name}` }
    }
    try {
      const result = await apiLogin(account.serverUrl, account.user, account.password)
      if (result.statusCode !== '1') {
        return { sessionId: null, sessionErr: result.message || '静默登录失败' }
      }
      const sid = result.data
      // 更新 IndexedDB 中该账号的 sessionId，不影响 authStore 状态
      await saveAccount({ ...account, sessionId: sid, lastLoginAt: Date.now(), updatedAt: Date.now() })
      await loadAccounts()
      return { sessionId: sid }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '网络错误'
      return { sessionId: null, sessionErr: `静默登录失败: ${msg}` }
    }
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

  /**
   * 导入连接配置文本（来自粘贴）。
   *
   * 编排逻辑：解析（模块）→ 去重（模块）→ 逐条落库 → 刷新内存。
   * 仅入列、不自动连接、重名跳过（需求决策 D4）。
   */
  async function importConnections(
    text: string,
  ): Promise<{ imported: number; skipped: number; error?: string }> {
    const parsed = parseConnections(text)
    if (!parsed.ok) {
      return { imported: 0, skipped: 0, error: parsed.error }
    }
    const latest = await getAllAccounts()
    const { toImport, skipped } = resolveImportItems(
      parsed.items,
      latest.map((a) => a.name),
    )
    for (const acc of toImport) {
      await saveAccount(acc)
    }
    await loadAccounts()
    return { imported: toImport.length, skipped }
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
    silentLogin,
    removeAccount,
    updateAccount,
    logout,
    exportAccounts,
    importConnections,
  }
})
