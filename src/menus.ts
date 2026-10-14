/**
 * 左栏树右键菜单的命令表（纯构造，可单测）。
 * Electron Menu 的实际组装在 main.ts（跨平台 API，满足 Windows 约束）。
 */

/** 右键目标：项目/实例节点，或左栏空白处（sidebar，只能新建项目）。 */
export type TreeNodeKind = "project" | "instance" | "sidebar";

/** 菜单命令：new-project=新建项目（仅左栏空白处）。 */
export type MenuCmd =
  | "new-project"
  | "new-instance"
  | "new-instance-here"
  | "rename"
  | "recolor"
  | "set-label"
  | "set-download-dir"
  | "clear-cache"
  | "clear-data"
  | "delete";

/** 某类节点右键应出现哪些命令（顺序即展示顺序）。 */
export function buildMenuCommands(kind: TreeNodeKind): MenuCmd[] {
  if (kind === "sidebar") return ["new-project"];
  if (kind === "project") return ["new-instance", "rename", "recolor", "delete"];
  return ["new-instance-here", "rename", "recolor", "set-label", "set-download-dir", "clear-cache", "clear-data", "delete"];
}

/** 命令展示文案（delete 按节点类型区分，提醒级联/清会话后果）。 */
export function menuLabel(cmd: MenuCmd, kind: TreeNodeKind): string {
  switch (cmd) {
    case "new-project":
      return "新建项目";
    case "new-instance":
      return "新建实例";
    case "new-instance-here":
      return "在此项目新建实例";
    case "rename":
      return kind === "project" ? "重命名项目" : "重命名实例";
    case "recolor":
      return "更改颜色";
    case "set-label":
      return "标注账号";
    case "set-download-dir":
      return "设置下载目录";
    case "clear-cache":
      return "清除缓存";
    case "clear-data":
      return "清除全部站点数据";
    case "delete":
      return kind === "project" ? "删除项目（含其下全部实例）" : "删除实例（含其会话）";
  }
}
