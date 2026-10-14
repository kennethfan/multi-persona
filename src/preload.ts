import { contextBridge, ipcRenderer } from "electron";
import type { Container } from "./containers";

/** renderer 唯一可用的宿主能力：只读容器列表（T4）。 */
export interface MpAPI {
  listContainers(): Promise<Container[]>;
}

contextBridge.exposeInMainWorld("mpAPI", {
  listContainers: (): Promise<Container[]> => ipcRenderer.invoke("containers:list"),
} satisfies MpAPI);
