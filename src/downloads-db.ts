/**
 * 下载记录 sqlite 持久化（#28，Q10A 全量落盘）：node:sqlite 内置 DatabaseSync，零新依赖。
 * 主进程调用；损坏或缺失一律返回空数组（静默空启动），落盘失败静默忽略（不影响当前会话）。
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export type DownloadState = "active" | "completed" | "cancelled" | "interrupted";

export interface DownloadRecord {
  /** 保存路径，天然唯一（decideDownloadPath 已做重名序号）。 */
  key: string;
  /** 发起 URL（重试重下用；过期链接重试会再失败，见 Q12）。 */
  url: string;
  filename: string;
  savePath: string;
  instanceId: string;
  state: DownloadState;
  /** 发起时间（epoch ms），列表按它倒序。 */
  time: number;
  /** 已收字节（内存态为主，落盘只存快照；P1 进度条用）。 */
  receivedBytes?: number;
  /** 总字节（≤0=未知，界面层降级为文字；P1）。 */
  totalBytes?: number;
}

/** 由 userData 目录拼出下载记录库路径（纯函数，隔离对 electron 的依赖）。 */
export function resolveDownloadsDbPath(userDataDir: string): string {
  return path.join(userDataDir, "downloads.db");
}

function migrate(db: DatabaseSync): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS downloads (
       key TEXT PRIMARY KEY,
       url TEXT NOT NULL,
       filename TEXT NOT NULL,
       save_path TEXT NOT NULL,
       instance_id TEXT NOT NULL,
       state TEXT NOT NULL,
       time INTEGER NOT NULL
     );`,
  );
  // P1 进度字段：老库无列时补列（已存在则抛错忽略，保证幂等）。
  for (const col of ["received_bytes INTEGER NOT NULL DEFAULT 0", "total_bytes INTEGER NOT NULL DEFAULT 0"]) {
    try {
      db.exec(`ALTER TABLE downloads ADD COLUMN ${col}`);
    } catch {
      // 列已存在
    }
  }
}

function readRecords(db: DatabaseSync): DownloadRecord[] {
  const rows = db
    .prepare(
      "SELECT key, url, filename, save_path AS savePath, instance_id AS instanceId, state, time, received_bytes AS receivedBytes, total_bytes AS totalBytes FROM downloads ORDER BY time DESC",
    )
    .all() as unknown as DownloadRecord[];
  return rows.map((r) => ({
    key: r.key,
    url: r.url,
    filename: r.filename,
    savePath: r.savePath,
    instanceId: r.instanceId,
    state: r.state,
    time: r.time,
    receivedBytes: r.receivedBytes ?? 0,
    totalBytes: r.totalBytes ?? 0,
  }));
}

/** 读取记录：文件缺失或损坏返回空数组（不抛错，保证应用可启动）。 */
export function loadDownloadRecords(dbPath: string): DownloadRecord[] {
  if (!fs.existsSync(dbPath)) return [];
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    return readRecords(db);
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

/** 全量覆盖写记录：事务内先清后插；失败静默忽略。 */
export function saveDownloadRecords(dbPath: string, records: DownloadRecord[]): void {
  let db: DatabaseSync | null = null;
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new DatabaseSync(dbPath);
    migrate(db);
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM downloads").run();
      const insert = db.prepare(
        "INSERT INTO downloads (key, url, filename, save_path, instance_id, state, time, received_bytes, total_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      records.forEach((r) =>
        insert.run(r.key, r.url, r.filename, r.savePath, r.instanceId, r.state, r.time, r.receivedBytes ?? 0, r.totalBytes ?? 0),
      );
      db.exec("COMMIT");
    } catch (inner) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // 回滚失败无能为力，下次全量覆盖写修复
      }
      throw inner;
    }
  } catch {
    // 落盘失败不影响当前会话
  } finally {
    db?.close();
  }
}
