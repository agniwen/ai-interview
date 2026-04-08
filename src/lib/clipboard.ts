export async function copyTextToClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    }
    catch {
      // Fall through to a DOM-based copy fallback for older browsers or blocked clipboard APIs.
    }
  }

  if (typeof document === 'undefined') {
    return false;
  }

  const textarea = document.createElement('textarea');
  const selection = document.getSelection();
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index))
    : [];

  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  try {
    return document.execCommand('copy');
  }
  catch {
    return false;
  }
  finally {
    document.body.removeChild(textarea);

    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) {
        selection.addRange(range);
      }
    }

    activeElement?.focus();
  }
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
