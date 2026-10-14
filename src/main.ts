import { app, BrowserWindow, Menu, Notification, dialog, ipcMain, session } from "electron";
import type { DownloadItem } from "electron";
import path from "node:path";
import { decideDownloadPath } from "./downloads";
import { loadStore, migrateLegacyStore, resolveStorePath, saveStore } from "./project-store";
import {
  addInstance,
  addProject,
  findDuplicateLabels,
  getProject,
  recolorInstance,
  recolorProject,
  removeInstance,
  removeProjectCascade,
  renameInstance,
  renameProject,
  setInstanceDownloadDir,
  setInstanceLabel,
} from "./projects";
import { buildMenuCommands, menuLabel } from "./menus";
import type { MenuCmd, TreeNodeKind } from "./menus";
import { clearInstanceCache, partitionFor, wipeInstanceStorage } from "./sessions";
import {
  DEFAULT_SETTINGS,
  loadSettingsFile,
  resolveSettingsPath,
  saveSettingsFile,
  withDefaults,
} from "./settings";
import type { Settings } from "./settings";
import { createWindowOptions } from "./window-config";

/** guest webContents id → 所属实例 id（渲染进程在 webview did-attach 后上报）。 */
const webviewInstances = new Map<number, string>();

/** 新建节点 id：毫秒时间 + 序列号，同毫秒多次调用也不碰撞。 */
let idSeq = 0;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq}`;
}

/** 存储变更后通知所有窗口重拉：删实例/改标注都不再需要重启才生效。 */
function broadcastStoreChanged(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send("mp:store-changed");
  }
}

/**
 * 实例分区下载落盘：will-download 直接指定保存路径，不弹另存为框。
 * 设置/存储每次现读——改完设置后下一次下载即生效；读存储失败按跟随全局处理。
 */
function handleWillDownload(
  instanceId: string,
  item: DownloadItem,
  storePath: string,
  settingsPath: string,
): void {
  const settings = loadSettingsFile(settingsPath);
  let instanceDir: string | undefined;
  try {
    instanceDir = loadStore(storePath).instances.find((c) => c.id === instanceId)?.downloadDir;
  } catch {
    instanceDir = undefined;
  }
  const systemDir = app.getPath("downloads");
  const { savePath, fellBack } = decideDownloadPath({
    instanceDir,
    appDir: settings.downloadDir,
    systemDir,
    filename: item.getFilename(),
  });
  if (fellBack) {
    new Notification({
      title: "下载目录不可用，已回退到系统默认",
      body: savePath,
    }).show();
  }
  item.setSavePath(savePath);
}

/** 给实例专属分区挂下载拦截（含 <webview> 同分区下载）。 */
function watchDownloads(instanceId: string, storePath: string, settingsPath: string): void {
  session
    .fromPartition(partitionFor(instanceId))
    .on("will-download", (_event, item) =>
      handleWillDownload(instanceId, item, storePath, settingsPath),
    );
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
  const settingsPath = resolveSettingsPath(userData);
  let settings: Settings = loadSettingsFile(settingsPath);
  saveSettingsFile(settingsPath, settings);
  for (const inst of store.instances) {
    watchDownloads(inst.id, storePath, settingsPath);
  }

  // 应用级设置：读内存值，写时合并回填后落盘（界面层草稿只在点保存后才调 set）。
  ipcMain.handle("settings:get", () => settings);
  ipcMain.handle("settings:set", (_event, patch: Partial<Settings>) => {
    settings = withDefaults({ ...settings, ...patch });
    saveSettingsFile(settingsPath, settings);
    return settings;
  });

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
  // 清缓存：只清网络缓存、登录态保留；实例不存在直接抛错不动任何缓存。
  ipcMain.handle("store:clear-cache", async (_event, instanceId: string) => {
    const store = loadStore(storePath);
    if (!store.instances.some((c) => c.id === instanceId)) {
      throw new Error(`实例不存在: ${instanceId}`);
    }
    return clearInstanceCache(session.fromPartition(partitionFor(instanceId)), instanceId);
  });
  // 清全部站点数据：复用删实例的 wipe（掉登录），但保留实例元数据。
  ipcMain.handle("store:clear-data", async (_event, instanceId: string) => {
    const store = loadStore(storePath);
    if (!store.instances.some((c) => c.id === instanceId)) {
      throw new Error(`实例不存在: ${instanceId}`);
    }
    return wipeInstanceStorage(session.fromPartition(partitionFor(instanceId)), instanceId);
  });
  // 账号标注：纯元数据写；保存后若本次标注正处冲突，系统通知提醒（常驻红点由界面层画）。
  ipcMain.handle("store:set-label", (_event, instanceId: string, label: string) => {
    const store = loadStore(storePath);
    store.instances = setInstanceLabel(store.instances, instanceId, label);
    saveStore(storePath, store);
    broadcastStoreChanged();
    const trimmed = label.trim();
    if (trimmed && settings.conflictNotify) {
      const dup = findDuplicateLabels(store.instances).find((d) => d.label === trimmed);
      if (dup) {
        new Notification({
          title: "账号冲突提醒",
          body: `${trimmed} 同时出现在 ${dup.instanceIds.length} 个实例中，请确认是否为误操作`,
        }).show();
      }
    }
    return store;
  });
  ipcMain.handle("store:duplicate-labels", () => findDuplicateLabels(loadStore(storePath).instances));
  // 实例专属下载目录：空字串=清除覆盖（恢复跟随全局）。
  ipcMain.handle("store:set-download-dir", (_event, instanceId: string, dir: string) => {
    const store = loadStore(storePath);
    store.instances = setInstanceDownloadDir(store.instances, instanceId, dir);
    saveStore(storePath, store);
    broadcastStoreChanged();
    return store;
  });
  // 系统目录选择器：取消返回 null；调用方传当前生效目录做 defaultPath。
  ipcMain.handle("dialog:pick-directory", async (event, defaultPath?: string) => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const picked = await dialog.showOpenDialog(parent as BrowserWindow, {
      properties: ["openDirectory", "createDirectory"],
      defaultPath,
    });
    return picked.canceled ? null : (picked.filePaths[0] ?? null);
  });
  // 渲染进程算“当前生效目录”展示用（系统默认路径只在主进程可取）。
  ipcMain.handle("downloads:system-dir", () => app.getPath("downloads"));
  // 新建项目：顺带建 1 个默认实例（与预置行为一致，开箱即用）。
  ipcMain.handle("store:add-project", (_event, name: string, color: string) => {
    const store = loadStore(storePath);
    const projectId = nextId("p");
    store.projects = addProject(store.projects, { id: projectId, name, color });
    const instanceId = nextId("i");
    store.instances = addInstance(store.instances, {
      id: instanceId,
      projectId,
      name: "实例一",
      color,
    });
    saveStore(storePath, store);
    watchDownloads(instanceId, storePath, settingsPath);
    broadcastStoreChanged();
    return store;
  });
  // 新建实例：所属项目必须存在，先校验再写（纯函数不跨表校验，主进程守门）。
  ipcMain.handle("store:add-instance", (_event, projectId: string, name: string, color: string) => {
    const store = loadStore(storePath);
    if (!getProject(store.projects, projectId)) {
      throw new Error(`项目不存在: ${projectId}`);
    }
    const instanceId = nextId("i");
    store.instances = addInstance(store.instances, { id: instanceId, projectId, name, color });
    saveStore(storePath, store);
    watchDownloads(instanceId, storePath, settingsPath);
    broadcastStoreChanged();
    return store;
  });
  ipcMain.handle("store:rename", (_event, kind: TreeNodeKind, id: string, name: string) => {
    const store = loadStore(storePath);
    if (kind === "project") store.projects = renameProject(store.projects, id, name);
    else store.instances = renameInstance(store.instances, id, name);
    saveStore(storePath, store);
    broadcastStoreChanged();
    return store;
  });
  ipcMain.handle("store:recolor", (_event, kind: TreeNodeKind, id: string, color: string) => {
    const store = loadStore(storePath);
    if (kind === "project") store.projects = recolorProject(store.projects, id, color);
    else store.instances = recolorInstance(store.instances, id, color);
    saveStore(storePath, store);
    broadcastStoreChanged();
    return store;
  });
  // 删项目：逐实例先清分区再删元数据（与删实例同序，任一 wipe 失败即抛错、元数据不动）。
  ipcMain.handle("store:remove-project", async (_event, projectId: string) => {
    const store = loadStore(storePath);
    const members = store.instances.filter((c) => c.projectId === projectId);
    for (const m of members) {
      await wipeInstanceStorage(session.fromPartition(partitionFor(m.id)), m.id);
    }
    const next = removeProjectCascade(store.projects, store.instances, projectId);
    store.projects = next.projects;
    store.instances = next.instances;
    saveStore(storePath, store);
    broadcastStoreChanged();
    return store;
  });
  // 系统原生二次确认（dialog 跨平台，满足 Windows 约束）：返回 true=用户点了确认键。
  ipcMain.handle(
    "ui:confirm",
    (event, opts: { message: string; detail?: string; okLabel?: string }) => {
      const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const response = dialog.showMessageBoxSync(parent as BrowserWindow, {
        type: "question",
        buttons: ["取消", opts.okLabel ?? "确认"],
        defaultId: 1,
        cancelId: 0,
        message: opts.message,
        detail: opts.detail,
      });
      return response === 1;
    },
  );
  ipcMain.on(
    "mp:context-menu",
    (event, payload: { kind: TreeNodeKind; id: string; x: number; y: number }) => {
      const sender = event.sender;
      const menu = Menu.buildFromTemplate(
        buildMenuCommands(payload.kind).map((cmd: MenuCmd) => ({
          label: menuLabel(cmd, payload.kind),
          click: () => sender.send("mp:menu-cmd", { cmd, kind: payload.kind, id: payload.id }),
        })),
      );
      const parent = BrowserWindow.fromWebContents(sender);
      menu.popup({ window: parent ?? undefined, x: payload.x, y: payload.y });
    },
  );

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
