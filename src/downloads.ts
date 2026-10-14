import fs from "node:fs";
import path from "node:path";

/**
 * 下载落盘决策（实例覆盖 > 应用默认 > 系统默认；重名自动加序号）。
 * 全部逻辑可单测：fs 访问经参数注入，默认走真实 fs。
 */

export function resolveDownloadDir(
  instanceDir: string | undefined,
  appDir: string,
  systemDir: string,
): string {
  if ((instanceDir ?? "").trim()) return (instanceDir as string).trim();
  if ((appDir ?? "").trim()) return appDir.trim();
  return systemDir;
}

export function ensureDir(
  dir: string,
  mkdir: (d: string) => void = (d) => fs.mkdirSync(d, { recursive: true }),
): boolean {
  try {
    mkdir(dir);
    return true;
  } catch {
    return false;
  }
}

/** 已有同名文件时依次试 `名 (2).ext`、`名 (3).ext`……直到可用。 */
export function uniqueSavePath(
  dir: string,
  filename: string,
  exists: (p: string) => boolean = fs.existsSync,
): string {
  const safe = path.basename(filename) || "download";
  const ext = path.extname(safe);
  const base = safe.slice(0, safe.length - ext.length) || "download";
  let candidate = path.join(dir, safe);
  let n = 1;
  while (exists(candidate)) {
    n += 1;
    candidate = path.join(dir, `${base} (${n})${ext}`);
  }
  return candidate;
}

export interface DecideDownloadPathOptions {
  instanceDir?: string;
  appDir: string;
  systemDir: string;
  filename: string;
  exists?: (p: string) => boolean;
  mkdir?: (d: string) => void;
}

/**
 * 完整落盘决策：首选目录建不出时回退系统默认（fellBack=true，调用方发通知）。
 * 全程不抛错——exists/mkdir 的异常都在内部消化。
 */
export function decideDownloadPath(opts: DecideDownloadPathOptions): {
  savePath: string;
  fellBack: boolean;
} {
  const exists = opts.exists ?? fs.existsSync;
  const mkdir = opts.mkdir ?? ((d: string) => fs.mkdirSync(d, { recursive: true }));
  const primary = resolveDownloadDir(opts.instanceDir, opts.appDir, opts.systemDir);
  if (ensureDir(primary, mkdir)) {
    return { savePath: uniqueSavePath(primary, opts.filename, exists), fellBack: false };
  }
  ensureDir(opts.systemDir, mkdir);
  return { savePath: uniqueSavePath(opts.systemDir, opts.filename, exists), fellBack: true };
}
