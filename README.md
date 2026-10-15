# 千岛

同一网站多登录身份同时在线、互不串号的桌面应用（Electron，macOS + Windows）。

组织模型：**项目**（分组，如"视频"）下挂多个**实例**，每个实例独立会话、登录一个账号，互不干扰。

## 应用截图

同一网站两个账号同时在线、数据各自独立（左栏"生活"项目下"账号1/账号2"两个实例）：

![账号2（163）登录态](assets/screenshot1.png)

![账号1（qq）登录态](assets/screenshot2.png)

## 功能特性

- **多实例多开**：项目下挂多个实例，各自独立会话，同站多账号同时在线不串号。
- **标签页**：地址栏跟随页面导航（含站内跳转）；`Cmd+R` / 地址栏 ⟳ 只重载当前活动标签；重启后标签自动恢复（懒加载）。
- **页面区右键**：后退 / 前进 / 重新加载、链接在新标签打开·复制链接、图片另存为·复制图片地址、复制选中文字。
- **下载中心**：顶栏下载图标 + 失败红点；下载记录面板含进度条、失败重试（自动续序号不覆盖）、打开所在文件夹；失败时 toast 即时提醒。
- **下载目录**：应用级默认 + 实例级覆盖，不可用时回退系统默认并通知。
- **账号标注**：实例标注重复时常驻红点 + 系统通知提醒。

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

- macOS：`~/Library/Application Support/multi-persona/`（`projects.json` 元数据明文、`settings.json`、`tabs.db` 标签快照、`downloads.db` 下载记录、`Partitions/persist:mp-<实例id>/` 各实例会话）
- Windows：`%APPDATA%/multi-persona/` 下同名结构

## 说明

- 术语与决策见 `CONTEXT.md`、`docs/adr/`。
- 需求总览见 GitHub issue #1，任务拆分见子 issues。
