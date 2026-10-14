import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  addInstance,
  addProject,
  createDefaultInstances,
  createDefaultProjects,
  getInstance,
  getProject,
  findDuplicateLabels,
  instancesOfProject,
  recolorInstance,
  recolorProject,
  removeInstance,
  removeProject,
  removeProjectCascade,
  renameInstance,
  renameProject,
  setInstanceDownloadDir,
  setInstanceLabel,
  wrapProjects,
} from "./projects";
import {
  createDefaultStore,
  loadStore,
  migrateLegacyStore,
  resolveLegacyStorePath,
  resolveStorePath,
  saveStore,
} from "./project-store";

describe("createDefaultProjects", () => {
  it("恰好 5 个空项目，名字与颜色各不相同；每个带 1 个默认实例", () => {
    const projects = createDefaultProjects();
    expect(projects).toHaveLength(5);
    expect(new Set(projects.map((c) => c.name)).size).toBe(5);
    expect(new Set(projects.map((c) => c.color)).size).toBe(5);
    expect(new Set(projects.map((c) => c.id)).size).toBe(5);

    const instances = createDefaultInstances(projects);
    expect(instances).toHaveLength(5);
    for (const p of projects) {
      expect(instancesOfProject(instances, p.id)).toHaveLength(1);
    }
  });
});

describe("项目 CRUD", () => {
  it("新增 / 重命名 / 改色 / 删除", () => {
    let list = createDefaultProjects();
    list = addProject(list, { id: "c-1", name: "视频", color: "#000000" });
    expect(list).toHaveLength(6);

    list = renameProject(list, "c-1", "视频改名");
    expect(getProject(list, "c-1")?.name).toBe("视频改名");

    list = recolorProject(list, "c-1", "#ffffff");
    expect(getProject(list, "c-1")?.color).toBe("#ffffff");

    list = removeProject(list, "c-1");
    expect(list).toHaveLength(5);
    expect(getProject(list, "c-1")).toBeUndefined();
  });

  it("id 重复新增抛错；操作不存在的 id 抛错（删除除外，幂等）", () => {
    const list = createDefaultProjects();
    expect(() => addProject(list, { id: "default-1", name: "x", color: "#000" })).toThrow();
    expect(() => renameProject(list, "nope", "x")).toThrow();
    expect(() => recolorProject(list, "nope", "#000")).toThrow();
    expect(removeProject(list, "nope")).toHaveLength(5);
  });
});

describe("实例 CRUD", () => {
  it("新增 / 重命名 / 改色 / 删除 / 按项目查询", () => {
    const projects = createDefaultProjects();
    let list = createDefaultInstances(projects);
    list = addInstance(list, { id: "v-1", projectId: "default-1", name: "B站号", color: "#000000" });
    expect(instancesOfProject(list, "default-1")).toHaveLength(2);

    list = renameInstance(list, "v-1", "B站主力");
    expect(getInstance(list, "v-1")?.name).toBe("B站主力");

    list = recolorInstance(list, "v-1", "#ffffff");
    expect(getInstance(list, "v-1")?.color).toBe("#ffffff");

    list = removeInstance(list, "v-1");
    expect(getInstance(list, "v-1")).toBeUndefined();
    expect(instancesOfProject(list, "default-1")).toHaveLength(1);
  });

  it("id 重复新增抛错；操作不存在的 id 抛错（删除除外，幂等）", () => {
    const list = createDefaultInstances(createDefaultProjects());
    expect(() =>
      addInstance(list, { id: "default-1-i1", projectId: "default-1", name: "x", color: "#000" }),
    ).toThrow();
    expect(() => renameInstance(list, "nope", "x")).toThrow();
    expect(() => recolorInstance(list, "nope", "#000")).toThrow();
    expect(removeInstance(list, "nope")).toHaveLength(5);
  });

  it("级联删除项目时带走其下实例，不动别的项目", () => {
    const projects = createDefaultProjects();
    const instances = createDefaultInstances(projects);
    const next = removeProjectCascade(projects, instances, "default-1");
    expect(next.projects).toHaveLength(4);
    expect(getProject(next.projects, "default-1")).toBeUndefined();
    expect(instancesOfProject(next.instances, "default-1")).toHaveLength(0);
    expect(instancesOfProject(next.instances, "default-2")).toHaveLength(1);
  });

  it("纯函数不修改原数组", () => {
    const list = createDefaultInstances(createDefaultProjects());
    const snapshot = JSON.stringify(list);
    addInstance(list, { id: "x", projectId: "default-1", name: "x", color: "#000" });
    renameInstance(list, "default-1-i1", "x");
    removeInstance(list, "default-1-i1");
    expect(JSON.stringify(list)).toBe(snapshot);
  });
});

