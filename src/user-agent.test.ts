import { describe, expect, it } from "vitest";
import { resolveUA, sanitizeUA, toChromeLikeUA } from "./user-agent";

describe("toChromeLikeUA", () => {
  it("去掉 Electron 尾巴，保留 Chrome 与平台段", () => {
    const base =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Electron/38.8.6";
    const out = toChromeLikeUA(base);
    expect(out).not.toContain("Electron/");
    expect(out).toContain("Chrome/140.0.0.0");
    expect(out).toContain("Safari/537.36");
    expect(out).toContain("Macintosh");
  });

  it("去掉应用名尾巴", () => {
    const base =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 multi-persona/0.1.0 Electron/38.8.6";
    const out = toChromeLikeUA(base);
    expect(out).not.toContain("Electron/");
    expect(out).not.toContain("multi-persona/");
    expect(out).toContain("Windows NT 10.0");
  });

  it("已是纯 Chrome 时幂等", () => {
    const base =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
    expect(toChromeLikeUA(base)).toBe(base);
  });

  it("空串安全返回", () => {
    expect(toChromeLikeUA("")).toBe("");
  });
});

describe("resolveUA 回退链", () => {
  const base =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Electron/38.8.6";
  const chromeLike = toChromeLikeUA(base);

  it("实例覆盖优先", () => {
    expect(resolveUA("Custom/1.0", "Global/2.0", base)).toBe("Custom/1.0");
  });

  it("实例为空时用全局", () => {
    expect(resolveUA("", "Global/2.0", base)).toBe("Global/2.0");
    expect(resolveUA("   ", "Global/2.0", base)).toBe("Global/2.0");
    expect(resolveUA(undefined, "Global/2.0", base)).toBe("Global/2.0");
  });

  it("两级都空时回退纯 Chrome 伪装", () => {
    const out = resolveUA("", "", base);
    expect(out).toBe(chromeLike);
    expect(out).not.toContain("Electron/");
  });

  it("自定义值去首尾空格", () => {
    expect(resolveUA("  Custom/1.0  ", "", base)).toBe("Custom/1.0");
  });
});

describe("sanitizeUA", () => {
  it("去首尾空格", () => {
    expect(sanitizeUA("  Custom/1.0  ")).toBe("Custom/1.0");
  });

  it("空串合法=未设置", () => {
    expect(sanitizeUA("")).toBe("");
    expect(sanitizeUA("   ")).toBe("");
  });

  it("含换行/回车抛错", () => {
    expect(() => sanitizeUA("Custom/1.0\nEvil: 1")).toThrow();
    expect(() => sanitizeUA("Custom/1.0\r\nEvil: 1")).toThrow();
  });

  it("含 C0 控制字符抛错", () => {
    expect(() => sanitizeUA("Custom/1.0\x01")).toThrow();
  });
});
