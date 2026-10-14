/**
 * 实例↔会话分区映射（纯函数）。
 * 每个实例绑定一个独立的 Electron 持久化分区 `persist:mp-<实例id>`：
 * 同一实例内所有视图共享同一会话；不同实例互不串号；重启后登录态保留。
 * 分区清理（删实例时）在 T5 做。
 */

/** 分区名前缀，与 Electron 默认分区隔离。 */
export const PARTITION_PREFIX = "persist:mp-";

/** 实例 id → 专属持久化分区名。空 id 抛错（避免误用默认分区串号）。 */
export function partitionFor(instanceId: string): string {
  if (!instanceId) {
    throw new Error("实例 id 为空，拒绝映射到共享分区");
  }
  return `${PARTITION_PREFIX}${instanceId}`;
}

/** 从分区名反查实例 id；非本应用分区返回 undefined。 */
export function instanceIdFromPartition(partition: string): string | undefined {
  if (!partition.startsWith(PARTITION_PREFIX)) return undefined;
  const id = partition.slice(PARTITION_PREFIX.length);
  return id ? id : undefined;
}

/**
 * Electron.Session 用到的最小形状。
 * 传参而非直接 import Electron——Vitest 里没有 Electron 运行时，
 * 测试传 mock 即可；主进程传真正的 session。
 */
export interface ClearableStorage {
  clearStorageData(options?: Record<string, unknown>): Promise<void>;
}

/**
 * 清空某实例分区的全部存储（含登录态）。
 * 返回被清的分区名；空 id 直接抛错且不动任何存储。
 */
export async function wipeInstanceStorage(
  ses: ClearableStorage,
  instanceId: string,
): Promise<string> {
  const partition = partitionFor(instanceId);
  await ses.clearStorageData();
  return partition;
}
