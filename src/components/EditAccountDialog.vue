<script setup lang="ts">
/**
 * EditAccountDialog — 编辑已保存连接的表单弹窗
 *
 * 职责单一：展示表单、收集输入、emit 保存。不依赖 auth store、不落库。
 * 弹窗形态与 ConnectionTransferDialog 一致（点按钮弹出），内容复用「新建连接」四字段。
 *
 * 密码语义（需求决策）：
 * - 「保留原密码」默认勾选 → emit 的 patch 不含 password（父级保留原密码）
 * - 取消勾选后可输入新密码；输入留空 → patch.password = ''（清空密码）
 */
import { ref, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { EditPen } from '@element-plus/icons-vue'
import type { StoredAccount } from '@/utils/db'

const props = defineProps<{
  visible: boolean
  /** 要编辑的连接（打开时预填表单） */
  account: StoredAccount | null
  /** 保存进行中（父级控制，禁用按钮防连点） */
  saving?: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  /** 保存：password 为 undefined 表示保留原密码 */
  save: [patch: { name: string; serverUrl: string; user: string; password?: string }]
}>()

const form = reactive({
  name: '',
  serverUrl: '',
  user: '',
  password: '',
})

/** 保留原密码：默认勾选。取消勾选后密码框可编辑 */
const keepPassword = ref(true)

watch(
  () => [props.visible, props.account] as const,
  ([visible, account]) => {
    if (!visible || !account) return
    form.name = account.name
    form.serverUrl = account.serverUrl
    form.user = account.user
    form.password = ''
    keepPassword.value = true
  },
)

function handleSave() {
  if (!form.name.trim() || !form.serverUrl.trim() || !form.user.trim()) {
    ElMessage.warning('请填写连接名、服务器地址和用户名')
    return
  }
  const patch: { name: string; serverUrl: string; user: string; password?: string } = {
    name: form.name.trim(),
    serverUrl: form.serverUrl.trim(),
    user: form.user.trim(),
  }
  if (!keepPassword.value) {
    patch.password = form.password
  }
  emit('save', patch)
}

function handleClose() {
  if (props.saving) return
  emit('update:visible', false)
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="编辑连接"
    width="480px"
    :close-on-click-modal="false"
    @update:model-value="handleClose"
  >
    <el-form label-position="top" size="default" :disabled="saving">
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
        <el-checkbox v-model="keepPassword" class="keep-pwd">
          保留原密码
        </el-checkbox>
        <el-input
          v-if="!keepPassword"
          v-model="form.password"
          type="password"
          placeholder="输入新密码，留空则清空密码"
          show-password
        />
        <div v-else class="pwd-kept-hint">（已保存的密码不会被修改）</div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button :disabled="saving" @click="handleClose">取消</el-button>
      <el-button type="primary" :icon="EditPen" :loading="saving" @click="handleSave">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.keep-pwd {
  margin-bottom: 8px;
}

.pwd-kept-hint {
  font-size: 12px;
  color: var(--ns-text-muted);
  line-height: 32px;
}
</style>
