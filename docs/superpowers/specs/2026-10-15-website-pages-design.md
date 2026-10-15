# website + GitHub Pages 设计文档

- 日期：2026-10-15
- 状态：待用户终审
- 背景：为"千岛"（多账号会话隔离桌面应用）新增产品功能介绍页，通过 GitHub Pages 对外发布。

## 1. 目标

1. 新增 `website/` 纯静态单页（零构建），内容为营销落地页。
2. 新增 `.github/workflows/pages.yml`，push 到 `dev`/`main` 即自动发布到 GitHub Pages（Actions 模式），另支持手动触发。
3. 内容与 `README.md` 同源（9 大功能提炼），截图复用 `assets/`，详细文档链回 README。

## 2. 非目标

- 不做多页面、不引入构建工具（Vite/npm），不做中英双语（首版仅中文）。
- 不改现有 `ci.yml`/`release.yml`、不改 Electron 主工程、不配自定义域名。

## 3. 文件结构

```text
website/
  index.html      # 落地页单页（含内联或外联样式引用）
  styles.css      # 页面样式（与 renderer/styles.css 独立）
  assets/
    screenshot1.png   # 由仓库根 assets/ 拷贝（Pages 工件只含 website/）
    screenshot2.png   # 同上
.github/workflows/pages.yml  # Pages 自动部署
```

说明：部署工件路径仅为 `website/`，根 `assets/` 不会被打包，故截图需拷贝一份进 `website/assets/`（接受少量冗余；更新截图时顺手同步）。

## 4. pages.yml 关键配置

- 触发：`push` 到 `dev`、`main` + `workflow_dispatch`（手动）。首版不做 paths 过滤（静态部署 <1 分钟，每次全量重发最不易错）。
- 权限：`pages: write`、`id-token: write`；环境 `github-pages`（取其 `page_url` 输出）。
- 并发：`group: pages` + `cancel-in-progress: true`（与 release.yml 风格一致）。
- 步骤：`actions/checkout@v4` → `actions/configure-pages@v5` → `actions/upload-pages-artifact@v3`（`path: website`）→ `actions/deploy-pages@v4`。
- 前置条件：仓库 Settings → Pages → Build and deployment 须选 **GitHub Actions**（人工点一次，本设计不含自动改设置）。

## 5. 落地页内容结构（单页，分节）

1. 首屏：产品名"千岛" + 一句话（同一网站多登录身份同时在线、互不串号）+ 双截图 + 下载按钮（链到 GitHub Releases）+ GitHub 仓库链接。
2. 组织模型：项目（分组）→ 实例（隔离会话，一实例一账号）。
3. 功能亮点卡片（由 README 9 节提炼 6–8 张）：多实例多开 / 标签·地址栏·分屏·弹窗 / 页面右键 / 下载中心 / 下载目录两级 / 书签 / 账号标注防串号 / 引导·设置·快捷键。
4. 快速开始：3 步（建项目 → 建实例 → 登录），附 `npm install && npm run dev`。
5. 数据与隐私摘要：隔离机制一句话 + 数据位置（macOS/Windows 路径）。
6. 页脚：回链 README（详细功能说明）、CONTEXT.md、docs/adr/、GitHub Issues。

## 6. 验证

1. 本地预览：`npx serve website`（或 `python3 -m http.server -d website`），浏览器检查排版、图片、锚点跳转。
2. 推送后检查 Actions → pages build and deployment 成功，且 `github-pages` 环境 URL 可访问。
3. 现有 CI 不受影响（ci.yml 只跑 typecheck/test，与新增文件无关）。

## 7. 风险

- Pages 未切到 Actions 模式 → 首发需人工在 Settings 点一次（文档中注明）。
- 截图拷贝冗余 → 约定更新截图时同步 `website/assets/`（README 截图更新流程顺带）。
