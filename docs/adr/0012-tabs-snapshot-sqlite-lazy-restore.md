# 0012 标签快照用 sqlite 持久化并懒恢复

- Status：accepted
- Date：2026-10-15

## Context

Issue #25（#24 的后续）：`tabs[]` 纯内存，整窗重载/重启后标签全丢。已定：全实例恢复（D1）、最小集 URL+归属+活动位置+当前实例（D2）、每次变化即落盘（D3）、空白标签也恢复且暂不设上限（D4）、快照损坏静默空启动（D5）、懒加载（D6）。存储用户坚持 sqlite，不用 JSON。

## Decision

- 用 `node:sqlite`（Node 内置 `DatabaseSync`），零新依赖、零原生构建：已实测 Electron 38 内核 Node v22.22.0 支持。不引入 `better-sqlite3`（要 `electron-rebuild`，双平台构建变复杂）。
- 主进程在 userData 下开 `tabs.db`；表 `tabs(url, instance_id, pos)` + 表 `meta(key, value)` 存 `activePos`/`currentInstanceId`；原子写用事务（单文件小写，崩溃不坏一半）。
- renderer 每次 tabs/activeTabId/currentInstanceId 变化即经 IPC 落盘（开/关/切换实例/导航提交/存储过滤）；启动时先拉存储再拉快照重建。
- 恢复只建标签栏，活动标签立即加载，其余首次点中才设 webview `src`（`layout()` 里对可见标签补 `ensureTabLoaded`）；分屏/弹窗/滚动/表单不恢复。快照里的 tab id 是会话内的（`t-N`），只按位置恢复；归属实例已删的条目丢弃。
- 快照文件缺失或损坏 → 返回空快照，静默空启动（沿用 settings.json 策略；与 projects.json 损坏抛错不同，标签丢了可接受、应用必须能开）。

## Consequences

- 重启/整窗重载后标签全回来；`node:sqlite` 仍是 experimental，大版本升级 Node 时需回归。
- 后人若补分屏/滚动恢复，另开 issue，不要塞进快照最小集。
