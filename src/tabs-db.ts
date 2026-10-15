/**
 * 标签快照 sqlite 持久化（ADR-0012）：node:sqlite 内置 DatabaseSync，零新依赖。
 * 主进程调用；损坏或缺失一律返回空快照（静默空启动），落盘失败静默忽略（不影响当前会话）。
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export interface TabEntry {
  url: string;
  instanceId: string;
}

/** activePos 是 tabs 数组下标（tab id 会话内有效，不持久化）；-1=无活动标签。 */
export interface TabsSnapshot {
  tabs: TabEntry[];
  activePos: number;
  currentInstanceId: string;
}

export function emptySnapshot(): TabsSnapshot {
  return { tabs: [], activePos: -1, currentInstanceId: "" };
}

/** 由 userData 目录拼出标签快照库路径（纯函数，隔离对 electron 的依赖）。 */
export function resolveTabsDbPath(userDataDir: string): string {
  return path.join(userDataDir, "tabs.db");
}

function migrate(db: DatabaseSync): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS tabs (pos INTEGER PRIMARY KEY, url TEXT NOT NULL, instance_id TEXT NOT NULL);
     CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  );
}

function readSnapshot(db: DatabaseSync): TabsSnapshot {
  const rows = db
    .prepare("SELECT url, instance_id AS instanceId FROM tabs ORDER BY pos")
    .all() as unknown as TabEntry[];
  const meta = db.prepare("SELECT key, value FROM meta").all() as { key: string; value: string }[];
  const get = (k: string): string => meta.find((m) => m.key === k)?.value ?? "";
  const activePos = Number.parseInt(get("activePos"), 10);
  return {
    tabs: rows.map((r) => ({ url: r.url, instanceId: r.instanceId })),
    activePos: Number.isInteger(activePos) ? activePos : -1,
    currentInstanceId: get("currentInstanceId"),
  };
}

/** 读取快照：文件缺失或损坏返回空快照（不抛错，保证应用可启动）。 */
export function loadTabsSnapshot(dbPath: string): TabsSnapshot {
  if (!fs.existsSync(dbPath)) return emptySnapshot();
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    return readSnapshot(db);
  } catch {
    return emptySnapshot();
  } finally {
    db?.close();
  }
}

/** 全量覆盖写快照：事务内先清后插（单文件小写，崩溃不坏一半）；失败静默忽略。 */
export function saveTabsSnapshot(dbPath: string, snap: TabsSnapshot): void {
  let db: DatabaseSync | null = null;
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new DatabaseSync(dbPath);
    migrate(db);
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM tabs").run();
      db.prepare("DELETE FROM meta").run();
      const insertTab = db.prepare("INSERT INTO tabs (pos, url, instance_id) VALUES (?, ?, ?)");
      snap.tabs.forEach((t, i) => insertTab.run(i, t.url, t.instanceId));
      const insertMeta = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
      insertMeta.run("activePos", String(snap.activePos));
      insertMeta.run("currentInstanceId", snap.currentInstanceId);
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
