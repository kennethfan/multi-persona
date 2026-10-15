# website + GitHub Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建 `website/` 纯静态营销落地页并通过 GitHub Actions 自动发布到 GitHub Pages。

**Architecture:** 零构建静态站（`index.html` + `styles.css` + 拷贝的截图）；`pages.yml` 用官方 pages v4 流水线（checkout → configure-pages → upload artifact → deploy），触发于 `dev`/`main` push 与手动。

**Tech Stack:** 纯 HTML + CSS（系统字体栈、响应式、无 JS 框架）；GitHub Actions（checkout@v4、configure-pages@v5、upload-pages-artifact@v3、deploy-pages@v4）。

**Spec:** `docs/superpowers/specs/2026-10-15-website-pages-design.md`

## Global Constraints

- `website/` 之外不新增构建依赖，`package.json` 不动。
- 部署工件路径仅为 `website/`，截图必须拷贝进 `website/assets/`。
- 不动 `README.md`（其有未提交修改，属上一任务）。
- 不动 `ci.yml` / `release.yml` 与 Electron 主工程。
- 落地页仅中文；详细文档链回 README，不在站内重复全文。

## Review Focus

- Pages 未切到 Actions 模式导致 deploy 排队失败 → Task 3 落地后首发需人工确认 Settings，步骤内注明。
- 截图文件名大小写漂移（`screenshot1.png`）→ Task 1 用 `ls` 钉死实际文件名再拷贝，Task 2 用 grep 钉死引用一致。
- 中文在无 `<meta charset>` 时乱码 → Task 2 首行断言 `charset="utf-8"`。
- 部署分支误配（只推 `dev` 不推 `main` 也能发，符合预期）→ Task 3 触发分支与 ci.yml 一致（`dev`、`main`）。
- 手机窄屏横向溢出 → Task 2 用 `meta viewport` + `max-width:100%` 图片规则并 curl 断言存在。

---

### Task 1: 拷贝截图到 website/assets

**Files:**
- Create: `website/assets/screenshot1.png`（由 `assets/` 拷贝）
- Create: `website/assets/screenshot2.png`（由 `assets/` 拷贝）

**Interfaces:**
- Consumes: 仓库根 `assets/screenshot1.png`、`assets/screenshot2.png`
- Produces: `website/assets/` 下同名文件（供 Task 2 的 `<img src="assets/...">` 引用）

约定：以后更新根 `assets/` 截图时同步拷贝到 `website/assets/`（见 spec §7）。

- [ ] **Step 1: 确认源文件名并拷贝**

```bash
ls assets/ && mkdir -p website/assets && cp assets/screenshot1.png assets/screenshot2.png website/assets/ && ls -lh website/assets/
```

Expected: 两行截图文件均存在且大小非零。

- [ ] **Step 2: Commit**

```bash
git add website/assets/ && git commit -m "feat(website): 拷贝落地页截图"
```

---

### Task 2: 落地页单页 website/index.html + styles.css

**Files:**
- Create: `website/index.html`
- Create: `website/styles.css`

**Interfaces:**
- Consumes: Task 1 的 `website/assets/screenshot1.png|2`；文案源 `README.md` 功能说明 9 节（提炼，不全文搬）
- Produces: 本地可预览的完整单页（供 Task 3 发布）

内容要求（严格按此 6 节，不增节）：
1. 首屏：`千岛` + `同一网站多登录身份同时在线、互不串号的桌面应用（Electron，macOS + Windows）` + 双截图 + 下载按钮（`href="https://github.com/kennethfan/multi-persona/releases"`）+ 仓库链接（`href="https://github.com/kennethfan/multi-persona"`）。
2. 组织模型：`项目是分组，实例是隔离的会话空间：一个实例登一个账号，同站多账号互不串号`。
3. 功能亮点 8 卡片，标题逐字：`多实例多开`、`标签·地址栏·分屏·弹窗`、`页面区右键`、`下载中心`、`两级下载目录`、`书签`、`账号标注防串号`、`引导·设置·快捷键`；每卡一句话说明（取自 README 对应节首句）。
4. 快速开始：三步文字 `新建项目 → 新建实例 → 在实例里登录` + `npm install` / `npm run dev` 代码块。
5. 数据与隐私摘要：`每个实例独占持久化分区，删实例先清分区再删元数据` + macOS `~/Library/Application Support/multi-persona/`、Windows `%APPDATA%/multi-persona/`。
6. 页脚：三个链接 `详细功能说明（README）` → `../README.md`（注：Pages 上该相对链指向仓库文本，保留即可）、`术语与决策（CONTEXT.md）`、`GitHub Issues` → `https://github.com/kennethfan/multi-persona/issues`。

样式约束：`meta charset="utf-8"`、`meta viewport` 必备；系统字体栈；`img{max-width:100%}`；单列窄屏自适应（`max-width:960px` 容器 + media query 堆叠卡片）。

- [ ] **Step 1: 写 website/index.html 与 website/styles.css（按上述 6 节与约束）**

- [ ] **Step 2: 本地预览并断言关键字符串**

```bash
python3 -m http.server 8123 -d website & sleep 1 && curl -s http://localhost:8123/ | grep -E "千岛|多实例多开|releases|viewport|charset" && kill %1
```

Expected: grep 命中上述全部关键字后退出码 0。

- [ ] **Step 3: Commit**

```bash
git add website/index.html website/styles.css && git commit -m "feat(website): 营销落地页单页"
```

---

### Task 3: pages.yml 自动部署

**Files:**
- Create: `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: Task 2 的 `website/`（部署工件）
- Produces: push 到 `dev`/`main` 即发布的 Pages 流水线

文件内容逐字如下：

```yaml
name: Pages

on:
  push:
    branches: [dev, main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: website
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 1: 写 .github/workflows/pages.yml（内容同上，一字不差）**

- [ ] **Step 2: 校验 YAML 与关键字段**

```bash
python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/pages.yml')); assert d['jobs']['deploy']['steps'][2]['with']['path']=='website', 'artifact path'; print('pages.yml OK')"
```

Expected: 输出 `pages.yml OK`。若缺 `yaml` 模块，改用 `grep -E "upload-pages-artifact|path: website|github-pages|configure-pages" .github/workflows/pages.yml` 命中全部四项即算通过。

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/pages.yml && git commit -m "ci(pages): website自动发布到GitHub Pages"
```

注：合并推送后需人工做一次 Settings → Pages → Build and deployment 选 **GitHub Actions**，并用 `workflow_dispatch` 手动触发一次验证首发。

---
