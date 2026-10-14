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
}

contextBridge.exposeInMainWorld("mpAPI", {
  listStore: (): Promise<Store> => ipcRenderer.invoke("store:list"),
  registerWebview: (webContentsId: number, instanceId: string): void => {
    ipcRenderer.send("mp:webview-register", webContentsId, instanceId);
  },
  onWindowOpen: (handler: (req: WindowOpenRequest) => void): void => {
    ipcRenderer.on("mp:window-open", (_e, req: WindowOpenRequest) => handler(req));
  },
} satisfies MpAPI);
