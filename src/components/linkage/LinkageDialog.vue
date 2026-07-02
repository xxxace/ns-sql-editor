<script setup lang="ts">
/**
 * LinkageDialog — Feature B: 联动对比弹窗容器
 *
 * El-Dialog (fullscreen) 包裹 LinkageCore。
 * 关闭弹窗时清空 linkageStore。
 */
import { User } from "@element-plus/icons-vue";
import { useAuthStore } from "@/stores/auth";
import { useLinkageStore } from "@/stores/linkage";
import LinkageCore from "./LinkageCore.vue";

const linkage = useLinkageStore();
const auth = useAuthStore();

function handleClose() {
  linkage.closeDialog();
}
</script>

<template>
  <el-dialog
    :model-value="linkage.dialogVisible"
    fullscreen
    :close-on-click-modal="false"
    :close-on-press-escape="!linkage.syncing"
    destroy-on-close
    class="linkage-dialog"
    @close="handleClose"
  >
    <template #title>
      <div class="dialog-title-row">
        <span class="dialog-title-text">跨服务对比</span>
        <el-tag
          v-if="auth.currentName"
          type="info"
          size="small"
          effect="plain"
          class="main-session-tag"
        >
          <el-icon><User /></el-icon>
          {{ auth.currentName }} ({{ auth.currentUser }}@{{ auth.serverUrl }})
        </el-tag>
      </div>
    </template>

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

.dialog-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.dialog-title-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--ns-text);
}

.main-session-tag {
  font-size: 11px;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.main-session-tag :deep(.el-icon) {
  margin-right: 4px;
  vertical-align: middle;
}
</style>