describe("账号标注与双实例提醒", () => {
  it("设标注 / 改标注 / 清标注（空字串）；不存在的 id 抛错", () => {
    let list = createDefaultInstances(createDefaultProjects());
    list = setInstanceLabel(list, "default-1-i1", "Gmail 的 a@gmail.com");
    expect(getInstance(list, "default-1-i1")?.label).toBe("Gmail 的 a@gmail.com");

    list = setInstanceLabel(list, "default-1-i1", "");
    expect(getInstance(list, "default-1-i1")?.label).toBe("");

    expect(() => setInstanceLabel(list, "nope", "x")).toThrow();
  });

  it("同一账号进两个实例即报，不分是否同项目", () => {
    let list = createDefaultInstances(createDefaultProjects());
    list = setInstanceLabel(list, "default-1-i1", "Gmail 的 a@gmail.com");
    list = setInstanceLabel(list, "default-2-i1", "Gmail 的 a@gmail.com");
    const dups = findDuplicateLabels(list);
    expect(dups).toHaveLength(1);
    expect(dups[0].label).toBe("Gmail 的 a@gmail.com");
    expect(new Set(dups[0].instanceIds)).toEqual(new Set(["default-1-i1", "default-2-i1"]));
  });

  it("不同账号 / 空白标注不报；改掉后警报消除", () => {
    let list = createDefaultInstances(createDefaultProjects());
    list = setInstanceLabel(list, "default-1-i1", "a@gmail.com");
    list = setInstanceLabel(list, "default-2-i1", "b@gmail.com");
    list = setInstanceLabel(list, "default-3-i1", "   ");
    expect(findDuplicateLabels(list)).toHaveLength(0);

    list = setInstanceLabel(list, "default-2-i1", "a@gmail.com");
    expect(findDuplicateLabels(list)).toHaveLength(1);
    list = setInstanceLabel(list, "default-2-i1", "b@gmail.com");
    expect(findDuplicateLabels(list)).toHaveLength(0);
  });
});

describe("实例下载目录覆盖", () => {
  it("设置专属目录；空白=清除覆盖（删字段，恢复跟随全局）", () => {
    let list = createDefaultInstances(createDefaultProjects());
    expect(getInstance(list, "default-1-i1")?.downloadDir).toBeUndefined();
    list = setInstanceDownloadDir(list, "default-1-i1", "  /tmp/dl  ");
    expect(getInstance(list, "default-1-i1")?.downloadDir).toBe("/tmp/dl");
    list = setInstanceDownloadDir(list, "default-1-i1", "   ");
    expect(getInstance(list, "default-1-i1")?.downloadDir).toBeUndefined();
    expect("downloadDir" in (getInstance(list, "default-1-i1") as object)).toBe(false);
  });

  it("id 不存在抛错", () => {
    const list = createDefaultInstances(createDefaultProjects());
    expect(() => setInstanceDownloadDir(list, "nope", "/tmp/dl")).toThrow();
  });
});

describe("包层迁移 wrapProjects", () => {
  it("每个老项目获得 1 个沿用老 id 的默认实例（分区不变）", () => {
    const projects = createDefaultProjects();
    const wrapped = wrapProjects(projects);
    expect(wrapped.projects).toEqual(projects);
    expect(wrapped.instances).toHaveLength(5);
    for (const p of projects) {
      const inst = getInstance(wrapped.instances, p.id);
      expect(inst?.projectId).toBe(p.id);
      expect(inst?.color).toBe(p.color);
    }
  });
});

describe("project-store 持久化", () => {
  it("缺文件返回默认存储；写盘后重读不变（模拟重启）", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mp-test-"));
    const file = resolveStorePath(dir);
    const loaded = loadStore(file);
    expect(loaded.projects).toHaveLength(5);
    expect(loaded.instances).toHaveLength(5);

    const custom: typeof loaded = {
      version: 1,
      projects: renameProject(loaded.projects, "default-1", "视频"),
      instances: renameInstance(loaded.instances, "default-1-i1", "B站号"),
    };
    saveStore(file, custom);
    expect(loadStore(file)).toEqual(custom);
  });

  it("损坏的 JSON 抛错而不覆盖", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mp-test-"));
    const file = resolveStorePath(dir);
    fs.writeFileSync(file, "{ broken", "utf-8");
    expect(() => loadStore(file)).toThrow();
  });

  it("createDefaultStore 与缺文件读取一致", () => {
    expect(createDefaultStore()).toEqual(
      loadStore(resolveStorePath(fs.mkdtempSync(path.join(os.tmpdir(), "mp-test-")))),
    );
  });
});

describe("旧数据迁移", () => {
  it("旧容器文件存在时包层转为新形状，二次调用不再重复", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mp-test-"));
    const legacy = [{ id: "old-1", name: "旧数据", color: "#123456" }];
    fs.writeFileSync(resolveLegacyStorePath(dir), JSON.stringify(legacy), "utf-8");

    expect(migrateLegacyStore(dir)).toBe("migrated");
    const stored = loadStore(resolveStorePath(dir));
    expect(stored.projects).toEqual(legacy);
    expect(getInstance(stored.instances, "old-1")?.projectId).toBe("old-1");
    expect(migrateLegacyStore(dir)).toBe("already-exists");
  });

  it("项目级老形状（裸数组）原地包层重写", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mp-test-"));
    const legacy = [{ id: "default-1", name: "项目一", color: "#3b82f6" }];
    fs.writeFileSync(resolveStorePath(dir), JSON.stringify(legacy), "utf-8");

    expect(migrateLegacyStore(dir)).toBe("wrapped");
    const stored = loadStore(resolveStorePath(dir));
    expect(stored.projects).toEqual(legacy);
    expect(getInstance(stored.instances, "default-1")?.projectId).toBe("default-1");
    expect(migrateLegacyStore(dir)).toBe("already-exists");
  });

  it("无旧文件时为空操作", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mp-test-"));
    expect(migrateLegacyStore(dir)).toBe("no-legacy");
  });
});
