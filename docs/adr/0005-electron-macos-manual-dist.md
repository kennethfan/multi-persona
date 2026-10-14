# 桌面方案落地：Electron + 双平台 + 手动分发

Status: accepted（2026-10-14 修订：macOS 先行 → macOS + Windows 双平台）

产品形态定为独立桌面应用后，落地三件套一并确定：技术栈用 Electron（会话分区 `persist:` 是其原生能力，正是实例隔离需要的；Tauri 包虽小但 webview 会话隔离弱，命根子需求不能赌）。OS 做 macOS（dmg）+ Windows（nsis 安装包）：代码只用跨平台 API（`app.getPath` 等），打包在 mac 上 cross-build 出 exe。Windows 包暂无签名，安装时有 SmartScreen 警告，release 注明"仍要运行"；有真实用户后再买证书。Windows 包在真机验证通过前不发布。第一版手动分发安装包（下载即用），自动更新第二版再加。

## Consequences

- 包体积 ~100MB+、内存占用高，第一版接受。
- 单主窗口、容器为标签页、可分屏并排；拖出独立窗口以后再说。
