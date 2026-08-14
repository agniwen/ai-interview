export const APP_WATERMARK_HOST_ATTR = "data-app-watermark-host";

export interface AppWatermarkInstance {
  create: () => Promise<void> | void;
  destroy: () => void;
}

export interface AppWatermarkMountOptions {
  backgroundRepeat: "repeat";
  content: string;
  contentType: "multi-line-text";
  fontColor: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  height: number;
  lineHeight: number;
  monitorProtection: boolean;
  mutationObserve: boolean;
  parent: HTMLElement;
  rotate: number;
  textAlign: "center";
  textBaseline: "middle";
  width: number;
  zIndex: number;
}

export function getWatermarkText(lines: readonly [string, string]): string {
  return lines.join("\n");
}

async function settleCreate(
  createResult: Promise<void> | void,
  isDisposed: () => boolean,
  teardown: () => void,
): Promise<void> {
  try {
    await createResult;
  } catch {
    // Create failures still need teardown if the caller already stopped.
  }

  if (isDisposed()) {
    teardown();
  }
}

export function startAppWatermark({
  createWatermark,
  text,
}: {
  createWatermark: (options: AppWatermarkMountOptions) => AppWatermarkInstance;
  text: string;
}): () => void {
  let disposed = false;
  const host = document.createElement("div");
  host.setAttribute(APP_WATERMARK_HOST_ATTR, "");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "inset:0;pointer-events:none;position:fixed;z-index:2147483647";
  document.body.append(host);

  const instance = createWatermark({
    backgroundRepeat: "repeat",
    content: text,
    contentType: "multi-line-text",
    fontColor: "rgba(71, 85, 105, 0.12)",
    fontFamily: "MiSans, Arial, sans-serif",
    fontSize: "14px",
    fontWeight: "500",
    height: 160,
    lineHeight: 22,
    monitorProtection: true,
    mutationObserve: true,
    parent: host,
    rotate: 24,
    textAlign: "center",
    textBaseline: "middle",
    width: 260,
    zIndex: 2_147_483_647,
  });

  function teardown() {
    instance.destroy();
    host.remove();
  }

  void settleCreate(instance.create(), () => disposed, teardown);

  return () => {
    disposed = true;
    teardown();
  };
}
