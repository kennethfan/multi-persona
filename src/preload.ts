import { contextBridge, ipcRenderer } from "electron";
import type { Store } from "./project-store";
import type { Settings } from "./settings";
import type { TabsSnapshot } from "./tabs-db";

/** 站内新窗口请求（主进程经 setWindowOpenHandler 拦截后转发）。 */
export interface WindowOpenRequest {
  url: string;
  disposition: string;
  /** 发起页所属实例；未知时为空字符串，界面层回退到当前实例。 */
  instanceId: string;
}

/** renderer 唯一可用的宿主能力。 */
export interface MpAPI {
  listStore(): Promise<Store>;
  /** 注册 webview 与实例的配对（webview did-attach 后上报 getWebContentsId）。 */
  registerWebview(webContentsId: number, instanceId: string): void;
  onWindowOpen(handler: (req: WindowOpenRequest) => void): void;
  /** 删实例：主进程先清该实例分区存储再删元数据。界面层必须先二次确认再调。 */
  removeInstance(instanceId: string): Promise<Store>;
  /** 只清某实例网络缓存（登录态保留）。返回被清分区名。 */
  clearCache(instanceId: string): Promise<string>;
  /** 清某实例全部站点数据（掉登录，保留元数据）。返回被清分区名。 */
  clearData(instanceId: string): Promise<string>;
  /** 手工标注实例的站点账号（空字串=清除标注）。 */
  setLabel(instanceId: string, label: string): Promise<Store>;
  /** 设实例专属下载目录（空字串=清除覆盖，恢复跟随全局）。 */
  setDownloadDir(instanceId: string, dir: string): Promise<Store>;
  /** 系统目录选择器（取消返回 null）。 */
  pickDirectory(defaultPath?: string): Promise<string | null>;
  /** 系统默认下载目录（展示“当前生效目录”用）。 */
  systemDownloadDir(): Promise<string>;
  /** 下载成功提示（主进程 will-download 完成时推送）。 */
  onToast(handler: (text: string) => void): void;
  /** 同一账号出现在 ≥2 实例即返回（全局语义，不分是否同项目）。 */
  duplicateLabels(): Promise<{ label: string; instanceIds: string[] }[]>;
  /** 存储变更通知（删实例/改标注后），界面层重拉存储并重绘。 */
  onStoreChanged(handler: () => void): void;
  /** 新建项目（主进程顺带建 1 个默认实例）。 */
  addProject(name: string, color: string): Promise<Store>;
  /** 新建实例；所属项目不存在时抛错。 */
  addInstance(projectId: string, name: string, color: string): Promise<Store>;
  /** 改名（项目/实例）。 */
  renameNode(kind: "project" | "instance", id: string, name: string): Promise<Store>;
  /** 改色（项目/实例）。 */
  recolorNode(kind: "project" | "instance", id: string, color: string): Promise<Store>;
  /** 删项目：主进程逐实例先清分区再删元数据。界面层必须先二次确认再调。 */
  removeProject(projectId: string): Promise<Store>;
  /** 系统原生确认框（dialog，跨平台）。 */
  confirm(opts: { message: string; detail?: string; okLabel?: string }): Promise<boolean>;
  /** 上报左栏树右键，主进程弹系统原生菜单。 */
  showContextMenu(kind: "project" | "instance" | "sidebar", id: string, x: number, y: number): void;
  /** 菜单命令回传。 */
  onMenuCommand(handler: (cmd: { cmd: string; kind: "project" | "instance" | "sidebar"; id: string }) => void): void;
  /** 读应用级设置（内存值）。 */
  getSettings(): Promise<Settings>;
  /** 读标签快照（损坏返回空快照，界面层静默空启动）。 */
  getTabsSnapshot(): Promise<TabsSnapshot>;
  /** 写标签快照（全量覆盖；失败静默忽略）。 */
  setTabsSnapshot(snap: TabsSnapshot): Promise<void>;
  /** Cmd+R：主进程应用菜单转发，界面层只重载当前活动标签（ADR-0011）。 */
  onReloadActiveTab(handler: () => void): void;
  /** 写应用级设置（合并回填后落盘，返回生效值）。 */
  setSettings(patch: Partial<Settings>): Promise<Settings>;
}

