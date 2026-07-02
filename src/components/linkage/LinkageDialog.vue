<script setup lang="ts">
/**
 * LinkageDialog — Feature B: 联动对比弹窗容器
 *
 * El-Dialog (fullscreen) 包裹 LinkageCore。
 * 关闭弹窗时清空 linkageStore。
 */
import { useLinkageStore } from '@/stores/linkage'
import LinkageCore from './LinkageCore.vue'

const linkage = useLinkageStore()

function handleClose() {
  linkage.closeDialog()
}
</script>

<template>
  <el-dialog
    :model-value="linkage.dialogVisible"
    title="跨服务对比"
    fullscreen
    :close-on-click-modal="false"
    :close-on-press-escape="!linkage.syncing"
    destroy-on-close
    class="linkage-dialog"
    @close="handleClose"
  >
    <LinkageCore @close="handleClose" />

    <template #footer>
      <el-button @click="handleClose">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style>
.linkage-dialog {
  --el-dialog-padding-primary: 0;
}

.linkage-dialog .el-dialog__body {
  padding: 0 !important;
  height: calc(100vh - 94px);
  overflow: hidden;
}

.linkage-dialog .el-dialog__header {
  padding: 10px 16px;
  border-bottom: 1px solid var(--ns-border);
}

.linkage-dialog .el-dialog__footer {
  padding: 8px 16px;
  border-top: 1px solid var(--ns-border);
}
</style>
