import { describe, expect, it } from "vitest";
import {
  activateTab,
  clearSplit,
  closeTab,
  createInitialState,
  openTab,
  setSplit,
  switchContainer,
} from "./tabs";

describe("标签页状态", () => {
  it("新标签默认归属当前容器", () => {
    let s = createInitialState("default-1");
    s = openTab(s, "t-1");
    expect(s.tabs[0].containerId).toBe("default-1");
    expect(s.activeTabId).toBe("t-1");
  });

  it("切换当前容器只影响后续新标签", () => {
    let s = createInitialState("default-1");
    s = openTab(s, "t-1");
    s = switchContainer(s, "default-2");
    s = openTab(s, "t-2");
    expect(s.tabs[0].containerId).toBe("default-1");
    expect(s.tabs[1].containerId).toBe("default-2");
  });

  it("激活不存在的标签抛错；关闭活动标签后激活最后一个", () => {
    let s = createInitialState("default-1");
    s = openTab(s, "t-1");
    s = openTab(s, "t-2");
    expect(() => activateTab(s, "nope")).toThrow();
    s = closeTab(s, "t-2");
    expect(s.activeTabId).toBe("t-1");
    s = closeTab(s, "t-1");
    expect(s.activeTabId).toBeNull();
  });

  it("分屏两格可绑定不同容器，可退出", () => {
    let s = createInitialState("default-1");
    s = setSplit(s, "default-1", "default-2");
    expect(s.split).toEqual({ leftContainerId: "default-1", rightContainerId: "default-2" });
    s = clearSplit(s);
    expect(s.split).toBeNull();
  });

  it("空容器 id 建初始状态抛错", () => {
    expect(() => createInitialState("")).toThrow();
  });
});
