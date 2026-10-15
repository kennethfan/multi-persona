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
