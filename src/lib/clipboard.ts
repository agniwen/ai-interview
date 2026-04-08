export async function copyTextToClipboard(text: string): Promise<'copied' | 'manual' | 'failed'> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
    catch {
      // Fall through to a manual fallback for insecure contexts or blocked clipboard APIs.
    }
  }

  if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
    // eslint-disable-next-line no-alert
    window.prompt('复制失败，请手动复制下面的链接', text);
    return 'manual';
  }

  return 'failed';
}

export function toAbsoluteUrl(path: string) {
  if (typeof window === 'undefined') {
    return path;
  }

  try {
    return new URL(path, window.location.origin).toString();
  }
  catch {
    return path;
  }
}
