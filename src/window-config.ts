import type { BrowserWindowConstructorOptions } from "electron";

/** 主窗口默认配置（纯函数，便于单测；T1 占位，后续票扩展）。 */
export function createWindowOptions(): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: "multi-persona",
    webPreferences: {
      // T1 占位页无需 Node 集成；后续票按最小权限重议。
      nodeIntegration: false,
      contextIsolation: true,
    },
  };
}
