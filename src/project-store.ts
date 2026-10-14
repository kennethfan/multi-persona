import fs from "node:fs";
import path from "node:path";
import { createDefaultContainers, type Container } from "./containers";

/**
 * 容器元数据本地持久化（明文 JSON，无加密、无主密码——见 ADR 0002）。
 * 所有函数均接收显式 filePath，保持纯粹可测；Electron 侧由 main 传入 userData 下路径。
 */

/** 由 userData 目录拼出标准存储路径（纯函数，隔离对 electron 的依赖）。 */
export function resolveStorePath(userDataDir: string): string {
  return path.join(userDataDir, "containers.json");
}

/**
 * 读取容器列表：文件不存在返回 5 个预置空容器；
 * JSON 损坏时抛错（不静默覆盖，避免丢数据）。
 */
export function loadContainers(filePath: string): Container[] {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return createDefaultContainers();
    }
    throw err;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`容器存储格式错误: ${filePath}`);
  }
  return parsed as Container[];
}

/** 原子感写盘：先写临时文件再重命名，避免崩溃写坏一半。 */
export function saveContainers(filePath: string, list: Container[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(list, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}
