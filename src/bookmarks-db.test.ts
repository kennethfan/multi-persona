import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  loadBookmarks,
  resolveBookmarksDbPath,
  saveBookmarks,
  type Bookmark,
} from "./bookmarks-db";

function tmpDb(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bm-test-"));
  return path.join(dir, "bookmarks.db");
}

const fixture: Bookmark[] = [
  { key: "https://b.example/", url: "https://b.example/", title: "B 站", instanceId: "i-1", time: 2000 },
  { key: "https://a.example/", url: "https://a.example/", title: "A 站", instanceId: "i-2", time: 1000 },
];

describe("bookmarks-db", () => {
  it("文件缺失返回空数组", () => {
    expect(loadBookmarks(path.join(os.tmpdir(), "bm-no-such-dir", "bookmarks.db"))).toEqual([]);
  });

  it("写入后读回一致且按时间倒序", () => {
    const db = tmpDb();
    saveBookmarks(db, fixture);
    const got = loadBookmarks(db);
    expect(got.map((b) => b.key)).toEqual(["https://b.example/", "https://a.example/"]);
    expect(got[0].title).toBe("B 站");
    expect(got[0].instanceId).toBe("i-1");
  });

  it("损坏文件返回空数组不抛错", () => {
    const db = tmpDb();
    fs.mkdirSync(path.dirname(db), { recursive: true });
    fs.writeFileSync(db, "not a sqlite file");
    expect(loadBookmarks(db)).toEqual([]);
  });

  it("全量覆盖写：第二次写替换第一次", () => {
    const db = tmpDb();
    saveBookmarks(db, fixture);
    saveBookmarks(db, [fixture[0]]);
    expect(loadBookmarks(db).length).toBe(1);
  });

  it("路径拼在 userData 下且名为 bookmarks.db", () => {
    expect(resolveBookmarksDbPath("/ud")).toBe(path.join("/ud", "bookmarks.db"));
  });
});
