<script setup lang="ts">
/**
 * NewStatementDialog — 新增语句弹窗（Feature A）
 *
 * 用户填写 DSNAME → 创建占位语句 → 切换到新语句编辑
 * 创建的是占位语句：DBQUERY 留空，用户创建后在编辑器中编写。
 */
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useEditorStore } from '@/stores/editor'
import { createStatement } from '@/api/statement'

const emit = defineEmits<{
  'created': [tabseq: number]
  'cancel': []
}>()

const auth = useAuthStore()
const editor = useEditorStore()

const visible = ref(false)
const dsname = ref('')
const creating = ref(false)
const dsnameError = ref('')

const objectId = computed(() => editor.currentObjectId)
const selectedMenuName = computed(() => editor.selectedMenu?.cname ?? editor.selectedMenu?.ename ?? '')
// 页面级基础资料：用于空清单场景下填补首条语句的 TABNAME，
// 避免新增依赖「已有语句行」而失败。
const menuName = computed(() => editor.selectedMenu?.cname || editor.selectedMenu?.ename || '')

// 下一条语句序号：本地推算，不查服务端。
// 空清单 → 1；否则取已加载清单中最大 TABSEQ + 1。
const nextSeq = computed(() => {
  const seqs = editor.statements.map((s) => s.tabseq)
  return seqs.length ? Math.max(...seqs) + 1 : 1
})

function open() {
  dsname.value = ''
  dsnameError.value = ''
  visible.value = true
}

function close() {
  visible.value = false
  emit('cancel')
}

function validateDsname(): boolean {
  const val = dsname.value.trim()
  if (!val) {
    dsnameError.value = 'DSNAME 不能为空'
    return false
  }
  // 检查是否与已有语句重名
  const exists = editor.statements.some(
    (s) => s.dsname.toLowerCase() === val.toLowerCase(),
  )
  if (exists) {
    dsnameError.value = `DSNAME "${val}" 已存在，请使用其他名称`
    return false
  }
  dsnameError.value = ''
  return true
}

async function handleCreate() {
  if (!validateDsname()) return
  if (!objectId.value) {
    ElMessage.error('请先在左侧菜单选择一个页面')
    return
  }

  creating.value = true
  try {
    const newTabseq = await createStatement(
      auth.serverUrl,
      objectId.value,
      dsname.value.trim(),
      auth.currentUser,
      nextSeq.value,
      menuName.value ? { TABNAME: menuName.value } : undefined,
    )
    // 关闭弹窗
    visible.value = false
    emit('created', newTabseq)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '创建失败'
    ElMessage.error(msg)
  } finally {
    creating.value = false
  }
}

defineExpose({ open, close })
</script>

<template>
  <el-dialog
    v-model="visible"
    title="新增语句"
    width="420px"
    :close-on-click-modal="false"
    :close-on-press-escape="!creating"
    destroy-on-close
  >
    <el-form label-position="top" @submit.prevent="handleCreate">
      <!-- 所属页面（只读） -->
      <el-form-item label="所属页面">
        <el-input
          :model-value="selectedMenuName"
          disabled
          placeholder="无（请先在左侧菜单选择页面）"
        />
      </el-form-item>

      <!-- DSNAME（必填） -->
      <el-form-item
        label="语句名称 (DSNAME)"
        :error="dsnameError"
        required
      >
        <el-input
          v-model="dsname"
          placeholder="请输入语句名称，如：PSTASKJOBS_Q01"
          maxlength="100"
          show-word-limit
          :disabled="creating"
          @input="dsnameError = ''"
        />
      </el-form-item>

      <p class="form-hint">
        创建后将自动切换到该语句，你可以在编辑器中编写 SQL 内容后再保存。
      </p>
    </el-form>

    <template #footer>
      <el-button :disabled="creating" @click="close">取消</el-button>
      <el-button type="primary" :loading="creating" @click="handleCreate">
        创建
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form-hint {
  font-size: 12px;
  color: var(--ns-text-muted);
  margin: 0;
  line-height: 1.5;
}
</style>
