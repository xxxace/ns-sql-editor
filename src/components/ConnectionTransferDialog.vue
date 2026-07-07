<script setup lang="ts">
/**
 * ConnectionTransferDialog — 连接配置 复制 / 粘贴导入 共享弹窗
 *
 * 职责单一：
 * - export 模式：展示序列化文本（只读、自动全选），[复制到剪贴板] 自己完成（属 UI 行为）
 * - import 模式：提供可编辑文本框，[导入] 仅把原始文本 emit 给消费者，由消费者解析/落库/反馈
 *
 * 不依赖 auth store，不调用任何网络/持久化逻辑。
 */
import { ref, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { DocumentCopy, Upload } from '@element-plus/icons-vue'
import { copyToClipboard } from '@/utils/clipboard'

const props = defineProps<{
  visible: boolean
  /** 'export' = 复制；'import' = 粘贴导入 */
  mode: 'export' | 'import'
  /** export 模式的预填充文本 */
  text?: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  /** import 模式：把文本框内容交给消费者处理 */
  import: [text: string]
}>()

const localText = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

watch(
  () => props.visible,
  async (v) => {
    if (!v) return
    if (props.mode === 'export') {
      localText.value = props.text ?? ''
      await nextTick()
      const el = textareaRef.value
      if (el) {
        el.focus()
        el.select()
      }
    } else {
      localText.value = ''
    }
  },
)

async function handleCopy() {
  const ok = await copyToClipboard(localText.value)
  if (ok) ElMessage.success('已复制到剪贴板，可分享给同事')
  else ElMessage.error('复制失败，请手动选择文本复制（Ctrl+C）')
}

function handleImport() {
  if (!localText.value.trim()) {
    ElMessage.warning('请先粘贴连接配置')
    return
  }
  emit('import', localText.value)
}

function handleClose() {
  emit('update:visible', false)
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="mode === 'export' ? '复制连接配置' : '粘贴导入连接'"
    width="520px"
    @update:model-value="handleClose"
  >
    <div class="transfer-body">
      <p v-if="mode === 'export'" class="hint">
        ⚠ 配置含明文密码，请仅通过可信渠道分享，复制后及时清空剪贴板。
      </p>
      <p v-else class="hint">
        粘贴连接配置 JSON（支持单条对象或数组），然后点击「导入」。
      </p>
      <textarea
        ref="textareaRef"
        v-model="localText"
        class="transfer-textarea"
        :readonly="mode === 'export'"
        spellcheck="false"
        placeholder='[{"name":"连接名","serverUrl":"http://host:port/xxx.asmx","user":"admin","password":"..."}]'
      />
    </div>

    <template #footer>
      <el-button @click="handleClose">关闭</el-button>
      <el-button
        v-if="mode === 'export'"
        type="primary"
        :icon="DocumentCopy"
        @click="handleCopy"
      >
        复制到剪贴板
      </el-button>
      <el-button v-else type="primary" :icon="Upload" @click="handleImport">
        导入
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.transfer-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hint {
  margin: 0;
  font-size: 12px;
  color: var(--ns-text-muted);
  line-height: 1.5;
}

.transfer-textarea {
  width: 100%;
  min-height: 200px;
  max-height: 360px;
  resize: vertical;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--ns-border);
  background: var(--ns-bg-500);
  color: var(--ns-text-primary);
  font-family: var(--ns-font-mono);
  font-size: 12px;
  line-height: 1.6;
  outline: none;
}

.transfer-textarea:focus {
  border-color: var(--ns-accent);
}

.transfer-textarea[readonly] {
  cursor: text;
}
</style>
