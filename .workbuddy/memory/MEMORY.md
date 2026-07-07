# ns-sql-editor 项目约定

## 架构分层原则（用户强约束）

- **纯逻辑必须独立成模块/目录，由消费者（store / 组件）调用，禁止全塞进 store 耦合**。
  - 例：连接导入/导出功能 → `src/utils/connectionTransfer.ts` 放序列化/解析/去重纯逻辑（无 Pinia/UI 依赖），`auth` store 只做编排（调模块 + 落库），UI 组件只做触发与展示。
  - 适用场景：任何新增功能，先把与框架无关的"计算/转换/校验"抽成独立 util/module。

## Monaco Editor 快捷键设计注意事项

- **避免 Ctrl+Shift+F**：Windows 中文输入法（微软拼音/搜狗等）在系统层（TSF）拦截此组合键用于简繁体切换，Monaco 收不到
- 格式化快捷键使用 `Shift+Alt+F`（VS Code 标准格式，无 IME 冲突）
- `editor.addAction({ keybindings, contextMenuGroupId, run })` 可以正常同时工作，无需分离

## Store → Editor 同步策略

- **加载/回滚**：用 `editor.setValue()` — 清空 undo 栈，新内容就是"最初数据"
- **格式化**：用 `editor.executeEdits()` — 进入 undo 栈，用户可撤销格式化
- 两种操作不能走同一条路径：watch `store.currentSql` 用 setValue，runFormat 绕过 watch 直接用 executeEdits + 再同步 store
