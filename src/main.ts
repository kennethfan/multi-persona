import { app, BrowserWindow } from "electron";
import path from "node:path";
import { createWindowOptions } from "./window-config";

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow(createWindowOptions());
  // T1 占位页：静态 HTML，后续票替换为真实 UI。
  void win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  return win;
}

void app.whenReady().then(() => {
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
