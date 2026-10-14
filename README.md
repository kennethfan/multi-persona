# multi-persona

同一网站多登录身份同时在线、互不串号的桌面应用（Electron，macOS 先行）。

## 常用命令

| 命令            | 说明                    |
|-----------------|-------------------------|
| `npm install`   | 安装依赖                |
| `npm start`     | 启动应用（需先 build）  |
| `npm run build` | TypeScript 编译到 dist/ |
| `npm run typecheck` | 仅类型检查          |
| `npm test`      | vitest 单测             |
| `npm run dist`  | 打 macOS dmg（release/）|
| `npm run dist:win` | 打 Windows exe（release/，mac cross-build）|

## 说明

- 术语与决策见 `CONTEXT.md`、`docs/adr/`。
- 需求总览见 GitHub issue #1，任务拆分见子 issues。
