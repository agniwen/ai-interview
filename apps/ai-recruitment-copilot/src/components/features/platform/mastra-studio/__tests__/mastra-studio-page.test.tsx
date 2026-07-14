// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enableReactActEnvironment,
  renderInAct,
  unmountInAct,
  waitForUi,
} from "@/test-utils/react-act";
import { MastraStudioPage } from "../mastra-studio-page";

enableReactActEnvironment();

const roots: Awaited<ReturnType<typeof renderInAct>>["root"][] = [];

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
  vi.unstubAllGlobals();
});

describe("MastraStudioPage", () => {
  it("shows an actionable error when the Studio source server is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 502 })));
    const { root } = await renderInAct(<MastraStudioPage />);
    roots.push(root);

    await waitForUi(() => {
      expect(document.body.textContent).toContain("Mastra Studio 未启动");
      expect(document.body.textContent).toContain("pnpm mastra:studio:source");
    });
  });

  it("retries the availability check before rendering the Studio frame", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { root } = await renderInAct(<MastraStudioPage />);
    roots.push(root);

    await waitForUi(() => {
      expect(document.querySelector("button")?.textContent).toContain("重试");
    });

    await act(async () => {
      document.querySelector("button")?.click();
      await Promise.resolve();
    });

    await waitForUi(() => {
      expect(document.querySelector('iframe[title="Mastra Studio"]')).toBeTruthy();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
