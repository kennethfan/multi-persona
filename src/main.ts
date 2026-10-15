import { app, BrowserWindow, Menu, Notification, clipboard, dialog, ipcMain, session, shell, webContents } from "electron";
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
  setInstanceUserAgent,
} from "./projects";
import { buildGuestMenuCommands, buildMenuCommands, guestMenuLabel, menuLabel } from "./menus";
import type { GuestCmd, GuestContext, MenuCmd, TreeNodeKind } from "./menus";
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
import { resolveUA } from "./user-agent";
import { loadTabsSnapshot, resolveTabsDbPath, saveTabsSnapshot } from "./tabs-db";
import type { TabsSnapshot } from "./tabs-db";
import { loadBookmarks, resolveBookmarksDbPath, saveBookmarks } from "./bookmarks-db";
import type { Bookmark } from "./bookmarks-db";
import { loadDownloadRecords, resolveDownloadsDbPath, saveDownloadRecords } from "./downloads-db";
import type { DownloadRecord } from "./downloads-db";

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

function broadcastToast(text: string): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send("mp:toast", text);
  }
}

/** #28：下载记录事件广播（开始/完成/取消/中断全量上报，界面层做列表+红点+失败 toast）。 */
function broadcastDownloadEvent(record: DownloadRecord): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send("mp:download-event", record);
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
  // #28：will-download 时即发 active（列表出现“下载中”）；done 全量上报——之前只处理
  // completed，cancelled/interrupted 被吞是本次报障根因。重试 URL 此时捕获（Q10/Q12）。
  const startedAt = Date.now();
  const base = {
    key: savePath,
    url: item.getURL(),
    filename: item.getFilename(),
    savePath,
    instanceId,
    time: startedAt,
  };
  broadcastDownloadEvent({ ...base, state: "active" });
  // P1：updated 高频，只 500ms 节流推一次进度（未知总大小时 totalBytes<=0，界面层降级文字）。
  let lastPush = 0;
  item.on("updated", () => {
    const now = Date.now();
    if (now - lastPush < 500) return;
    lastPush = now;
    broadcastDownloadEvent({
      ...base,
      state: "active",
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
    });
  });
  item.on("done", (_e, state) => {
    if (state === "completed") broadcastToast(`已下载：${item.getFilename()}`);
    if (state === "completed" || state === "cancelled" || state === "interrupted") {
      broadcastDownloadEvent({ ...base, state });
    }
  });
}

/** 给实例专属分区挂下载拦截（含 <webview> 同分区下载）。 */
function watchDownloads(instanceId: string, storePath: string, settingsPath: string): void {
  session
    .fromPartition(partitionFor(instanceId))
    .on("will-download", (_event, item) =>
      handleWillDownload(instanceId, item, storePath, settingsPath),
    );
}

/** ADR-0011：Cmd+R 只重载当前活动标签。覆盖默认菜单的 reload 整窗语义，原生 File/Edit/Window 保留。 */
function sendToFocused(channel: string, payload?: unknown): void {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.webContents.send(channel, payload);
}

