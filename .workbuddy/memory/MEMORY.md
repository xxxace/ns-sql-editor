# ns-sql-editor 项目约定

## Monaco Editor 快捷键设计注意事项

- **避免 Ctrl+Shift+F**：Windows 中文输入法（微软拼音/搜狗等）在系统层（TSF）拦截此组合键用于简繁体切换，Monaco 收不到
- 格式化快捷键使用 `Shift+Alt+F`（VS Code 标准格式，无 IME 冲突）
- `editor.addAction({ keybindings, contextMenuGroupId, run })` 可以正常同时工作，无需分离
