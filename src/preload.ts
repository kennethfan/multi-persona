import { contextBridge, ipcRenderer } from "electron";
import type { Store } from "./project-store";

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
  /** 手工标注实例的站点账号（空字串=清除标注）。 */
  setLabel(instanceId: string, label: string): Promise<Store>;
  /** 同一账号出现在 ≥2 实例即返回（全局语义，不分是否同项目）。 */
  duplicateLabels(): Promise<{ label: string; instanceIds: string[] }[]>;
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
  setLabel: (instanceId: string, label: string): Promise<Store> =>
    ipcRenderer.invoke("store:set-label", instanceId, label),
  duplicateLabels: (): Promise<{ label: string; instanceIds: string[] }[]> =>
    ipcRenderer.invoke("store:duplicate-labels"),
} satisfies MpAPI);
