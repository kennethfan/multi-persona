/**
 * 项目（分组）与实例（会话单元）元数据（纯数据；会话隔离见 sessions，分区清除见 T5）。
 * ADR-0007：隔离单元从项目下沉到实例，项目只做分组。
 */
export interface Project {
  id: string;
  /** 展示名，同一列表内不强制唯一。 */
  name: string;
  /** 标识颜色，CSS 颜色字符串。 */
  color: string;
}

export interface Instance {
  id: string;
  /** 所属项目 id。 */
  projectId: string;
  /** 展示名，同一项目内不强制唯一。 */
  name: string;
  /** 标识颜色，CSS 颜色字符串。 */
  color: string;
  /** 手工标注的站点账号（如“Gmail 的 a@gmail.com”）；缺失或空白=未标注。 */
  label?: string;
}

/** 首次启动预置的 5 个空项目：名字与颜色各不相同。 */
export function createDefaultProjects(): Project[] {
  return [
    { id: "default-1", name: "项目一", color: "#3b82f6" },
    { id: "default-2", name: "项目二", color: "#22c55e" },
    { id: "default-3", name: "项目三", color: "#f59e0b" },
    { id: "default-4", name: "项目四", color: "#a855f7" },
    { id: "default-5", name: "项目五", color: "#ef4444" },
  ];
}

/** 每个预置项目带 1 个默认实例（开箱即用，颜色继承项目）。 */
export function createDefaultInstances(projects: Project[]): Instance[] {
  return projects.map((p) => ({
    id: `${p.id}-i1`,
    projectId: p.id,
    name: "实例一",
    color: p.color,
  }));
}

/** 新增项目；id 重复时抛错（调用方负责生成唯一 id）。 */
export function addProject(list: Project[], project: Project): Project[] {
  if (list.some((c) => c.id === project.id)) {
    throw new Error(`项目 id 已存在: ${project.id}`);
  }
  return [...list, { ...project }];
}

/** 重命名；id 不存在时抛错。 */
export function renameProject(list: Project[], id: string, name: string): Project[] {
  let found = false;
  const next = list.map((c) => {
    if (c.id !== id) return c;
    found = true;
    return { ...c, name };
  });
  if (!found) throw new Error(`项目不存在: ${id}`);
  return next;
}

/** 改色；id 不存在时抛错。 */
export function recolorProject(list: Project[], id: string, color: string): Project[] {
  let found = false;
  const next = list.map((c) => {
    if (c.id !== id) return c;
    found = true;
    return { ...c, color };
  });
  if (!found) throw new Error(`项目不存在: ${id}`);
  return next;
}

/**
 * 删除项目元数据（幂等：id 不存在时原样返回）。
 * 级联删除其下实例见 removeProjectCascade；分区会话数据的清除在 T5 做，二次确认在界面层做。
 */
export function removeProject(list: Project[], id: string): Project[] {
  return list.filter((c) => c.id !== id);
}

/** 按 id 查找，不存在返回 undefined。 */
export function getProject(list: Project[], id: string): Project | undefined {
  return list.find((c) => c.id === id);
}

/** 新增实例；id 重复时抛错。所属项目是否存在由调用方保证（纯函数不跨表校验）。 */
export function addInstance(list: Instance[], instance: Instance): Instance[] {
  if (list.some((c) => c.id === instance.id)) {
    throw new Error(`实例 id 已存在: ${instance.id}`);
  }
  return [...list, { ...instance }];
}

/** 实例重命名；id 不存在时抛错。 */
export function renameInstance(list: Instance[], id: string, name: string): Instance[] {
  let found = false;
  const next = list.map((c) => {
    if (c.id !== id) return c;
    found = true;
    return { ...c, name };
  });
  if (!found) throw new Error(`实例不存在: ${id}`);
  return next;
}

/** 实例改色；id 不存在时抛错。 */
export function recolorInstance(list: Instance[], id: string, color: string): Instance[] {
  let found = false;
  const next = list.map((c) => {
    if (c.id !== id) return c;
    found = true;
    return { ...c, color };
  });
  if (!found) throw new Error(`实例不存在: ${id}`);
  return next;
}

/** 手工标注实例承载的站点账号；id 不存在时抛错。空字串=清除标注。 */
export function setInstanceLabel(list: Instance[], id: string, label: string): Instance[] {
  let found = false;
  const next = list.map((c) => {
    if (c.id !== id) return c;
    found = true;
    return { ...c, label };
  });
  if (!found) throw new Error(`实例不存在: ${id}`);
  return next;
}

/**
 * 同一站点账号出现在 ≥2 实例即报（ADR-0007 全局语义，不分是否同项目）。
 * 空白标注视为未标注，不参与比较；label 原样比对，不做大小写归一。
 */
export function findDuplicateLabels(list: Instance[]): { label: string; instanceIds: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const inst of list) {
    const label = (inst.label ?? "").trim();
    if (!label) continue;
    const ids = groups.get(label);
    if (ids) ids.push(inst.id);
    else groups.set(label, [inst.id]);
  }
  return [...groups.entries()]
    .filter(([, ids]) => ids.length >= 2)
    .map(([label, instanceIds]) => ({ label, instanceIds }));
}

/** 删除实例元数据（幂等）。分区清除在 T5 做，二次确认在界面层做。 */
export function removeInstance(list: Instance[], id: string): Instance[] {
  return list.filter((c) => c.id !== id);
}

/** 按 id 查找实例，不存在返回 undefined。 */
export function getInstance(list: Instance[], id: string): Instance | undefined {
  return list.find((c) => c.id === id);
}

/** 取某项目下的全部实例（按原顺序）。 */
export function instancesOfProject(list: Instance[], projectId: string): Instance[] {
  return list.filter((c) => c.projectId === projectId);
}

/** 级联删除项目及其下全部实例（幂等）。 */
export function removeProjectCascade(
  projects: Project[],
  instances: Instance[],
  projectId: string,
): { projects: Project[]; instances: Instance[] } {
  return {
    projects: removeProject(projects, projectId),
    instances: instances.filter((c) => c.projectId !== projectId),
  };
}

/**
 * 包层迁移（ADR-0007）：项目级老数据（每个项目即会话单元）转为分组，
 * 每个老项目自动获得 1 个默认实例并沿用老 id（分区名不变，会话零丢失）。
 */
export function wrapProjects(projects: Project[]): { projects: Project[]; instances: Instance[] } {
  return {
    projects: projects.map((p) => ({ ...p })),
    instances: projects.map((p) => ({
      id: p.id,
      projectId: p.id,
      name: "默认实例",
      color: p.color,
    })),
  };
}
