import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  decideDownloadPath,
  ensureDir,
  resolveDownloadDir,
  uniqueSavePath,
} from "./downloads";

describe("resolveDownloadDir", () => {
  it("实例覆盖优先", () => {
    expect(resolveDownloadDir("/i", "/app", "/sys")).toBe("/i");
  });
  it("实例缺字段时用应用默认", () => {
    expect(resolveDownloadDir(undefined, "/app", "/sys")).toBe("/app");
  });
  it("实例空白时用应用默认", () => {
    expect(resolveDownloadDir("  ", "/app", "/sys")).toBe("/app");
  });
  it("两级都空时回系统默认", () => {
    expect(resolveDownloadDir(undefined, "", "/sys")).toBe("/sys");
  });
});

describe("uniqueSavePath", () => {
  it("无冲突原样返回", () => {
    expect(uniqueSavePath("/dl", "a.pdf", () => false)).toBe(path.join("/dl", "a.pdf"));
  });
  it("重名依次加序号", () => {
    const taken = new Set([path.join("/dl", "a.pdf"), path.join("/dl", "a (2).pdf")]);
    expect(uniqueSavePath("/dl", "a.pdf", (p) => taken.has(p))).toBe(
      path.join("/dl", "a (3).pdf"),
    );
  });
  it("无扩展名同样加序号", () => {
    const taken = new Set([path.join("/dl", "LICENSE")]);
    expect(uniqueSavePath("/dl", "LICENSE", (p) => taken.has(p))).toBe(
      path.join("/dl", "LICENSE (2)"),
    );
  });
  it("文件名只取 basename（防路径穿越）", () => {
    expect(uniqueSavePath("/dl", "../evil.sh", () => false)).toBe(path.join("/dl", "evil.sh"));
  });
});

describe("decideDownloadPath", () => {
  it("首选目录可用时直接落盘、不回退", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mp-dl-"));
    const r = decideDownloadPath({ instanceDir: dir, appDir: "", systemDir: "/sys", filename: "a.zip" });
    expect(r).toEqual({ savePath: path.join(dir, "a.zip"), fellBack: false });
  });
  it("首选建不出目录时回退系统默认并标记", () => {
    const sys = fs.mkdtempSync(path.join(os.tmpdir(), "mp-dl-sys-"));
    const r = decideDownloadPath({
      instanceDir: "/no-such-root",
      appDir: "",
      systemDir: sys,
      filename: "a.zip",
      mkdir: (d) => {
        if (d !== sys) throw new Error("EACCES");
        fs.mkdirSync(d, { recursive: true });
      },
    });
    expect(r).toEqual({ savePath: path.join(sys, "a.zip"), fellBack: true });
  });
  it("缺字段=跟随全局，零迁移", () => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), "mp-dl-app-"));
    const r = decideDownloadPath({ appDir: app, systemDir: "/sys", filename: "a.zip" });
    expect(r.savePath).toBe(path.join(app, "a.zip"));
  });
});

describe("ensureDir", () => {
  it("已存在返回 true", () => {
    expect(ensureDir(os.tmpdir())).toBe(true);
  });
  it("建不出返回 false 不抛错", () => {
    expect(
      ensureDir("/x", () => {
        throw new Error("EACCES");
      }),
    ).toBe(false);
  });
});
