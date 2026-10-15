# 0015 实例开发者工具（开给活动标签 guest）

- Status：accepted
- Date：2026-10-15

## Context

视图菜单唯一的开发者工具入口是 `{ role: "toggleDevTools" }`，它只作用于焦点窗口（主窗口），调试的是界面层，够不到页面。用户要的是实例的开发者工具。grill 两轮收敛：作用对象只取活动标签（否决分屏另一格/弹窗，入口简单优先）；入口菜单 + 页面右键都要；已开时 Toggle；主窗口项开发环境保留、release 去掉。

## Decision

- 视图菜单：新增“切换实例开发者工具”，accelerator `CmdOrCtrl+Shift+I`，经 `sendToFocused("mp:toggle-guest-devtools")` 转到渲染层，由活动标签的 webview 元素直接 `isDevToolsOpened() ? closeDevTools() : openDevTools()`（Toggle 语义，主进程不经手 guest 句柄）。
- 页面右键：四种上下文（链接/图片/选中文字/空白）末尾统一加“检查”，点即对触发页 guest 调 `inspectElement(x, y)`，Elements 面板定位到点击元素（Chrome 式；DevTools 已开时只移动焦点，不违 Toggle 约定）。
- 主窗口项 `{ role: "toggleDevTools" }` 仅 `!app.isPackaged` 时组装进菜单：开发调界面层用，release 版普通用户看不到。
- 分屏另一格/弹窗的 DevTools 本次不做：右键“检查”点哪开哪已覆盖弹窗内页面；分屏非活动格如有呼声另起 ADR。

## Consequences

- 渲染层是 guest DevTools 开关的唯一执行点，主进程只负责菜单组装与右键转发；无活动标签时两处入口静默 no-op（与 Cmd+R 空态语义一致）。
- 快捷键占用 `CmdOrCtrl+Shift+I`，与 Chrome 一致，无现有冲突。
- 验证：菜单项/快捷键/右键三入口各开一次活动标签 guest DevTools；二次触发关闭（菜单/快捷键）；右键检查定位到元素；release 包内无主窗口项。
