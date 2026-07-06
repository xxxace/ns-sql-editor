# ns-sql-editor 项目约定

## Monaco Editor 快捷键设计注意事项

- **避免 Ctrl+Shift+F**：Windows 中文输入法（微软拼音/搜狗等）在系统层（TSF）拦截此组合键用于简繁体切换，Monaco 收不到
- 格式化快捷键使用 `Shift+Alt+F`（VS Code 标准格式，无 IME 冲突）
- `editor.addAction({ keybindings, contextMenuGroupId, run })` 可以正常同时工作，无需分离

## Store → Editor 同步策略

- **加载/回滚**：用 `editor.setValue()` — 清空 undo 栈，新内容就是"最初数据"
- **格式化**：用 `editor.executeEdits()` — 进入 undo 栈，用户可撤销格式化
- 两种操作不能走同一条路径：watch `store.currentSql` 用 setValue，runFormat 绕过 watch 直接用 executeEdits + 再同步 store
