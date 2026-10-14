/** 标签页纯状态逻辑（T4；界面渲染在 renderer/app.js）。 */

export interface Tab {
  id: string;
  containerId: string;
  url: string;
}

export interface Split {
  leftContainerId: string;
  rightContainerId: string;
}

export interface TabState {
  tabs: Tab[];
  activeTabId: string | null;
  /** 当前容器：新标签默认归属。 */
  currentContainerId: string;
  split: Split | null;
}

export const BLANK_URL = "about:blank";

/** 初始状态：无标签，当前容器为首个容器。 */
export function createInitialState(firstContainerId: string): TabState {
  if (!firstContainerId) throw new Error("至少需要一个容器");
  return { tabs: [], activeTabId: null, currentContainerId: firstContainerId, split: null };
}

/** 新标签默认归属当前容器；id 由调用方生成。 */
export function openTab(state: TabState, tabId: string, url: string = BLANK_URL): TabState {
  const tab: Tab = { id: tabId, containerId: state.currentContainerId, url };
  return { ...state, tabs: [...state.tabs, tab], activeTabId: tabId };
}

/** 切换当前容器（影响后续新标签的归属，不动已有标签）。 */
export function switchContainer(state: TabState, containerId: string): TabState {
  return { ...state, currentContainerId: containerId };
}

/** 激活标签；id 不存在抛错。 */
export function activateTab(state: TabState, tabId: string): TabState {
  if (!state.tabs.some((t) => t.id === tabId)) throw new Error(`标签不存在: ${tabId}`);
  return { ...state, activeTabId: tabId };
}

/** 关闭标签；关掉的是当前活动标签则激活最后一个剩余标签。 */
export function closeTab(state: TabState, tabId: string): TabState {
  const tabs = state.tabs.filter((t) => t.id !== tabId);
  const activeTabId =
    state.activeTabId === tabId ? (tabs.length > 0 ? tabs[tabs.length - 1].id : null) : state.activeTabId;
  return { ...state, tabs, activeTabId };
}

/** 分屏：两格各绑一个容器（可相同，可不同）。 */
export function setSplit(state: TabState, leftContainerId: string, rightContainerId: string): TabState {
  return { ...state, split: { leftContainerId, rightContainerId } };
}

/** 退出分屏。 */
export function clearSplit(state: TabState): TabState {
  return { ...state, split: null };
}
