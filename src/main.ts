import { app, BrowserWindow, ipcMain, session } from "electron";
import path from "node:path";
import { loadStore, migrateLegacyStore, resolveStorePath, saveStore } from "./project-store";
import { findDuplicateLabels, removeInstance, setInstanceLabel } from "./projects";
import { partitionFor, wipeInstanceStorage } from "./sessions";
import { createWindowOptions } from "./window-config";

/** guest webContents id → 所属实例 id（渲染进程在 webview did-attach 后上报）。 */
const webviewInstances = new Map<number, string>();

/** 存储变更后通知所有窗口重拉：删实例/改标注都不再需要重启才生效。 */
function broadcastStoreChanged(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send("mp:store-changed");
  }
}

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
  // 删实例：先清分区存储（含登录态），再删元数据落盘。
  // 顺序不能反——wipe 失败时元数据还在、可重试；反过来会留下清不掉的孤儿会话。
  ipcMain.handle("store:remove-instance", async (_event, instanceId: string) => {
    const store = loadStore(storePath);
    store.instances = removeInstance(store.instances, instanceId); // 不存在直接抛错，不动任何存储
    await wipeInstanceStorage(session.fromPartition(partitionFor(instanceId)), instanceId);
    saveStore(storePath, store);
    broadcastStoreChanged();
    return store;
  });
  // 账号标注：纯元数据写；同账号双实例检查由 duplicate-labels 统一算。
  ipcMain.handle("store:set-label", (_event, instanceId: string, label: string) => {
    const store = loadStore(storePath);
    store.instances = setInstanceLabel(store.instances, instanceId, label);
    saveStore(storePath, store);
    broadcastStoreChanged();
    return store;
  });
  ipcMain.handle("store:duplicate-labels", () => findDuplicateLabels(loadStore(storePath).instances));

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
