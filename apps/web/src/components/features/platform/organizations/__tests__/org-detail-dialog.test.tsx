// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  enableReactActEnvironment,
  installNoopResizeObserver,
  installNoopWebAnimations,
  renderInAct,
  unmountInAct,
  waitForUi,
} from "@/test-utils/react-act";
import { OrgDetailDialog } from "../org-detail-dialog";
import type { ComponentProps } from "react";

enableReactActEnvironment();
installNoopResizeObserver();
installNoopWebAnimations();
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (media: string): MediaQueryList => ({
    addEventListener: () => {},
    addListener: () => {},
    dispatchEvent: () => false,
    matches: false,
    media,
    onchange: null,
    removeEventListener: () => {},
    removeListener: () => {},
  }),
});

type LoadDetail = NonNullable<ComponentProps<typeof OrgDetailDialog>["loadDetail"]>;
type Detail = Awaited<ReturnType<LoadDetail>>;
function detail(id: string, page = 1): Detail {
  return {
    members: { page, pageSize: 10, records: [], total: 20, totalPages: 2 },
    organization: { createdAt: "2026-01-01", id, metadata: null, name: `工作区 ${id}`, slug: id },
  };
}

async function mountDialog(loadDetail: LoadDetail) {
  const client = new QueryClient();
  function tree(id: string, open = true) {
    return (
      <QueryClientProvider client={client}>
        <OrgDetailDialog loadDetail={loadDetail} onOpenChange={() => {}} open={open} orgId={id} />
      </QueryClientProvider>
    );
  }
  const { container, root } = await renderInAct(tree("A"));
  return {
    close: async () => {
      await unmountInAct(root);
      container.remove();
      client.clear();
    },
    render: (id: string, open = true) => act(() => root.render(tree(id, open))),
  };
}

function button(text: string) {
  const element = [...document.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(text),
  );
  if (!element) {
    throw new Error(`Missing button: ${text}`);
  }
  return element;
}

describe("organization detail request ownership", () => {
  it("never shows the previous organization when its slower request completes", async () => {
    const first = Promise.withResolvers<Detail>();
    const second = Promise.withResolvers<Detail>();
    const load = vi.fn((id: string) => (id === "A" ? first.promise : second.promise));
    const view = await mountDialog(load);
    try {
      await view.render("B");
      await act(() => second.resolve(detail("B")));
      await waitForUi(() => expect(document.body.textContent).toContain("工作区 B"));
      await act(() => first.resolve(detail("A")));
      await waitForUi(() => {
        expect(document.body.textContent).toContain("工作区 B");
        expect(document.body.textContent).not.toContain("工作区 A");
      });
    } finally {
      await view.close();
    }
  });

  it("keeps the current page visible while loading and resets pagination on reopen", async () => {
    const nextPage = Promise.withResolvers<Detail>();
    const load = vi.fn((id: string, page: number) =>
      page === 2 ? nextPage.promise : Promise.resolve(detail(id)),
    );
    const view = await mountDialog(load);
    try {
      await waitForUi(() => expect(document.body.textContent).toContain("第 1 / 2 页"));
      act(() => button("下一页").click());
      await waitForUi(() => expect(load).toHaveBeenCalledWith("A", 2));
      expect(document.body.textContent).toContain("第 1 / 2 页");
      expect(button("下一页").disabled).toBe(true);
      await act(() => nextPage.resolve(detail("A", 2)));
      await waitForUi(() => expect(document.body.textContent).toContain("第 2 / 2 页"));
      await view.render("A", false);
      await view.render("A");
      await waitForUi(() => expect(document.body.textContent).toContain("第 1 / 2 页"));
    } finally {
      await view.close();
    }
  });

  it("shows a retryable error instead of leaving a rejected effect request unhandled", async () => {
    const load = vi
      .fn<LoadDetail>()
      .mockRejectedValueOnce(new Error("连接中断"))
      .mockResolvedValue(detail("A"));
    const view = await mountDialog(load);
    try {
      await waitForUi(() => expect(document.body.textContent).toContain("连接中断"));
      act(() => button("重试").click());
      await waitForUi(() => expect(document.body.textContent).toContain("工作区 A"));
    } finally {
      await view.close();
    }
  });
});
