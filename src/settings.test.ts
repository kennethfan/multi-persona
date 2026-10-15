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
        onboarded: true,
        sidebarWidth: 200,
        sidebarCollapsed: true,
        bookmarksCollapsed: true,
        customUA: "Custom/1.0",
      }),
    ).toEqual({
      newTabDefault: "ask",
      popupBehavior: "tab",
      conflictNotify: false,
      downloadDir: "/tmp/dl",
      onboarded: true,
      sidebarWidth: 200,
      sidebarCollapsed: true,
      bookmarksCollapsed: true,
      customUA: "Custom/1.0",
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
  it("onboarded 缺字段回 false（老文件直接可用），非布尔回默认", () => {
    expect(withDefaults({}).onboarded).toBe(false);
    expect(
      withDefaults({ onboarded: "yes" } as unknown as Partial<Settings>).onboarded,
    ).toBe(false);
  });
  it("customUA 缺字段回空字串（未设置），非字符串回默认", () => {
    expect(withDefaults({}).customUA).toBe("");
    expect(
      withDefaults({ customUA: 42 } as unknown as Partial<Settings>).customUA,
    ).toBe("");
    expect(withDefaults({ customUA: "Custom/1.0" }).customUA).toBe("Custom/1.0");
  });
  it("sidebarWidth 缺字段回 148，越界钳制 120–400，非数字回默认", () => {
    expect(withDefaults({}).sidebarWidth).toBe(148);
    expect(withDefaults({ sidebarWidth: 50 }).sidebarWidth).toBe(120);
    expect(withDefaults({ sidebarWidth: 900 }).sidebarWidth).toBe(400);
    expect(
      withDefaults({ sidebarWidth: "wide" } as unknown as Partial<Settings>).sidebarWidth,
    ).toBe(148);
  });
  it("sidebarCollapsed 缺字段回 false，非 true 一律 false", () => {
    expect(withDefaults({}).sidebarCollapsed).toBe(false);
    expect(withDefaults({ sidebarCollapsed: true }).sidebarCollapsed).toBe(true);
  });
  it("bookmarksCollapsed 缺字段回 false（默认展开），非 true 一律 false", () => {
    expect(withDefaults({}).bookmarksCollapsed).toBe(false);
    expect(withDefaults({ bookmarksCollapsed: true }).bookmarksCollapsed).toBe(true);
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
