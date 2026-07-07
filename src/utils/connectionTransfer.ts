/**
 * connectionTransfer — 连接配置的导入/导出纯逻辑模块
 *
 * 设计原则：本模块不依赖 Pinia / Vue / UI，只做"数据 ↔ 文本"的
 * 序列化、解析与导入判定。持久化与交互由消费者（auth store / 组件）负责。
 *
 * 导出文本格式（含明文密码，见需求决策 D2）：
 *   [{ "name": "...", "serverUrl": "...", "user": "...", "password": "..." }]
 * 同时兼容单条对象与数组两种形态。
 */

import type { StoredAccount } from './db'

/** 导出/导入的中间结构（刻意排除 sessionId / 时间戳等运行时字段） */
export interface ConnectionExport {
  name: string
  serverUrl: string
  user: string
  password: string
}

export interface ParseResult {
  ok: boolean
  items: ConnectionExport[]
  error?: string
}

export interface ResolveResult {
  /** 去重后、可直接 saveAccount 的账号列表 */
  toImport: StoredAccount[]
  /** 因名称重复被跳过的条数 */
  skipped: number
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * 将连接列表序列化为可读 JSON 文本（含明文密码）。
 */
export function serializeConnections(list: StoredAccount[]): string {
  const arr: ConnectionExport[] = list.map((a) => ({
    name: a.name,
    serverUrl: a.serverUrl,
    user: a.user,
    password: a.password,
  }))
  return JSON.stringify(arr, null, 2)
}

/**
 * 解析粘贴的配置文本，兼容单条对象与对象数组。
 * 仅校验必填项 name / serverUrl（非空字符串），缺失的 user/password 置空。
 */
export function parseConnections(text: string): ParseResult {
  const trimmed = text.trim()
  if (!trimmed) {
    return { ok: false, items: [], error: '内容为空' }
  }

  let data: unknown
  try {
    data = JSON.parse(trimmed)
  } catch {
    return { ok: false, items: [], error: 'JSON 解析失败，请检查格式' }
  }

  const arr = Array.isArray(data) ? data : [data]
  const items: ConnectionExport[] = []

  for (const it of arr) {
    if (!it || typeof it !== 'object') continue
    const o = it as Record<string, unknown>
    const name = asString(o.name).trim()
    const serverUrl = asString(o.serverUrl).trim()
    if (!name || !serverUrl) continue
    items.push({
      name,
      serverUrl,
      user: asString(o.user),
      password: asString(o.password),
    })
  }

  if (items.length === 0) {
    return {
      ok: false,
      items: [],
      error: '未发现有效的连接配置（每条需含 name 与 serverUrl）',
    }
  }
  return { ok: true, items }
}

/**
 * 根据现有连接名剔除重名，生成待保存的 StoredAccount 列表。
 * 导入不携带会话信息，sessionId 置空，由接收方手动连接。
 */
export function resolveImportItems(
  items: ConnectionExport[],
  existingNames: string[],
): ResolveResult {
  const existing = new Set(existingNames)
  const toImport: StoredAccount[] = []
  let skipped = 0
  const now = Date.now()

  for (const it of items) {
    if (existing.has(it.name)) {
      skipped++
      continue
    }
    toImport.push({
      name: it.name,
      serverUrl: it.serverUrl,
      user: it.user,
      password: it.password,
      sessionId: null,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    })
  }

  return { toImport, skipped }
}
