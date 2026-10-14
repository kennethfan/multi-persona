import { describe, expect, it, vi } from "vitest";
import {
  clearInstanceCache,
  instanceIdFromPartition,
  partitionFor,
  wipeInstanceStorage,
} from "./sessions";

describe("实例↔会话分区映射", () => {
  it("同一实例映射到同一持久化分区", () => {
    expect(partitionFor("default-1")).toBe(partitionFor("default-1"));
    expect(partitionFor("default-1").startsWith("persist:")).toBe(true);
  });

  it("不同实例分区不同（互不串号）", () => {
    expect(partitionFor("default-1")).not.toBe(partitionFor("default-2"));
  });

  it("空 id 抛错，拒绝落入共享分区", () => {
    expect(() => partitionFor("")).toThrow();
  });

  it("分区名可反查实例 id，非本应用分区返回 undefined", () => {
    expect(instanceIdFromPartition(partitionFor("default-1"))).toBe("default-1");
    expect(instanceIdFromPartition("persist:other")).toBeUndefined();
    expect(instanceIdFromPartition("")).toBeUndefined();
  });
});

describe("删实例清会话", () => {
  it("wipe 调 clearStorageData 并返回被清分区", async () => {
    const clearStorageData = vi.fn().mockResolvedValue(undefined);
    const partition = await wipeInstanceStorage({ clearStorageData }, "default-1");
    expect(clearStorageData).toHaveBeenCalledTimes(1);
    expect(partition).toBe(partitionFor("default-1"));
  });

  it("空 id 抛错且不动任何存储", async () => {
    const clearStorageData = vi.fn().mockResolvedValue(undefined);
    await expect(wipeInstanceStorage({ clearStorageData }, "")).rejects.toThrow();
    expect(clearStorageData).not.toHaveBeenCalled();
  });
});

describe("实例清缓存", () => {
  it("只调 clearCache、不碰 clearStorageData（登录态保留）", async () => {
    const clearCache = vi.fn().mockResolvedValue(undefined);
    const partition = await clearInstanceCache({ clearCache }, "default-1");
    expect(clearCache).toHaveBeenCalledTimes(1);
    expect(partition).toBe(partitionFor("default-1"));
  });

  it("空 id 抛错且不动任何缓存", async () => {
    const clearCache = vi.fn().mockResolvedValue(undefined);
    await expect(clearInstanceCache({ clearCache }, "")).rejects.toThrow();
    expect(clearCache).not.toHaveBeenCalled();
  });
});
