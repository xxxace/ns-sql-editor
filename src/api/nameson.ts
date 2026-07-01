/**
 * NS SQL Editor — HTTP API 封装
 *
 * 所有接口自动从 authStore 注入 p_user / p_sessionID，
 * 调用方无需手动传递。
 */

import type { DataModelItem } from '@/utils/dataModel'
import { useAuthStore } from '@/stores/auth'

// ---- 类型 ----

export interface ApiResponse<T = unknown> {
  statusCode: string
  message: string
  data: T
  PsessionID: number
}

export interface LoginResult {
  statusCode: string
  message: string
  data: number // sessionID
  PsessionID: number
}

// ---- 内部工具 ----

function buildForm(params: Record<string, string>): string {
  return new URLSearchParams(params).toString()
}

function injectAuth(): { p_user: string; p_sessionID: string } {
  const auth = useAuthStore()
  return {
    p_user: auth.currentUser,
    p_sessionID: String(auth.sessionId),
  }
}

async function post(serverUrl: string, endpoint: string, params: Record<string, string>) {
  const authFields = await injectAuth()
  const url = `${serverUrl}${endpoint}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildForm({ ...params, ...authFields }),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${endpoint}`)
  }
  return res.json()
}

// ---- 公开 API ----

/** 登录（不需要 session，直连服务器） */
export async function login(serverUrl: string, user: string, pwd: string): Promise<LoginResult> {
  const url = `${serverUrl}/Logon_JS`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildForm({
      p_user: user,
      pPwd: pwd,
      pDBPwd: pwd,
      pPriv: 'true',
      pID: '1',
    }),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: Logon_JS`)
  }
  return res.json()
}

/**
 * 查询数据 — 自动注入 p_user / p_sessionID
 *
 * @param serverUrl - 服务器地址（从 authStore 获取）
 * @param sql - SELECT 语句
 * @param where  - WHERE 条件字符串，如 "OBJECTID='871002'"
 * @param sortby - ORDER BY 字段
 */
export async function searchData(
  serverUrl: string,
  sql: string,
  where = '',
  sortby = '',
): Promise<ApiResponse<Record<string, unknown>[]>> {
  const authFields = await injectAuth()
  const url = `${serverUrl}/SearchData`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildForm({
      p_Dbquery: sql,
      p_Where: where,
      p_sortby: sortby,
      ...authFields,
    }),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: SearchData`)
  }
  return res.json()
}

/**
 * 保存数据 — 自动注入 p_user / p_sessionID
 */
export async function saveData(
  serverUrl: string,
  dataModel: DataModelItem[],
): Promise<ApiResponse> {
  const authFields = await injectAuth()
  const url = `${serverUrl}/SaveDatas`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: buildForm({
      p_DataModel: JSON.stringify(dataModel),
      ...authFields,
    }),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: SaveDatas`)
  }
  return res.json()
}
