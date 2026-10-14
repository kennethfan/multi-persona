import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_SETTINGS, loadSettingsFile, saveSettingsFile, withDefaults } from "./settings";
import type { Settings } from "./settings";

describe("withDefaults", () => {
  it("空对象回填全部默认值", () => {
    expect(withDefaults({})).toEqual(DEFAULT_SETTINGS);
  });
  it("合法值原样保留", () => {
    expect(
      withDefaults({
        newTabDefault: "ask",
        popupBehavior: "tab",
        conflictNotify: false,
        downloadDir: "/tmp/dl",
      }),
    ).toEqual({
      newTabDefault: "ask",
      popupBehavior: "tab",
      conflictNotify: false,
      downloadDir: "/tmp/dl",
    });
  });
  it("非法值回退默认", () => {
    expect(
      withDefaults({ newTabDefault: "xxx", popupBehavior: "yyy" } as unknown as Partial<
        typeof DEFAULT_SETTINGS
      >),
    ).toEqual(DEFAULT_SETTINGS);
  });
  it("downloadDir 缺字段回空字串（跟随系统默认），老文件直接可用", () => {
    expect(withDefaults({})).toEqual({ ...DEFAULT_SETTINGS, downloadDir: "" });
  });
  it("downloadDir 非字符串回默认", () => {
    expect(withDefaults({ downloadDir: 42 } as unknown as Partial<Settings>).downloadDir).toBe(
      "",
    );
  });
});

describe("settings file", () => {
  it("缺失文件回默认", () => {
    expect(loadSettingsFile(path.join(os.tmpdir(), "mp-no-such-file.json"))).toEqual(
      DEFAULT_SETTINGS,
    );
  });
  it("损坏 JSON 回默认不抛错", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mp-settings-"));
    const file = path.join(dir, "settings.json");
    fs.writeFileSync(file, "{ broken", "utf-8");
    expect(loadSettingsFile(file)).toEqual(DEFAULT_SETTINGS);
  });
  it("写入后读回一致，缺字段回填", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mp-settings-"));
    const file = path.join(dir, "settings.json");
    fs.writeFileSync(file, JSON.stringify({ popupBehavior: "tab" }), "utf-8");
    saveSettingsFile(file, loadSettingsFile(file));
    expect(loadSettingsFile(file)).toEqual({ ...DEFAULT_SETTINGS, popupBehavior: "tab" });
  });
});
