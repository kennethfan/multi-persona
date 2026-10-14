import { describe, expect, it } from "vitest";
import { instanceIdFromPartition, partitionFor } from "./sessions";

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
