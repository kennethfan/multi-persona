/**
 * 用户代理伪装（纯函数）：去掉 Electron/应用名尾巴，对外自称纯 Chrome。
 * 用于绕过站点的兼容性拦截（如知乎报“浏览器版本过低”）。
 */

/** 去掉的 token 形状：`Electron/38.8.6`、`multi-persona/0.1.0` 等。 */
const STRIP_PATTERN = /\s+(Electron|multi-persona)\/[^\s]+/gi;

/**
 * 把 webview 默认 UA 洗成同版本纯 Chrome UA。
 * 保留平台 OS 段与 Chrome/xxx、Safari/xxx 段；已是纯 Chrome 时原样返回；空串安全返回空串。
 */
export function toChromeLikeUA(baseUA: string): string {
  if (!baseUA) return baseUA;
  return baseUA.replace(STRIP_PATTERN, "").replace(/\s{2,}/g, " ").trim();
}

/**
 * UA 回退链（ADR-0014）：实例自定义 → 全局自定义 → 纯 Chrome 伪装。
 * 空白（含全空格）视为未设置，自动用下一级。
 */
export function resolveUA(
  instanceOverride: string | undefined,
  globalCustom: string | undefined,
  baseUA: string,
): string {
  if (instanceOverride && instanceOverride.trim()) return instanceOverride.trim();
  if (globalCustom && globalCustom.trim()) return globalCustom.trim();
  return toChromeLikeUA(baseUA);
}

/**
 * 手输 UA 入库前清洗：去首尾空格；含换行/回车/C0 控制字符抛错
 * （否则 HTTP 请求头非法，整站请求失败）；空串合法=未设置。
 */
export function sanitizeUA(input: string): string {
  const trimmed = (input ?? "").trim();
  // eslint-disable-next-line no-control-regex
  if (/[\r\n\x00-\x1f\x7f]/.test(trimmed)) {
    throw new Error("UA 不能包含换行或控制字符");
  }
  return trimmed;
}
