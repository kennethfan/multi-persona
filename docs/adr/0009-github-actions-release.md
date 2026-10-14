# 0009 GitHub Actions 自动打包与发版

- Status：accepted
- Date：2026-10-14

## Context

本地已有 `typecheck`、`test`、`dist`（mac dmg）、`dist:win`（nsis 向导式安装），但全靠手动跑；仓库无 `.github/`，push 无校验，发版靠本地上传 `release/`。用户要求 push/tag 全自动：CI 校验 + mac+win 双平台打包 + 打 tag 自动建 GitHub Release。

## Decision

- 两个工作流：`ci.yml`（push/PR 到 `dev`、`main`，`ubuntu-latest` 跑 `npm ci → typecheck → test`，不打包）+ `release.yml`（`push.tags v*.*.*` + `workflow_dispatch`，matrix 跑双平台）。
- Runner 不 pin：`macos-latest` + `windows-latest`，默认 arch（mac arm64 / win x64），第一版求跑通。
- 版本源为 tag：job 内把 tag 去 `v` 写回 `package.json` 再 build（不回写仓库），保证包内版本 == Release 名。
- 无签名：`CSC_IDENTITY_AUTO_DISCOVERY=false`，mac Gatekeeper / Win SmartScreen 警告为预期行为（延续 0005）。
- 产物范围：`*.dmg` + `*.exe` + `*.blockmap` + `latest*.yml` 进 Artifacts（保留 7 天）+ Release；`win-unpacked/`、`mac/` 等中间目录不进。
- 发版形态：tag 一推即正式发布 + auto notes，不分 draft/prerelease；`workflow_dispatch` 只留 Artifacts。
- 失败语义：`concurrency group=release-${ref}` 取消旧跑；`publish` 需 matrix 全绿，一红就不建 Release、只留 Artifacts 排错。
- 打包用 `--publish never`，上传靠 `softprops/action-gh-release@v2`，`permissions: contents: write`。

## Considered Options

- Runner pin 死版本（如 `macos-15` + `windows-2022`）：可复现性好，但需跟进镜像退役，第一版否决，跑通后再 pin。
- tag 与 `package.json` version 强制一致拦截：最严谨，但手动维护版本时易误拦；否决，改用"tag 写回再打包"保证一致。
- 先 draft 再手动公开：更稳，但多一步人工；否决，tag 即正式（测完可用测试 tag 验证后删除）。

## Consequences

- 新增 `.github/workflows/ci.yml`、`release.yml`；不动 `src/` 与现有 npm 脚本。
- 需用测试 tag（如 `v0.1.0-test.1`）验证双平台构建 + Release 生成，OK 后删除测试 Release/tag。
- 签名/公证、auto-update（`latest*.yml` 已随包上传，为第二版铺路）另起票据，不在本票范围。
