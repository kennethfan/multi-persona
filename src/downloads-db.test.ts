import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadDownloadRecords,
  resolveDownloadsDbPath,
  saveDownloadRecords,
} from "./downloads-db";
import type { DownloadRecord } from "./downloads-db";

function tmpDb(): string {
  return path.join(os.tmpdir(), `downloads-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

function rec(over: Partial<DownloadRecord> = {}): DownloadRecord {
  return {
    key: "/dl/a.zip",
    url: "https://a.example/a.zip",
    filename: "a.zip",
    savePath: "/dl/a.zip",
    instanceId: "i-1",
    state: "completed",
    time: 1700000000000,
    receivedBytes: 0,
    totalBytes: 0,
    ...over,
  };
}

describe("downloads-db", () => {
  it("缺失文件返回空数组", () => {
    expect(loadDownloadRecords(tmpDb())).toEqual([]);
  });

  it("路径拼在 userData 下且与 tabs.db 不同名", () => {
    expect(resolveDownloadsDbPath("/ud")).toBe(path.join("/ud", "downloads.db"));
  });

  it("存取往返保留全部字段且按时间倒序", () => {
    const dbPath = tmpDb();
    saveDownloadRecords(dbPath, [
      rec({ key: "/dl/old.zip", time: 100 }),
      rec({ key: "/dl/new.zip", time: 200 }),
    ]);
    const got = loadDownloadRecords(dbPath);
    expect(got.map((r) => r.key)).toEqual(["/dl/new.zip", "/dl/old.zip"]);
    expect(got[0]).toEqual(rec({ key: "/dl/new.zip", time: 200 }));
  });

  it("覆盖写以后存为准", () => {
    const dbPath = tmpDb();
    saveDownloadRecords(dbPath, [rec()]);
    saveDownloadRecords(dbPath, [rec({ key: "/dl/b.zip", state: "interrupted" })]);
    expect(loadDownloadRecords(dbPath)).toEqual([rec({ key: "/dl/b.zip", state: "interrupted" })]);
  });

  it("损坏文件返回空数组（静默空启动）", () => {
    const dbPath = tmpDb();
    fs.writeFileSync(dbPath, "not-a-sqlite-file", "utf-8");
    expect(loadDownloadRecords(dbPath)).toEqual([]);
  });

  it("进度字段往返（P1；缺省按 0 处理）", () => {
    const dbPath = tmpDb();
    saveDownloadRecords(dbPath, [rec({ state: "active", receivedBytes: 123, totalBytes: 1000 })]);
    expect(loadDownloadRecords(dbPath)).toEqual([
      rec({ state: "active", receivedBytes: 123, totalBytes: 1000 }),
    ]);
    saveDownloadRecords(dbPath, [rec()]);
    const got = loadDownloadRecords(dbPath)[0];
    expect(got.receivedBytes).toBe(0);
    expect(got.totalBytes).toBe(0);
  });
});
