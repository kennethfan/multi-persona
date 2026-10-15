# 0011 Cmd+R 只重载当前活动标签

- Status：accepted
- Date：2026-10-15

## Context

Issue #24：焦点在页面里按 Cmd+R，整窗白屏重载，所有实例标签全丢。根因是 `src/main.ts` 从未 `setApplicationMenu`，macOS 默认菜单的“查看 → 重新加载”重载整个宿主窗口，而 `tabs[]` 纯内存、只持久化项目/实例。且焦点在 webview guest 里时按键到不了宿主页面，renderer 层拦不住，只能在主进程层拦。

## Decision

- 主进程设应用菜单：保留原生 File/Edit/Window 角色菜单保证复制粘贴等行为不变；“视图”里 Cmd+R 从默认 `reload` 角色改为发 IPC（`mp:reload-active-tab`）。
- `preload.ts` 加 `onReloadActiveTab` 通道；`renderer/app.js` 收到后只 `panes[activeTabId].view.reload()`，分屏另一格与弹窗不动，无活动标签时静默 no-op。
- tabs 持久化恢复另开 issue，本次不做。

## Consequences

- 多实例多标签下 Cmd+R 只刷当前页；菜单里不再提供整窗重载入口，调试整窗重载需走开发者工具。
- 后人若想加回默认 `reload` 角色，必须先解决 tabs 持久化，否则重现 #24。