function buildAppMenu(): void {
  // About 面板中文化：默认 appMenu 面板内容全英文，应用名/版本/版权/简介改为中文。
  app.setAboutPanelOptions({
    applicationName: "千岛",
    applicationVersion: app.getVersion(),
    copyright: "版权所有 © 2026 千岛",
    credits: "多账号隔离的桌面浏览器",
  });
  const viewSubmenu: Electron.MenuItemConstructorOptions[] = [
    {
      label: "重新加载当前标签",
      accelerator: "CmdOrCtrl+R",
      click: (_item, focusedWindow) => {
        if (focusedWindow instanceof BrowserWindow) {
          focusedWindow.webContents.send("mp:reload-active-tab");
        }
      },
    },
    { type: "separator" },
    // #32 Q5：标签操作走菜单 accelerator（renderer 够不着 webview 内焦点）。
    {
      label: "当前实例新标签",
      accelerator: "CmdOrCtrl+T",
      click: () => sendToFocused("mp:new-tab"),
    },
    {
      label: "关闭当前标签",
      accelerator: "CmdOrCtrl+W",
      click: () => sendToFocused("mp:close-active-tab"),
    },
    {
      label: "上一个标签",
      accelerator: "CmdOrCtrl+Shift+[",
      click: () => sendToFocused("mp:switch-tab", { dir: -1 }),
    },
    {
      label: "下一个标签",
      accelerator: "CmdOrCtrl+Shift+]",
      click: () => sendToFocused("mp:switch-tab", { dir: 1 }),
    },
    {
      label: "聚焦地址栏",
      accelerator: "CmdOrCtrl+L",
      click: () => sendToFocused("mp:focus-addrbar"),
    },
    { type: "separator" },
    { role: "toggleDevTools" },
  ];
  // #32 Q4：菜单帮助项直达设置页快捷键一节。
  const helpMenu: Electron.MenuItemConstructorOptions = {
    label: "帮助",
    submenu: [{ label: "快捷键", click: () => sendToFocused("mp:show-shortcuts") }],
  };
  const template: Electron.MenuItemConstructorOptions[] =
    process.platform === "darwin"
      ? [
          { role: "appMenu" },
          { role: "fileMenu" },
          { role: "editMenu" },
          { label: "视图", submenu: viewSubmenu },
          { role: "windowMenu" },
          helpMenu,
        ]
      : [
          { role: "fileMenu" },
          { role: "editMenu" },
          { label: "视图", submenu: viewSubmenu },
          { role: "windowMenu" },
          helpMenu,
        ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** #29 页面区右键单项：导航/复制/存图在触发页 guest 上直接执行，只有新标签打开回 renderer。 */
function buildGuestMenuItem(
  cmd: GuestCmd,
  ctx: GuestContext,
  guest: Electron.WebContents,
  win: BrowserWindow,
): Electron.MenuItemConstructorOptions {
  switch (cmd) {
    case "open-link-tab":
      return {
        label: guestMenuLabel(cmd),
        click: () =>
          win.webContents.send("mp:guest-open-tab", {
            url: ctx.linkURL,
            instanceId: webviewInstances.get(guest.id) ?? "",
          }),
      };
    case "copy-link":
      return { label: guestMenuLabel(cmd), click: () => clipboard.writeText(ctx.linkURL) };
    case "save-image":
      // 走同分区 will-download：自动落保存路径、进下载记录、可重试（Q8 白赚下载链）。
      return { label: guestMenuLabel(cmd), click: () => guest.downloadURL(ctx.srcURL) };
    case "copy-selection":
      return { label: guestMenuLabel(cmd), click: () => guest.copy() };
    case "nav-back":
      return {
        label: guestMenuLabel(cmd),
        enabled: guest.canGoBack(),
        click: () => guest.goBack(),
      };
    case "nav-forward":
      return {
        label: guestMenuLabel(cmd),
        enabled: guest.canGoForward(),
        click: () => guest.goForward(),
      };
    case "nav-reload":
      return { label: guestMenuLabel(cmd), click: () => guest.reload() };
  }
}

function createMainWindow(deps: { storePath: string; getSettings: () => Settings }): BrowserWindow {
  const win = new BrowserWindow(createWindowOptions());
  // UA 回退链（ADR-0014）：实例覆盖 → 全局自定义 → 纯 Chrome 伪装。
  // attach 时配对可能未上报（renderer did-attach 先后不定），只按已知算；
  // mp:webview-register 回调里再按完整链重算一次，保证实例覆盖不丢。
  function applyUA(guest: Electron.WebContents, instanceId: string): void {
    try {
      const base = guest.getUserAgent();
      let override: string | undefined;
      if (instanceId) {
        override = loadStore(deps.storePath).instances.find((c) => c.id === instanceId)?.userAgentOverride;
      }
      const ua = resolveUA(override, deps.getSettings().customUA, base);
      if (ua !== base) guest.setUserAgent(ua);
    } catch {
      // 取不到 UA 时不挡后续挂载（window-open 拦截与右键菜单照常装）。
    }
  }
  // 站内全部新窗口请求在此拦截：一律 deny 原生窗口，转界面层开应用内标签/modal。
  // 注意：<webview> 的 new-window 事件自 Electron 22 已移除，必须用 setWindowOpenHandler。
  win.webContents.on("did-attach-webview", (_event, guest) => {
    // 0013 起源：默认 webview UA 带 Electron/应用名尾巴，
    // 知乎等站靠 UA 嗅探直接判“浏览器版本过低”（登录浮层弹窗即中招）。
    // 此处按回退链取值，主标签与浮层弹窗全覆盖；隔离分区不动。
    applyUA(guest, webviewInstances.get(guest.id) ?? "");
    guest.setWindowOpenHandler((details) => {
      win.webContents.send("mp:window-open", {
        url: details.url,
        disposition: details.disposition,
        instanceId: webviewInstances.get(guest.id) ?? "",
      });
      return { action: "deny" };
    });
    // #29：页面区右键接管。导航类在触发页 guest 上直接执行（Q5，无 IPC 往返防切标签竞态）；
    // 只有“在新标签打开”回 renderer（归属触发页实例，Q7）。
    guest.on("context-menu", (_e, params) => {
      const ctx: GuestContext = {
        linkURL: params.linkURL ?? "",
        srcURL: params.srcURL ?? "",
        isImage: params.mediaType === "image",
        hasSelection: (params.selectionText ?? "").trim() !== "",
      };
      const cmds = buildGuestMenuCommands(ctx);
      const navStart = cmds.indexOf("nav-back");
      const items: Electron.MenuItemConstructorOptions[] = [];
      for (let i = 0; i < cmds.length; i++) {
        if (i === navStart && i > 0) items.push({ type: "separator" });
        items.push(buildGuestMenuItem(cmds[i], ctx, guest, win));
      }
      Menu.buildFromTemplate(items).popup({ window: win });
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

  // 标签快照：renderer 变化即推，启动时拉（ADR-0012，sqlite，损坏静默空启动）。
  const tabsDbPath = resolveTabsDbPath(userData);
  ipcMain.handle("tabs:get", () => loadTabsSnapshot(tabsDbPath));
  ipcMain.handle("tabs:set", (_event, snap: TabsSnapshot) => {
    saveTabsSnapshot(tabsDbPath, snap);
  });

  // 书签：renderer 变化即推，启动时拉（#36，sqlite 全量落盘，损坏静默空列表）。
  const bookmarksDbPath = resolveBookmarksDbPath(userData);
  ipcMain.handle("bookmarks:get", () => loadBookmarks(bookmarksDbPath));
  ipcMain.handle("bookmarks:set", (_event, marks: Bookmark[]) => {
    saveBookmarks(bookmarksDbPath, marks);
  });

  // #28：下载记录全量落盘（Q10A）；成功条目“打开所在文件夹”走 shell（Q8）。
  const downloadsDbPath = resolveDownloadsDbPath(userData);
  ipcMain.handle("downloads:get", () => loadDownloadRecords(downloadsDbPath));
  ipcMain.handle("downloads:set", (_event, records: DownloadRecord[]) => {
    saveDownloadRecords(downloadsDbPath, records);
  });
  ipcMain.handle("downloads:show-in-folder", (_event, savePath: string) => {
    shell.showItemInFolder(savePath);
  });
  // P2A：直达所在目录（与 show-in-folder 定位文件不同，这个直接打开文件夹）。
  ipcMain.handle("downloads:open-dir", (_event, savePath: string) => {
    shell.openPath(path.dirname(savePath));
  });

  // renderer 只读存储；上报 webview 与实例的配对（配对落定后按完整 UA 回退链重算一次）。
  ipcMain.handle("store:list", () => loadStore(storePath));
  ipcMain.on("mp:webview-register", (_event, webContentsId: number, instanceId: string) => {
    webviewInstances.set(webContentsId, instanceId);
    try {
      const guest = webContents.fromId(webContentsId);
      if (guest && !guest.isDestroyed()) {
        const store = loadStore(storePath);
        const override = store.instances.find((c) => c.id === instanceId)?.userAgentOverride;
        const base = guest.getUserAgent();
        const ua = resolveUA(override, settings.customUA, base);
        if (ua !== base) guest.setUserAgent(ua);
      }
    } catch {
      // 重算失败不影响配对本身，下次导航 attach 逻辑照常。
    }
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
  // 实例 UA 覆盖：空字串=清除覆盖（恢复跟随全局）；换行/控制字符抛错。
  ipcMain.handle("store:set-user-agent", (_event, instanceId: string, userAgent: string) => {
    const store = loadStore(storePath);
    store.instances = setInstanceUserAgent(store.instances, instanceId, userAgent);
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

  buildAppMenu();
  createMainWindow({ storePath, getSettings: () => settings });

  app.on("activate", () => {    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow({ storePath, getSettings: () => settings });
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
