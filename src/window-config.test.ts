import { describe, expect, it } from "vitest";
import { createWindowOptions } from "./window-config";

describe("createWindowOptions", () => {
  it("返回可用的默认窗口尺寸与安全基线", () => {
    const opts = createWindowOptions();
    expect(opts.width).toBe(1280);
    expect(opts.height).toBe(800);
    expect(opts.webPreferences?.nodeIntegration).toBe(false);
    expect(opts.webPreferences?.contextIsolation).toBe(true);
    expect(opts.webPreferences?.webviewTag).toBe(true);
    expect(opts.webPreferences?.preload).toMatch(/preload\.js$/);
  });
});
