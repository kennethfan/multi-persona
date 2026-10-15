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
  | "set-user-agent"
  | "clear-cache"
  | "clear-data"
  | "delete";

/** 某类节点右键应出现哪些命令（顺序即展示顺序）。 */
export function buildMenuCommands(kind: TreeNodeKind): MenuCmd[] {
  if (kind === "sidebar") return ["new-project"];
  if (kind === "project") return ["new-instance", "rename", "recolor", "delete"];
  return ["new-instance-here", "rename", "recolor", "set-label", "set-download-dir", "set-user-agent", "clear-cache", "clear-data", "delete"];
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
    case "set-user-agent":
      return "设置 UA…";
    case "clear-cache":
      return "清除缓存";
    case "clear-data":
      return "清除全部站点数据";
    case "delete":
      return kind === "project" ? "删除项目（含其下全部实例）" : "删除实例（含其会话）";
  }
}

/**
 * 页面区右键上下文（#29，Q2/Q6–Q8）：Electron context-menu 事件 params 的最小子集。
 * 纯数据，便于单测菜单组装，不依赖 Electron 类型。
 */
export interface GuestContext {
  /** 链接 URL（右键点在 <a> 上时有值）。 */
  linkURL: string;
  /** 图片 src（右键点在 <img> 上时有值）。 */
  srcURL: string;
  /** 是否为图片（对应 params.mediaType === "image"）。 */
  isImage: boolean;
  /** 是否有选中文字。 */
  hasSelection: boolean;
}

/** 页面区右键命令：open-link-tab=新标签打开链接，copy-link=复制链接地址，save-image=图片另存为，copy-selection=复制选中文字，nav-back/nav-forward/nav-reload=导航三件套。 */
export type GuestCmd =
  | "open-link-tab"
  | "copy-link"
  | "save-image"
  | "copy-selection"
  | "nav-back"
  | "nav-forward"
  | "nav-reload";

/**
 * 页面区某次右键应出现哪些命令（顺序即展示顺序；调用方在导航组前视情况加分隔线）。
 * 链接组 > 图片组 > 选中组 > 导航组；空白处只有导航组。
 */
export function buildGuestMenuCommands(ctx: GuestContext): GuestCmd[] {
  const cmds: GuestCmd[] = [];
  if (ctx.linkURL) cmds.push("open-link-tab", "copy-link");
  if (ctx.isImage && ctx.srcURL) cmds.push("save-image");
  if (ctx.hasSelection) cmds.push("copy-selection");
  cmds.push("nav-back", "nav-forward", "nav-reload");
  return cmds;
}

/** 页面区命令展示文案。 */
export function guestMenuLabel(cmd: GuestCmd): string {
  switch (cmd) {
    case "open-link-tab":
      return "在新标签中打开链接";
    case "copy-link":
      return "复制链接地址";
    case "save-image":
      return "图片另存为";
    case "copy-selection":
      return "复制";
    case "nav-back":
      return "后退";
    case "nav-forward":
      return "前进";
    case "nav-reload":
      return "重新加载";
  }
}
