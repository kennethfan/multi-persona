/** 容器元数据（纯数据；会话隔离见 T3，会话清除见 T5）。 */
export interface Container {
  id: string;
  /** 展示名，同一列表内不强制唯一。 */
  name: string;
  /** 标识颜色，CSS 颜色字符串。 */
  color: string;
}

/** 首次启动预置的 5 个空容器：名字与颜色各不相同。 */
export function createDefaultContainers(): Container[] {
  return [
    { id: "default-1", name: "工作", color: "#3b82f6" },
    { id: "default-2", name: "生活", color: "#22c55e" },
    { id: "default-3", name: "测试", color: "#f59e0b" },
    { id: "default-4", name: "备用 1", color: "#a855f7" },
    { id: "default-5", name: "备用 2", color: "#ef4444" },
  ];
}

/** 新增容器；id 重复时抛错（调用方负责生成唯一 id）。 */
export function addContainer(list: Container[], container: Container): Container[] {
  if (list.some((c) => c.id === container.id)) {
    throw new Error(`容器 id 已存在: ${container.id}`);
  }
  return [...list, { ...container }];
}

/** 重命名；id 不存在时抛错。 */
export function renameContainer(list: Container[], id: string, name: string): Container[] {
  let found = false;
  const next = list.map((c) => {
    if (c.id !== id) return c;
    found = true;
    return { ...c, name };
  });
  if (!found) throw new Error(`容器不存在: ${id}`);
  return next;
}

/** 改色；id 不存在时抛错。 */
export function recolorContainer(list: Container[], id: string, color: string): Container[] {
  let found = false;
  const next = list.map((c) => {
    if (c.id !== id) return c;
    found = true;
    return { ...c, color };
  });
  if (!found) throw new Error(`容器不存在: ${id}`);
  return next;
}

/**
 * 删除容器元数据（幂等：id 不存在时原样返回）。
 * 分区会话数据的清除在 T5 做，二次确认在 T4 的界面层做。
 */
export function removeContainer(list: Container[], id: string): Container[] {
  return list.filter((c) => c.id !== id);
}

/** 按 id 查找，不存在返回 undefined。 */
export function getContainer(list: Container[], id: string): Container | undefined {
  return list.find((c) => c.id === id);
}
