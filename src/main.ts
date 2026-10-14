import { app, BrowserWindow, session } from "electron";
import path from "node:path";
import { loadContainers, resolveStorePath, saveContainers } from "./container-store";
import { partitionFor } from "./sessions";
import { createWindowOptions } from "./window-config";

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow(createWindowOptions());
  // T1 占位页：静态 HTML，后续票替换为真实 UI。
  void win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  return win;
}

void app.whenReady().then(() => {
  // T3：加载容器并为每个容器预取专属持久化分区（登录态落盘，重启保留）。
  const storePath = resolveStorePath(app.getPath("userData"));
  const containers = loadContainers(storePath);
  saveContainers(storePath, containers); // 首次启动时落盘 5 预置容器
  for (const c of containers) {
    session.fromPartition(partitionFor(c.id));
  }

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
