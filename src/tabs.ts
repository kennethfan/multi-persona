/** 标签页纯状态逻辑（实例模型：标签归属实例；渲染在 renderer/app.js）。 */

export interface Tab {
  id: string;
  instanceId: string;
  url: string;
}

/** 分屏：两格各绑一个标签页 id（可同实例、可跨实例）。 */
export interface Split {
  leftTabId: string;
  rightTabId: string;
}

export interface TabState {
  tabs: Tab[];
  activeTabId: string | null;
  /** 当前实例：左栏选中，新标签默认归属。 */
  currentInstanceId: string;
  split: Split | null;
}

export const BLANK_URL = "about:blank";

/** 初始状态：无标签，当前实例为传入实例。 */
export function createInitialState(firstInstanceId: string): TabState {
  if (!firstInstanceId) throw new Error("至少需要一个实例");
  return { tabs: [], activeTabId: null, currentInstanceId: firstInstanceId, split: null };
}

/** 新标签默认归属当前实例；id 由调用方生成。 */
export function openTab(state: TabState, tabId: string, url: string = BLANK_URL): TabState {
  const tab: Tab = { id: tabId, instanceId: state.currentInstanceId, url };
  return { ...state, tabs: [...state.tabs, tab], activeTabId: tabId };
}

/** 切换当前实例（影响后续新标签的归属，不动已有标签）。 */
export function switchInstance(state: TabState, instanceId: string): TabState {
  return { ...state, currentInstanceId: instanceId };
}

/** 激活标签；id 不存在抛错。 */
export function activateTab(state: TabState, tabId: string): TabState {
  if (!state.tabs.some((t) => t.id === tabId)) throw new Error(`标签不存在: ${tabId}`);
  return { ...state, activeTabId: tabId };
}

/** 关闭标签；关掉的是当前活动标签则激活最后一个剩余标签；分屏引用到它则一并退出分屏。 */
export function closeTab(state: TabState, tabId: string): TabState {
  const tabs = state.tabs.filter((t) => t.id !== tabId);
  const activeTabId =
    state.activeTabId === tabId ? (tabs.length > 0 ? tabs[tabs.length - 1].id : null) : state.activeTabId;
  const split =
    state.split && (state.split.leftTabId === tabId || state.split.rightTabId === tabId)
      ? null
      : state.split;
  return { ...state, tabs, activeTabId, split };
}

/** 分屏：两格绑定两个已存在的标签页；id 不存在抛错。 */
export function setSplit(state: TabState, leftTabId: string, rightTabId: string): TabState {
  for (const id of [leftTabId, rightTabId]) {
    if (!state.tabs.some((t) => t.id === id)) throw new Error(`标签不存在: ${id}`);
  }
  return { ...state, split: { leftTabId, rightTabId } };
}

/** 退出分屏。 */
export function clearSplit(state: TabState): TabState {
  return { ...state, split: null };
}