contextBridge.exposeInMainWorld("mpAPI", {
  listStore: (): Promise<Store> => ipcRenderer.invoke("store:list"),
  registerWebview: (webContentsId: number, instanceId: string): void => {
    ipcRenderer.send("mp:webview-register", webContentsId, instanceId);
  },
  onWindowOpen: (handler: (req: WindowOpenRequest) => void): void => {
    ipcRenderer.on("mp:window-open", (_e, req: WindowOpenRequest) => handler(req));
  },
  removeInstance: (instanceId: string): Promise<Store> =>
    ipcRenderer.invoke("store:remove-instance", instanceId),
  clearCache: (instanceId: string): Promise<string> =>
    ipcRenderer.invoke("store:clear-cache", instanceId),
  clearData: (instanceId: string): Promise<string> =>
    ipcRenderer.invoke("store:clear-data", instanceId),
  setLabel: (instanceId: string, label: string): Promise<Store> =>
    ipcRenderer.invoke("store:set-label", instanceId, label),
  setDownloadDir: (instanceId: string, dir: string): Promise<Store> =>
    ipcRenderer.invoke("store:set-download-dir", instanceId, dir),
  pickDirectory: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke("dialog:pick-directory", defaultPath),
  systemDownloadDir: (): Promise<string> => ipcRenderer.invoke("downloads:system-dir"),
  duplicateLabels: (): Promise<{ label: string; instanceIds: string[] }[]> =>
    ipcRenderer.invoke("store:duplicate-labels"),
  onStoreChanged: (handler: () => void): void => {
    ipcRenderer.on("mp:store-changed", () => handler());
  },
  onToast: (handler: (text: string) => void): void => {
    ipcRenderer.on("mp:toast", (_e, text: string) => handler(text));
  },
  addProject: (name: string, color: string): Promise<Store> =>
    ipcRenderer.invoke("store:add-project", name, color),
  addInstance: (projectId: string, name: string, color: string): Promise<Store> =>
    ipcRenderer.invoke("store:add-instance", projectId, name, color),
  renameNode: (kind: "project" | "instance", id: string, name: string): Promise<Store> =>
    ipcRenderer.invoke("store:rename", kind, id, name),
  recolorNode: (kind: "project" | "instance", id: string, color: string): Promise<Store> =>
    ipcRenderer.invoke("store:recolor", kind, id, color),
  removeProject: (projectId: string): Promise<Store> =>
    ipcRenderer.invoke("store:remove-project", projectId),
  confirm: (opts: { message: string; detail?: string; okLabel?: string }): Promise<boolean> =>
    ipcRenderer.invoke("ui:confirm", opts),
  showContextMenu: (kind: "project" | "instance", id: string, x: number, y: number): void => {
    ipcRenderer.send("mp:context-menu", { kind, id, x, y });
  },
  onMenuCommand: (
    handler: (cmd: { cmd: string; kind: "project" | "instance"; id: string }) => void,
  ): void => {
    ipcRenderer.on("mp:menu-cmd", (_e, cmd) => handler(cmd));
  },
  getSettings: (): Promise<Settings> => ipcRenderer.invoke("settings:get"),
  onReloadActiveTab: (handler: () => void): void => {
    ipcRenderer.on("mp:reload-active-tab", () => handler());
  },
  setSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke("settings:set", patch),
  getTabsSnapshot: (): Promise<TabsSnapshot> => ipcRenderer.invoke("tabs:get"),
  setTabsSnapshot: (snap: TabsSnapshot): Promise<void> => ipcRenderer.invoke("tabs:set", snap),
} satisfies MpAPI);
