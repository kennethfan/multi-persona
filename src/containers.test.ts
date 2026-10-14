import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  addContainer,
  createDefaultContainers,
  getContainer,
  recolorContainer,
  removeContainer,
  renameContainer,
} from "./containers";
import { loadContainers, resolveStorePath, saveContainers } from "./container-store";

describe("createDefaultContainers", () => {
  it("恰好 5 个空容器，名字与颜色各不相同", () => {
    const list = createDefaultContainers();
    expect(list).toHaveLength(5);
    expect(new Set(list.map((c) => c.name)).size).toBe(5);
    expect(new Set(list.map((c) => c.color)).size).toBe(5);
    expect(new Set(list.map((c) => c.id)).size).toBe(5);
  });
});

describe("容器 CRUD", () => {
  it("新增 / 重命名 / 改色 / 删除", () => {
    let list = createDefaultContainers();
    list = addContainer(list, { id: "c-1", name: "小号", color: "#000000" });
    expect(list).toHaveLength(6);

    list = renameContainer(list, "c-1", "小号改名");
    expect(getContainer(list, "c-1")?.name).toBe("小号改名");

    list = recolorContainer(list, "c-1", "#ffffff");
    expect(getContainer(list, "c-1")?.color).toBe("#ffffff");

    list = removeContainer(list, "c-1");
    expect(list).toHaveLength(5);
    expect(getContainer(list, "c-1")).toBeUndefined();
  });

  it("id 重复新增抛错；操作不存在的 id 抛错（删除除外，幂等）", () => {
    const list = createDefaultContainers();
    expect(() => addContainer(list, { id: "default-1", name: "x", color: "#000" })).toThrow();
    expect(() => renameContainer(list, "nope", "x")).toThrow();
    expect(() => recolorContainer(list, "nope", "#000")).toThrow();
    expect(removeContainer(list, "nope")).toHaveLength(5);
  });

  it("不修改原数组（纯函数）", () => {
    const list = createDefaultContainers();
    const snapshot = JSON.stringify(list);
    addContainer(list, { id: "c-9", name: "x", color: "#000" });
    renameContainer(list, "default-1", "x");
    removeContainer(list, "default-1");
    expect(JSON.stringify(list)).toBe(snapshot);
  });
});

describe("container-store 持久化", () => {
  it("缺文件返回预置；写盘后重读不变（模拟重启）", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mp-test-"));
    const file = resolveStorePath(dir);
    expect(loadContainers(file)).toHaveLength(5);

    const custom = renameContainer(loadContainers(file), "default-1", "主力号");
    saveContainers(file, custom);
    expect(loadContainers(file)).toEqual(custom);
  });

  it("损坏的 JSON 抛错而不覆盖", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mp-test-"));
    const file = resolveStorePath(dir);
    fs.writeFileSync(file, "{ broken", "utf-8");
    expect(() => loadContainers(file)).toThrow();
  });
});
