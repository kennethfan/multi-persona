import { app, BrowserWindow, ipcMain, session } from "electron";
import path from "node:path";
import { loadStore, migrateLegacyStore, resolveStorePath, saveStore } from "./project-store";
import { partitionFor } from "./sessions";
import { createWindowOptions } from "./window-config";

/** guest webContents id → 所属实例 id（渲染进程在 webview did-attach 后上报）。 */
const webviewInstances = new Map<number, string>();

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow(createWindowOptions());
  // 站内全部新窗口请求在此拦截：一律 deny 原生窗口，转界面层开应用内标签/modal。
  // 注意：<webview> 的 new-window 事件自 Electron 22 已移除，必须用 setWindowOpenHandler。
  win.webContents.on("did-attach-webview", (_event, guest) => {
    guest.setWindowOpenHandler((details) => {
      win.webContents.send("mp:window-open", {
        url: details.url,
        disposition: details.disposition,
        instanceId: webviewInstances.get(guest.id) ?? "",
      });
      return { action: "deny" };
    });
  });
  void win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  return win;
}

void app.whenReady().then(() => {
  // 先迁移旧数据，再加载存储并为每个实例预取专属持久化分区（登录态落盘，重启保留）。
  const userData = app.getPath("userData");
  migrateLegacyStore(userData);
  const storePath = resolveStorePath(userData);
  const store = loadStore(storePath);
  saveStore(storePath, store); // 首次启动时落盘默认存储
  for (const inst of store.instances) {
    session.fromPartition(partitionFor(inst.id));
  }

  // renderer 只读存储；上报 webview 与实例的配对。
  ipcMain.handle("store:list", () => loadStore(storePath));
  ipcMain.on("mp:webview-register", (_event, webContentsId: number, instanceId: string) => {
    webviewInstances.set(webContentsId, instanceId);
  });

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
