import { describe, expect, it } from "vitest";
import { buildGuestMenuCommands, buildMenuCommands, guestMenuLabel, menuLabel } from "./menus";

describe("buildMenuCommands", () => {
  it("项目节点：新建/改名/改色/删除，无标注", () => {
    expect(buildMenuCommands("project")).toEqual(["new-instance", "rename", "recolor", "delete"]);
  });

  it("实例节点：新建/改名/改色/标注/下载目录/清缓存/清数据/删除", () => {
    expect(buildMenuCommands("instance")).toEqual([
      "new-instance-here",
      "rename",
      "recolor",
      "set-label",
      "set-download-dir",
      "clear-cache",
      "clear-data",
      "delete",
    ]);
  });
});

describe("menuLabel", () => {
  it("删除文案按节点类型警示后果", () => {
    expect(menuLabel("delete", "project")).toContain("全部实例");
    expect(menuLabel("delete", "instance")).toContain("会话");
  });

  it("左栏空白处：只有新建项目", () => {
    expect(buildMenuCommands("sidebar")).toEqual(["new-project"]);
    expect(menuLabel("new-project", "sidebar")).toBe("新建项目");
  });

  it("所有命令在三类目标下都有文案", () => {
    for (const kind of ["project", "instance", "sidebar"] as const) {
      for (const cmd of buildMenuCommands(kind)) {
        expect(menuLabel(cmd, kind).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("buildGuestMenuCommands", () => {
  it("空白处：只有导航三件套", () => {
    expect(
      buildGuestMenuCommands({ linkURL: "", srcURL: "", isImage: false, hasSelection: false }),
    ).toEqual(["nav-back", "nav-forward", "nav-reload"]);
  });

  it("链接上：链接组在前，导航组在后", () => {
    expect(
      buildGuestMenuCommands({
        linkURL: "https://example.com",
        srcURL: "",
        isImage: false,
        hasSelection: false,
      }),
    ).toEqual(["open-link-tab", "copy-link", "nav-back", "nav-forward", "nav-reload"]);
  });

  it("图片链接：链接组、图片组、导航组依次出现", () => {
    expect(
      buildGuestMenuCommands({
        linkURL: "https://example.com",
        srcURL: "https://example.com/a.png",
        isImage: true,
        hasSelection: false,
      }),
    ).toEqual([
      "open-link-tab",
      "copy-link",
      "save-image",
      "nav-back",
      "nav-forward",
      "nav-reload",
    ]);
  });

  it("选中文字：复制夹在内容组与导航组之间", () => {
    const cmds = buildGuestMenuCommands({
      linkURL: "",
      srcURL: "",
      isImage: false,
      hasSelection: true,
    });
    expect(cmds).toEqual(["copy-selection", "nav-back", "nav-forward", "nav-reload"]);
    for (const cmd of cmds) {
      expect(guestMenuLabel(cmd).length).toBeGreaterThan(0);
    }
  });
});
