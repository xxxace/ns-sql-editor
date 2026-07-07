# AGENTS.md — 开发协作者指南

> 本文件供 AI 协作者（WorkBuddy / 其他 agent）在本仓库工作时遵循；人类开发者也可参考。
> 核心原则：**先做能力盘点与复用，再写新代码**；复杂任务先评估级别，按对应策略执行。

---

## 一、角色与任务执行规则（CDD · Capability-Driven Development）

接收任何任务时，**先在后台默默做【任务分级评估】**，然后严格执行对应策略。无需每次向用户解释评估过程，直接输出结果即可。

### 1. T0 级（紧急 / 阻断性任务）
- **定义**：线上故障、P0 级事故、严重阻断性问题等需要立即响应的任务。
- **执行策略**：
  - 必须极速分析，精准定位问题并制定最快止损方案。
  - **跳过所有「能力盘点与复用」流程**，直接实施修复。效率与止损绝对优先。

### 2. 常规开发任务（非 T0、非轻量级）
- **定义**：具有一定复杂度的功能开发、需求实现、架构调整等。
- **执行策略**：动手写代码前，**强制执行【能力发现与复用流程】**：
  1. 盘点并优先复用已有的 Skill、Tool、Workflow、脚本或自动化方案（含本仓库已有模块）。
  2. 只有在明确确认现有能力存在缺口、且无替代方案时，才允许编写新代码。

### 3. 轻量级任务
- **定义**：逻辑简单、耗时极短的操作，无论是否依赖工具。
- **执行策略**：
  - 无工具依赖（如翻译、改写）→ 直接执行。
  - 有工具依赖（如调用已有 API、执行已有脚本）→ 确认工具可用后直接调用，不做盘点。
  - 若工具不存在或状态不确定 → 升级为常规任务，走盘点流程。

### 初始化指令
- 已理解上述分级机制。后续对话中，无论用户提出什么需求，先后台评估级别，再按对应策略执行，直接出结果，不重复解释评估过程。

---

## 二、项目概览（Orientation）

- **技术栈**：Vue 3（`script setup` SFC）+ TypeScript + Vite + Element Plus + Pinia + localforage（IndexedDB 持久化）+ Monaco Editor（`@nameson/sqlutils`、`sql-formatter` 等）。
- **常用脚本**：
  - `npm run dev` —— 启动开发服务器（Vite，注意：本地 `http://` 环境，`navigator.clipboard` 可能受限，相关功能需带 fallback）。
  - `npm run build` —— `vue-tsc -b && vite build`，**类型检查 + 构建** 是提交前的必过门槛。
  - `npm run preview` —— 预览构建产物。
- **目录结构（关键）**：
  - `src/stores/auth.ts` —— 认证 / 连接 store（Pinia），负责编排，不含纯逻辑。
  - `src/utils/db.ts` —— IndexedDB 读写（`saveAccount` / `getAllAccounts` / `deleteAccount` / `StoredAccount`）。
  - `src/utils/clipboard.ts` —— 剪贴板写入（带 HTTP fallback）。
  - `src/utils/connectionTransfer.ts` —— **连接导入/导出纯逻辑模块**（序列化 / 解析 / 冲突判定），不依赖 Pinia/UI。
  - `src/components/LoginDialog.vue` —— 登录 / 连接管理弹窗（消费者）。
  - `src/components/ConnectionTransferDialog.vue` —— 连接复制 / 粘贴导入共享弹窗（双模式）。
  - `src/api/nameson.ts` —— 底层 HTTP / API 层（勿在功能开发时随意改动）。

---

## 三、开发约定（已沉淀，需延续）

1. **解耦优先**：纯逻辑（序列化、解析、判定等）独立成 `utils/` 下的纯模块，store 只做"调模块 + 落库 + 刷新"的编排，UI 组件只做"捕获输入 / 展示"。避免把业务逻辑耦合进 store 或组件。
2. **复用现有能力**：新增功能前先查 `src/utils/`、现有 store 方法与组件，优先复用而非重写。
3. **连接管理功能**（导出复制 / 导入粘贴）：
   - 逻辑全在 `src/utils/connectionTransfer.ts`（`serializeConnections` / `parseConnections` / `resolveImportItems`）。
   - 落库走 `auth.importConnections`（编排），不直接在 UI 里写 DB。
   - 导出**含明文密码**，UI 内需带安全提示；导入仅入「已保存连接」列表、不自动连接、重名跳过。
   - 剪贴板复制用 `src/utils/clipboard.ts`，兼容本地 HTTP 环境。
4. **提交前**：务必 `npm run build` 通过类型检查与构建；第三方告警（如 `@vueuse/core` 注释告警）与本次改动无关可忽略，但不得引入新的类型错误。

---

## 四、给后续 agent 的提示

- 收到"加功能 / 改架构"类需求 → 先读 §一 定级 → 常规任务先查 `src/utils/`、`src/stores/` 复用 → 新逻辑优先放 `utils/` 纯模块。
- 涉及连接 / 登录 / 联动逻辑 → 先读 `src/stores/auth.ts`、`src/utils/db.ts`、`src/utils/connectionTransfer.ts`，理解现有契约再动手。
- 不确定用户意图时，先推断、再行动；确实需要信息时再提问（参照 SOUL 约束：resourceful before asking）。
