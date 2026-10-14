import { describe, expect, it } from "vitest";
import {
  activateTab,
  clearSplit,
  closeTab,
  createInitialState,
  openTab,
  setSplit,
  switchInstance,
} from "./tabs";

describe("标签页状态", () => {
  it("新标签默认归属当前实例", () => {
    let s = createInitialState("default-1-i1");
    s = openTab(s, "t-1");
    expect(s.tabs[0].instanceId).toBe("default-1-i1");
    expect(s.activeTabId).toBe("t-1");
  });

  it("切换当前实例只影响后续新标签", () => {
    let s = createInitialState("default-1-i1");
    s = openTab(s, "t-1");
    s = switchInstance(s, "default-1-i2");
    s = openTab(s, "t-2");
    expect(s.tabs[0].instanceId).toBe("default-1-i1");
    expect(s.tabs[1].instanceId).toBe("default-1-i2");
  });

  it("激活不存在的标签抛错；关闭活动标签后激活最后一个", () => {
    let s = createInitialState("default-1-i1");
    s = openTab(s, "t-1");
    s = openTab(s, "t-2");
    expect(() => activateTab(s, "nope")).toThrow();
    s = closeTab(s, "t-2");
    expect(s.activeTabId).toBe("t-1");
    s = closeTab(s, "t-1");
    expect(s.activeTabId).toBeNull();
  });

  it("分屏绑定两个已存在的标签（可跨实例），可退出；引用不存在的标签抛错", () => {
    let s = createInitialState("default-1-i1");
    s = openTab(s, "t-1");
    s = switchInstance(s, "default-2-i1");
    s = openTab(s, "t-2");
    s = setSplit(s, "t-1", "t-2");
    expect(s.split).toEqual({ leftTabId: "t-1", rightTabId: "t-2" });
    expect(() => setSplit(s, "t-1", "nope")).toThrow();
    s = clearSplit(s);
    expect(s.split).toBeNull();
  });

  it("关闭分屏中的标签则一并退出分屏", () => {
    let s = createInitialState("default-1-i1");
    s = openTab(s, "t-1");
    s = openTab(s, "t-2");
    s = setSplit(s, "t-1", "t-2");
    s = closeTab(s, "t-1");
    expect(s.split).toBeNull();
  });

  it("空实例 id 建初始状态抛错", () => {
    expect(() => createInitialState("")).toThrow();
  });
});
