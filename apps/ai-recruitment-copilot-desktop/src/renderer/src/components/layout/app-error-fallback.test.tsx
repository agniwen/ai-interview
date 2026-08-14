import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppErrorFallback } from "./app-error-fallback";

describe("AppErrorFallback", () => {
  it("centers the error on a full-page drag surface and isolates the reload control", () => {
    const html = renderToStaticMarkup(
      <AppErrorFallback error={new Error("字幕服务暂时不可用")} onReload={vi.fn()} />,
    );

    expect(html).toContain("出了点问题");
    expect(html).toContain("字幕服务暂时不可用");
    expect(html).toContain("重新加载");
    expect(html).toContain("app-drag");
    expect(html).toContain("app-no-drag");
    expect(html).toContain('aria-label="重新加载并回到首页"');
  });
});
