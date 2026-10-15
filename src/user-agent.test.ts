import { describe, expect, it } from "vitest";
import { toChromeLikeUA } from "./user-agent";

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
