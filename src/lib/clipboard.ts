/**
 * 剪贴板与 URL 工具：在不同浏览器 / 安全上下文下尽量提供降级路径。
 * Clipboard / URL helpers with graceful fallbacks for restricted security contexts.
 */

/**
 * 复制文本到剪贴板，并返回三态结果以便 UI 给出对应反馈：
 *   - `copied`：复制成功；
 *   - `manual`：剪贴板 API 不可用，已弹出 prompt 让用户手动复制；
 *   - `failed`：彻底失败（例如 SSR 环境）。
 *
 * Copy text to the clipboard, returning a tri-state result so callers can react:
 *   - `copied` — succeeded;
 *   - `manual` — clipboard API unavailable, fell back to `window.prompt`;
 *   - `failed` — gave up (e.g. SSR / non-browser environment).
 */
export async function copyTextToClipboard(text: string): Promise<"copied" | "manual" | "failed"> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return "copied";
    } catch {
      // Fall through to a manual fallback for insecure contexts or blocked clipboard APIs.
      // 在非安全上下文 / 剪贴板被拒绝时，降级到下面的 prompt 路径。
    }
  }

  if (typeof window !== "undefined" && typeof window.prompt === "function") {
    // eslint-disable-next-line no-alert
    window.prompt("复制失败，请手动复制下面的链接", text);
    return "manual";
  }

  return "failed";
}

/**
 * 把相对路径转为带 origin 的绝对 URL；SSR 环境直接返回原值。
 * Convert a relative path into an absolute URL using the current origin; returns
 * the input unchanged when called during SSR.
 */
export function toAbsoluteUrl(path: string) {
  if (typeof window === "undefined") {
    return path;
  }

  try {
    return new URL(path, window.location.origin).toString();
  } catch {
    return path;
  }
}
