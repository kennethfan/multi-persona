# 0010 地址栏跟随导航

- Status：accepted
- Date：2026-10-15

## Context

Issue #23：打开 zhihu.com 自动跳转到登录页后，地址栏仍显示旧 URL。根因是 `renderer/app.js makePane` 只在创建/手工提交时写 `tab.url`，只监听 `page-title-updated`，从未监听 webview 导航事件。Electron webview 整页导航（含 302）走 `did-navigate`，SPA `pushState/hash` 走 `did-navigate-in-page`，只听一个必漏另一种。

## Decision

- 地址栏是页面地址（webview 已提交导航 URL）的只读映射：`did-navigate` + `did-navigate-in-page` 都回写 `tab.url`、地址栏 `input`、并 `renderTabbar()`。
- 用户正在输入时不抢：`input` 聚焦（`document.activeElement === input`）时跳过覆盖，失焦后下次对齐；非聚焦一律覆盖。
- 本次范围只修主地址栏 + 标签栏回退显示，弹窗顶部 `.url` 不动。

## Consequences

- 知乎类 302/JS 跳登录、SPA 内跳都会同步；后退/前进同样经由 `did-navigate` 同步，无需额外处理。
- 聚焦保护意味着自动化测试需先 `blur()` 再断言 `input.value`，否则会误判为未同步。
