<script setup lang="ts">
/**
 * MenuTree — 左侧菜单树
 *
 * 加载菜单：SELECT OBJECTID,ENAME,CNAME FROM PRJOBJECT WHERE MAPTYPE='VUE' ORDER BY OBJECTID DESC
 */
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { RefreshRight, Fold } from '@element-plus/icons-vue'
import { searchData } from '@/api/nameson'
import { useAuthStore } from '@/stores/auth'
import { useEditorStore, type MenuNode } from '@/stores/editor'

const auth = useAuthStore()
const editor = useEditorStore()

const loading = ref(false)

const MENU_SQL = "SELECT OBJECTID,ENAME,CNAME FROM PRJOBJECT WHERE MAPTYPE = 'VUE' ORDER BY OBJECTID DESC"

async function loadMenu() {
  if (!auth.isLoggedIn) return
  loading.value = true
  try {
    const res = await searchData(auth.serverUrl, MENU_SQL)
    if (res.statusCode === '1' && Array.isArray(res.data)) {
      const nodes: MenuNode[] = res.data.map((row: Record<string, unknown>) => ({
        objectId: String(row.OBJECTID ?? ''),
        ename: String(row.ENAME ?? ''),
        cname: String(row.CNAME ?? ''),
      }))
      editor.setMenuNodes(nodes)
    } else {
      ElMessage.error(res.message || '加载菜单失败')
    }
  } catch (e: unknown) {
    ElMessage.error('加载菜单网络错误')
  } finally {
    loading.value = false
  }
}

function handleSelect(node: MenuNode) {
  editor.selectMenu(node)
}

// 登录后自动加载
watch(() => auth.isLoggedIn, (val) => {
  if (val) loadMenu()
}, { immediate: true })
</script>

<template>
  <div class="menu-tree flex-col">
    <div class="panel-header">
      <span>菜单</span>
      <el-button text size="small" :icon="RefreshRight" :loading="loading" @click="loadMenu" />
    </div>
    <div class="panel-body">
      <div
        v-for="node in editor.menuNodes"
        :key="node.objectId"
        class="menu-item"
        :class="{ active: editor.selectedMenu?.objectId === node.objectId }"
        @click="handleSelect(node)"
      >
        <span class="menu-item-cname">{{ node.cname }}</span>
        <span class="menu-item-ename">{{ node.ename }}</span>
      </div>
      <div v-if="editor.menuNodes.length === 0 && !loading" class="empty-text">
        点击刷新加载菜单
      </div>
    </div>
  </div>
</template>

<style scoped>
.menu-tree {
  width: 180px;
  min-width: 140px;
  border-right: 1px solid var(--ns-border);
  height: 100%;
}

.menu-item {
  padding: 7px 10px;
  cursor: pointer;
  transition: background 0.1s;
  border-left: 2px solid transparent;
}

.menu-item:hover {
  background: var(--ns-bg-400);
}

.menu-item.active {
  background: var(--ns-bg-400);
  border-left-color: var(--ns-accent);
}

.menu-item-cname {
  display: block;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}

.menu-item-ename {
  display: block;
  font-size: 10px;
  color: var(--ns-text-muted);
  font-family: var(--ns-font-mono);
  margin-top: 1px;
}

.empty-text {
  padding: 20px 10px;
  font-size: 12px;
  color: var(--ns-text-muted);
  text-align: center;
}
</style>
