import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  emptySnapshot,
  loadTabsSnapshot,
  resolveTabsDbPath,
  saveTabsSnapshot,
} from "./tabs-db";

function tmpDb(): string {
  return path.join(os.tmpdir(), `tabs-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

describe("tabs-db", () => {
  it("缺失文件返回空快照", () => {
    expect(loadTabsSnapshot(tmpDb())).toEqual(emptySnapshot());
  });

  it("存取往返保留标签/活动位置/当前实例", () => {
    const dbPath = tmpDb();
    saveTabsSnapshot(dbPath, {
      tabs: [
        { url: "https://a.example/", instanceId: "i-1" },
        { url: "about:blank", instanceId: "i-2" },
      ],
      activePos: 1,
      currentInstanceId: "i-2",
    });
    expect(loadTabsSnapshot(dbPath)).toEqual({
      tabs: [
        { url: "https://a.example/", instanceId: "i-1" },
        { url: "about:blank", instanceId: "i-2" },
      ],
      activePos: 1,
      currentInstanceId: "i-2",
    });
  });

  it("覆盖写以后存为准", () => {
    const dbPath = tmpDb();
    saveTabsSnapshot(dbPath, {
      tabs: [{ url: "https://old.example/", instanceId: "i-1" }],
      activePos: 0,
      currentInstanceId: "i-1",
    });
    saveTabsSnapshot(dbPath, {
      tabs: [{ url: "https://new.example/", instanceId: "i-9" }],
      activePos: -1,
      currentInstanceId: "",
    });
    expect(loadTabsSnapshot(dbPath).tabs).toEqual([{ url: "https://new.example/", instanceId: "i-9" }]);
  });

  it("损坏文件返回空快照（静默空启动）", () => {
    const dbPath = tmpDb();
    fs.writeFileSync(dbPath, "not-a-sqlite-file", "utf-8");
    expect(loadTabsSnapshot(dbPath)).toEqual(emptySnapshot());
  });

  it("路径由 userData 拼出 tabs.db", () => {
    expect(resolveTabsDbPath("/u")).toBe(path.join("/u", "tabs.db"));
  });
});
