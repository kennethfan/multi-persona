# 千岛

同一网站多登录身份同时在线、互不串号的桌面应用（Electron，macOS + Windows）。

组织模型：**项目**（分组，如"视频"）下挂多个**实例**，每个实例独立会话、登录一个账号，互不干扰。

## 快速开始

```bash
npm install
npm run dev
```

1. 左栏右键空白处 → 新建项目（如"视频"）。
2. 右键项目 → 新建实例，一个账号建一个实例。
3. 在实例里打开网站并登录；不同实例同站登录互不串号。
4. 右键实例可改名/改色/标注账号/清缓存；标注重复会有红点+系统通知提醒。

## 常用命令

| 命令            | 说明                    |
|-----------------|-------------------------|
| `npm install`   | 安装依赖                |
| `npm start`     | 启动应用（需先 build）  |
| `npm run dev`   | 本地启动（先 build 再启动，一步到位）|
| `npm run build` | TypeScript 编译到 dist/ |
| `npm run typecheck` | 仅类型检查          |
| `npm test`      | vitest 单测             |
| `npm run dist`  | 打 macOS dmg（release/）|
| `npm run dist:win` | 打 Windows exe（release/，mac cross-build，需真机验证后才可发版）|

## 数据位置

- macOS：`~/Library/Application Support/multi-persona/`（`projects.json` 元数据明文、`settings.json`、`Partitions/persist:mp-<实例id>/` 各实例会话）
- Windows：`%APPDATA%/multi-persona/` 下同名结构

## 说明

- 术语与决策见 `CONTEXT.md`、`docs/adr/`。
- 需求总览见 GitHub issue #1，任务拆分见子 issues。
