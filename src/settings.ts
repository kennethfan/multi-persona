/** 应用级设置：纯数据 + 默认值合并 + settings.json 文件读写（主进程调用）。 */
import fs from "node:fs";
import path from "node:path";

export interface Settings {
  /** 新标签默认归属：当前实例 / 每次都问。 */
  newTabDefault: "current" | "ask";
  /** 站内新窗口行为：应用内弹窗 / 应用内新标签。 */
  popupBehavior: "modal" | "tab";
  /** 同账号冲突时是否发系统通知（常驻红点不受此开关影响）。 */
  conflictNotify: boolean;
  /** 应用默认下载目录；空字串=跟随系统默认下载目录。 */
  downloadDir: string;
  /** 看过引导页后不再自动弹（#32 Q7）。 */
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  newTabDefault: "current",
  popupBehavior: "modal",
  conflictNotify: true,
  downloadDir: "",
  onboarded: false,
};

/** 缺字段回填默认值，非法值回退默认（老版本 settings.json 直接可用）。 */
export function withDefaults(raw: Partial<Settings>): Settings {
  return {
    newTabDefault: raw.newTabDefault === "ask" ? "ask" : "current",
    popupBehavior: raw.popupBehavior === "tab" ? "tab" : "modal",
    conflictNotify: raw.conflictNotify === false ? false : true,
    downloadDir: typeof raw.downloadDir === "string" ? raw.downloadDir : "",
    onboarded: raw.onboarded === true,
  };
}

export function resolveSettingsPath(userDataDir: string): string {
  return path.join(userDataDir, "settings.json");
}

/** 文件缺失或 JSON 损坏时回默认（损坏不抛错，保证应用可启动）。 */
export function loadSettingsFile(filePath: string): Settings {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<Settings>;
    return withDefaults(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettingsFile(filePath: string, settings: Settings): void {
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), "utf-8");
}
