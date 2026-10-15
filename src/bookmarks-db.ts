/**
 * 书签 sqlite 持久化（#36，Q1–Q8）：node:sqlite 内置 DatabaseSync，零新依赖。
 * 主进程调用；损坏或缺失一律返回空数组（静默空列表），落盘失败静默忽略（不影响当前会话）。
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export interface Bookmark {
  /** URL 本身，天然唯一（toggle/去重键）。 */
  key: string;
  url: string;
  /** 收藏时标签页标题；取不到回退 URL（Q8）。 */
  title: string;
  /** 归属实例；点开时在原实例新标签打开，已删回退当前实例（Q4）。 */
  instanceId: string;
  /** 收藏时间（epoch ms），列表按它倒序。 */
  time: number;
}

/** 由 userData 目录拼出书签库路径（纯函数，隔离对 electron 的依赖）。 */
export function resolveBookmarksDbPath(userDataDir: string): string {
  return path.join(userDataDir, "bookmarks.db");
}

function migrate(db: DatabaseSync): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS bookmarks (
       key TEXT PRIMARY KEY,
       url TEXT NOT NULL,
       title TEXT NOT NULL,
       instance_id TEXT NOT NULL,
       time INTEGER NOT NULL
     );`,
  );
}

function readBookmarks(db: DatabaseSync): Bookmark[] {
  const rows = db
    .prepare(
      "SELECT key, url, title, instance_id AS instanceId, time FROM bookmarks ORDER BY time DESC",
    )
    .all() as unknown as Bookmark[];
  return rows.map((r) => ({
    key: r.key,
    url: r.url,
    title: r.title,
    instanceId: r.instanceId,
    time: r.time,
  }));
}

/** 读取书签：文件缺失或损坏返回空数组（不抛错，保证应用可启动）。 */
export function loadBookmarks(dbPath: string): Bookmark[] {
  if (!fs.existsSync(dbPath)) return [];
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    return readBookmarks(db);
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

/** 全量覆盖写书签：事务内先清后插；失败静默忽略。 */
export function saveBookmarks(dbPath: string, marks: Bookmark[]): void {
  let db: DatabaseSync | null = null;
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new DatabaseSync(dbPath);
    migrate(db);
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM bookmarks").run();
      const insert = db.prepare(
        "INSERT INTO bookmarks (key, url, title, instance_id, time) VALUES (?, ?, ?, ?, ?)",
      );
      marks.forEach((m) => insert.run(m.key, m.url, m.title, m.instanceId, m.time));
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
