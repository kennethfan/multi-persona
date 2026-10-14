/**
 * 容器↔会话分区映射（纯函数）。
 * 每个容器绑定一个独立的 Electron 持久化分区 `persist:mp-<容器id>`：
 * 同一容器内所有视图共享同一会话；不同容器互不串号；重启后登录态保留。
 * 分区清理（删容器时）在 T5 做。
 */

/** 分区名前缀，与 Electron 默认分区隔离。 */
export const PARTITION_PREFIX = "persist:mp-";

/** 容器 id → 专属持久化分区名。空 id 抛错（避免误用默认分区串号）。 */
export function partitionFor(containerId: string): string {
  if (!containerId) {
    throw new Error("容器 id 为空，拒绝映射到共享分区");
  }
  return `${PARTITION_PREFIX}${containerId}`;
}

/** 从分区名反查容器 id；非本应用分区返回 undefined。 */
export function containerIdFromPartition(partition: string): string | undefined {
  if (!partition.startsWith(PARTITION_PREFIX)) return undefined;
  const id = partition.slice(PARTITION_PREFIX.length);
  return id ? id : undefined;
}
