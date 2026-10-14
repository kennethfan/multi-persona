import fs from "node:fs";
import path from "node:path";
import {
  createDefaultInstances,
  createDefaultProjects,
  wrapProjects,
  type Instance,
  type Project,
} from "./projects";

/**
 * 项目/实例元数据本地持久化（明文 JSON，无加密、无主密码——见 ADR 0002）。
 * 所有函数均接收显式路径/目录，保持纯粹可测；Electron 侧由 main 传入 userData 下路径。
 * ADR-0007：存储为两级 {projects, instances}，会话单元是实例。
 */

/** 存储文件体：新形状（含 instances）；老形状是裸 Project[] 数组。 */
export interface Store {
  version: 1;
  projects: Project[];
  instances: Instance[];
}

/** 由 userData 目录拼出标准存储路径（纯函数，隔离对 electron 的依赖）。 */
export function resolveStorePath(userDataDir: string): string {
  return path.join(userDataDir, "projects.json");
}

/** 旧版容器存储路径（仅用于一次性迁移）。 */
export function resolveLegacyStorePath(userDataDir: string): string {
  return path.join(userDataDir, "containers.json");
}

/** 首次启动的默认存储：5 个空项目，每个带 1 个默认实例。 */
export function createDefaultStore(): Store {
  const projects = createDefaultProjects();
  return { version: 1, projects, instances: createDefaultInstances(projects) };
}

function isStoreShape(parsed: unknown): parsed is Store {
  if (typeof parsed !== "object" || parsed === null) return false;
  const o = parsed as Record<string, unknown>;
  return o["version"] === 1 && Array.isArray(o["projects"]) && Array.isArray(o["instances"]);
}

/**
 * 一次性迁移旧数据，返回迁移结果（调用方可打日志）：
 * - 新文件不存在、旧容器文件存在 → 包层转为新形状（id 与分区名不变，会话零丢失）；
 * - 新文件存在但是项目级老形状（裸数组，T4 重做版）→ 原地包层重写；
 * - 已是新形状 → already-exists；两边都没有 → no-legacy。
 */
export function migrateLegacyStore(userDataDir: string): "migrated" | "wrapped" | "already-exists" | "no-legacy" {
  const next = resolveStorePath(userDataDir);
  if (!fs.existsSync(next)) {
    const legacy = resolveLegacyStorePath(userDataDir);
    if (!fs.existsSync(legacy)) return "no-legacy";
    const parsed: unknown = JSON.parse(fs.readFileSync(legacy, "utf-8"));
    if (!Array.isArray(parsed)) {
      throw new Error(`旧容器存储格式错误: ${legacy}`);
    }
    const wrapped = wrapProjects(parsed as Project[]);
    saveStore(next, { version: 1, ...wrapped });
    return "migrated";
  }
  const parsed: unknown = JSON.parse(fs.readFileSync(next, "utf-8"));
  if (isStoreShape(parsed)) return "already-exists";
  if (!Array.isArray(parsed)) {
    throw new Error(`项目存储格式错误: ${next}`);
  }
  const wrapped = wrapProjects(parsed as Project[]);
  saveStore(next, { version: 1, ...wrapped });
  return "wrapped";
}

/**
 * 读取存储：文件不存在返回默认存储；
 * JSON 损坏时抛错（不静默覆盖，避免丢数据）。
 */
export function loadStore(filePath: string): Store {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return createDefaultStore();
    }
    throw err;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!isStoreShape(parsed)) {
    throw new Error(`项目存储格式错误（请先迁移）: ${filePath}`);
  }
  return parsed;
}

/** 原子感写盘：先写临时文件再重命名，避免崩溃写坏一半。 */
export function saveStore(filePath: string, store: Store): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}
