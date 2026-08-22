/**
 * Playground Store — SQL Playground 当前工作区状态
 *
 * 与 editor store 隔离：Playground 是独立工作区，内容跨视图切换保留
 * （EditorView 用 v-if 切换视图，组件销毁后内容仍存于此）。
 * 存档持久化走 utils/db.ts 的 playgrounds store，本 store 只做编排。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getAllPlaygrounds,
  savePlayground,
  deletePlayground,
  type PlaygroundRecord,
} from '@/utils/db'

/** 生成存档 id：时间戳 + 随机段（不依赖 crypto.randomUUID，兼容内网 http 非 secure context） */
function genPgId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export const usePlaygroundStore = defineStore('playground', () => {
  // ===== 当前工作区 =====
  /** 当前编辑器中的 SQL */
  const pgSql = ref('')
  /** 当前标题（存档名） */
  const pgTitle = ref('')
  /** 当前正在编辑的存档 id（null = 全新未存档） */
  const pgCurrentId = ref<string | null>(null)
  /** 最近一次保存/加载时的内容快照，用于判断未保存修改 */
  const pgSavedSql = ref('')

  /** 是否有未保存的修改 */
  const isPgModified = computed(() => pgSql.value !== pgSavedSql.value)

  /** 当前是否处于"编辑某个已存在存档"状态 */
  const hasPgCurrent = computed(() => pgCurrentId.value !== null)

  // ===== 存档列表 =====
  const records = ref<PlaygroundRecord[]>([])
  const recordsLoaded = ref(false)

  // ===== 动作 =====

  /** 加载存档列表（进入 Playground 或保存/删除后刷新） */
  async function loadRecords() {
    records.value = await getAllPlaygrounds()
    recordsLoaded.value = true
  }

  /** 新建：清空工作区（调用方需先确认未保存修改） */
  function newPg() {
    pgSql.value = ''
    pgTitle.value = ''
    pgCurrentId.value = null
    pgSavedSql.value = ''
  }

  /** 加载存档到工作区（调用方需先确认未保存修改） */
  function loadPg(record: PlaygroundRecord) {
    pgSql.value = record.sql
    pgTitle.value = record.title
    pgCurrentId.value = record.id
    pgSavedSql.value = record.sql
  }

  /**
   * 保存当前工作区。
   * @param title 存档标题（为空时调用方应先用 prompt 收集）
   * @returns 保存后的存档 id
   */
  async function savePg(title: string): Promise<string> {
    const id = pgCurrentId.value ?? genPgId()
    const record: PlaygroundRecord = {
      id,
      title: title.trim(),
      sql: pgSql.value,
      savedAt: Date.now(),
    }
    await savePlayground(record)
    pgCurrentId.value = id
    pgTitle.value = record.title
    pgSavedSql.value = record.sql
    await loadRecords()
    return id
  }

  /** 删除存档（调用方需确认） */
  async function removePg(id: string) {
    await deletePlayground(id)
    // 删除的是当前编辑中的存档 → 同步清工作区关联
    if (pgCurrentId.value === id) {
      pgCurrentId.value = null
      pgSavedSql.value = ''
    }
    await loadRecords()
  }

  /** 编辑器内容变化时同步（由 Monaco onChange 调用） */
  function updateSql(sql: string) {
    pgSql.value = sql
  }

  return {
    // 状态
    pgSql,
    pgTitle,
    pgCurrentId,
    pgSavedSql,
    records,
    recordsLoaded,
    // 计算
    isPgModified,
    hasPgCurrent,
    // 动作
    loadRecords,
    newPg,
    loadPg,
    savePg,
    removePg,
    updateSql,
  }
})
