/**
 * IndexedDB 操作封装 — 基于 localforage
 *
 * 两个 store：
 * - accounts: 缓存登录账号列表
 * - drafts:   SQL 草稿存储
 */

import localforage from 'localforage'

export interface StoredAccount {
  /** 连接名（用户取的别名） */
  name: string
  /** 服务器地址 */
  serverUrl: string
  /** 用户名 */
  user: string
  /** 密码 */
  password: string
  /** 最近一次 sessionID */
  sessionId: number | null
  /** 最近登录时间 */
  lastLoginAt: number
  /** 创建时间 */
  createdAt: number
}

export interface DraftRecord {
  key: string
  /** 所属连接名，用于隔离不同连接的草稿 */
  connectionName: string
  objectId: string
  tabseq: number
  sql: string
  sortby: string
  dsname: string
  savedAt: number
}

// ---- accounts store ----
const accountsStore = localforage.createInstance({ name: 'ns-sql-editor', storeName: 'accounts' })
const draftsStore = localforage.createInstance({ name: 'ns-sql-editor', storeName: 'drafts' })

// ===== Accounts =====

export async function getAllAccounts(): Promise<StoredAccount[]> {
  const result: StoredAccount[] = []
  await accountsStore.iterate<StoredAccount, void>((value) => {
    result.push(value)
  })
  result.sort((a, b) => b.lastLoginAt - a.lastLoginAt)
  return result
}

export async function saveAccount(account: StoredAccount): Promise<void> {
  account.updatedAt = Date.now()
  await accountsStore.setItem(account.name, account)
}

export async function deleteAccount(name: string): Promise<void> {
  await accountsStore.removeItem(name)
}

export async function updateSession(name: string, sessionId: number): Promise<void> {
  const account = await accountsStore.getItem<StoredAccount>(name)
  if (account) {
    account.sessionId = sessionId
    account.lastLoginAt = Date.now()
    await accountsStore.setItem(name, account)
  }
}

// ===== Drafts =====

/** 生成草稿 key：draft_{连接名}_{OBJECTID}_{TABSEQ} */
export function draftKey(connectionName: string, objectId: string, tabseq: number): string {
  return `draft_${connectionName}_${objectId}_${tabseq}`
}

export async function getDraft(key: string): Promise<DraftRecord | null> {
  return draftsStore.getItem<DraftRecord>(key)
}

export async function saveDraft(record: DraftRecord): Promise<void> {
  await draftsStore.setItem(record.key, record)
}

export async function deleteDraft(key: string): Promise<void> {
  await draftsStore.removeItem(key)
}

/** 获取当前连接的所有草稿，按保存时间倒序 */
export async function getAllDrafts(connectionName: string): Promise<DraftRecord[]> {
  const prefix = `draft_${connectionName}_`
  const result: DraftRecord[] = []
  await draftsStore.iterate<DraftRecord, void>((value, key) => {
    if (key.startsWith(prefix)) {
      result.push(value)
    }
  })
  result.sort((a, b) => b.savedAt - a.savedAt)
  return result
}
