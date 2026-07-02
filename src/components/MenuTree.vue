<script setup lang="ts">
/**
 * MenuTree — 左侧菜单树
 *
 * 加载菜单：SELECT OBJECTID,ENAME,CNAME FROM PRJOBJECT WHERE MAPTYPE='VUE' ORDER BY OBJECTID DESC
 * 支持本地 CNAME/ENAME 模糊过滤
 */
import { ref, watch, computed } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { RefreshRight, Search } from "@element-plus/icons-vue";
import { searchData } from "@/api/nameson";
import { useAuthStore } from "@/stores/auth";
import { useEditorStore, type MenuNode } from "@/stores/editor";

const auth = useAuthStore();
const editor = useEditorStore();

const loading = ref(false);
const filterKeyword = ref("");

/** 本地模糊过滤：匹配 CNAME 或 ENAME */
const filteredNodes = computed(() => {
  const kw = filterKeyword.value.trim().toLowerCase();
  if (!kw) return editor.menuNodes;
  return editor.menuNodes.filter(
    (n) =>
      n.cname.toLowerCase().includes(kw) || n.ename.toLowerCase().includes(kw),
  );
});

const MENU_SQL =
  "SELECT OBJECTID,ENAME,CNAME FROM PRJOBJECT WHERE OBJTY = 'F' AND (MAPTYPE = 'VUE' OR EXISTS(SELECT 1 FROM PRJOBJDS WHERE OBJECTID = PRJOBJECT.OBJECTID)) ORDER BY OBJECTID DESC";

async function loadMenu() {
  if (!auth.isLoggedIn) return;
  loading.value = true;
  try {
    const res = await searchData(auth.serverUrl, MENU_SQL);
    if (res.statusCode === "1" && Array.isArray(res.data)) {
      const nodes: MenuNode[] = res.data.map(
        (row: Record<string, unknown>) => ({
          objectId: String(row.OBJECTID ?? ""),
          ename: String(row.ENAME ?? ""),
          cname: String(row.CNAME ?? ""),
        }),
      );
      editor.setMenuNodes(nodes);
    } else {
      ElMessage.error(res.message || "加载菜单失败");
    }
  } catch (e: unknown) {
    ElMessage.error("加载菜单网络错误");
  } finally {
    loading.value = false;
  }
}

async function handleSelect(node: MenuNode) {
  // loading 中禁止切换
  if (editor.isLoadingSql) return;
  // 已在当前菜单且无未保存修改 → 无需操作
  if (editor.selectedMenu?.objectId === node.objectId) return;
  // 有未保存修改时提醒用户
  if (editor.isModified) {
    try {
      await ElMessageBox.confirm(
        "当前语句有未保存的修改，切换将丢失这些变更。确定切换吗？",
        "未保存的修改",
        {
          confirmButtonText: "放弃并切换",
          cancelButtonText: "取消",
          type: "warning",
        },
      );
    } catch {
      return;
    }
  }
  editor.selectMenu(node);
}

// 登录后自动加载
watch(
  () => auth.isLoggedIn,
  (val) => {
    if (val) loadMenu();
  },
  { immediate: true },
);

// 切换会话时重新加载菜单
watch(
  () => auth.currentName,
  (newName, oldName) => {
    if (oldName && newName !== oldName) {
      editor.selectMenu(null)
      loadMenu()
    }
  },
);
</script>

<template>
  <div class="menu-tree flex-col">
    <div class="panel-header">
      <span>页面</span>
      <el-button
        text
        size="small"
        :icon="RefreshRight"
        :loading="loading"
        @click="loadMenu"
      />
    </div>
    <div class="filter-box" v-if="editor.menuNodes.length > 0">
      <el-input
        v-model="filterKeyword"
        size="small"
        placeholder="搜索 CNAME / ENAME"
        clearable
        :prefix-icon="Search"
      />
    </div>
    <div class="panel-body">
      <div
        v-for="node in filteredNodes"
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
      <div
        v-else-if="filterKeyword && filteredNodes.length === 0 && !loading"
        class="empty-text"
      >
        无匹配菜单
      </div>
    </div>
  </div>
</template>

<style scoped>
.menu-tree {
  width: 200px;
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
  font-size: 12px;
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

.filter-box {
  padding: 4px 10px;
  border-bottom: 1px solid var(--ns-border);
}
</style>
