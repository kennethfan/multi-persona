# 0013 全局伪装纯 Chrome User-Agent

- Status：accepted
- Date：2026-10-15

## Context

知乎登录时在应用内浮层弹窗报“浏览器版本过低”，载体是千岛应用内页面区（主标签 + 浮层弹窗都中招）。排查结论：全仓库零 UA 处理，`renderer/app.js makeWebview`、`src/main.ts did-attach-webview` 从未设置 `useragent`；默认 webview UA 带 `Electron/38.8.6` 尾巴，Chromium 140 本身不低，是知乎靠 UA 嗅探硬拦 Electron。另见 0010：知乎 302 跳登录曾暴露过地址栏跟随问题，同属兼容性拦截一类。

## Decision

- 全局生效：所有实例所有 webview，在 `main.ts did-attach-webview` 里 `guest.setUserAgent(去 Electron/应用名尾巴后的纯 Chrome UA)`，保留平台 OS 段与 Chrome/140 版本段，不做分站白名单。
- 不动 `persist:mp-<id>` 隔离；主标签与浮层弹窗走同一 `makeWebview` 工厂，一次修全覆盖。
- 否决单站白名单（只改 `*.zhihu.com`）：修不彻底，B站/小红书/飞书等同类拦截迟早再犯。

## Consequences

- 知乎登录弹窗 `navigator.userAgent` 不再含 `Electron` 字样，可走完扫码/密码登录；同类 UA 拦截站一并修复。
- 若个别站真需原生 UA，再加按站点回退开关，本 ADR 到时追加记录。
- 验证：弹窗内查 UA + 走完知乎登录 + 抽查 B站/小红书其一 + Gmail 不回归 + 实例不串号重测（动的是公共挂载点）。
