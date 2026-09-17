// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  enableReactActEnvironment,
  renderInAct,
  unmountInAct,
  waitForUi,
} from "@/test-utils/react-act";
import { useFeishuNotificationPreview } from "../notifications-grid";

enableReactActEnvironment();

type Preview = Awaited<ReturnType<NonNullable<Parameters<typeof useFeishuNotificationPreview>[0]>>>;

function result(title: string): Preview {
  return { block: { block_type: 1, children: [] }, prompt: "测试提示", title };
}

async function mountPreview(
  generate: NonNullable<Parameters<typeof useFeishuNotificationPreview>[0]>,
) {
  const client = new QueryClient();
  function Harness() {
    const preview = useFeishuNotificationPreview(generate);
    return (
      <>
        <button onClick={() => preview.show("first")}>first</button>
        <button onClick={() => preview.show("second")}>second</button>
        <button onClick={() => preview.onOpenChange(false)}>close</button>
        <output>
          {preview.open
            ? `${preview.mutation.status}:${preview.mutation.data?.title ?? ""}`
            : "closed"}
        </output>
      </>
    );
  }
  const { container, root } = await renderInAct(
    <StrictMode>
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>
    </StrictMode>,
  );
  return {
    click: (label: string) => {
      const button = [...container.querySelectorAll("button")].find(
        (item) => item.textContent === label,
      );
      if (!button) {
        throw new Error("Missing button");
      }
      act(() => button.click());
    },
    close: async () => {
      await unmountInAct(root);
      container.remove();
      client.clear();
    },
    container,
  };
}

describe("notification preview user actions", () => {
  it("generates only on a user action, including reopening the same notification", async () => {
    const generate = vi.fn(() => Promise.resolve(result("预览")));
    const view = await mountPreview(generate);
    try {
      expect(generate).not.toHaveBeenCalled();
      await view.click("first");
      await waitForUi(() =>
        expect(view.container.querySelector("output")?.textContent).toBe("success:预览"),
      );
      expect(generate).toHaveBeenCalledTimes(1);
      await view.click("close");
      await view.click("first");
      await waitForUi(() => expect(generate).toHaveBeenCalledTimes(2));
    } finally {
      await view.close();
    }
  });

  it("does not let a closed preview overwrite a newer request", async () => {
    const first = Promise.withResolvers<Preview>();
    const second = Promise.withResolvers<Preview>();
    const generate = vi.fn((id: string) => (id === "first" ? first.promise : second.promise));
    const view = await mountPreview(generate);
    try {
      await view.click("first");
      await view.click("close");
      await view.click("second");
      await act(() => second.resolve(result("第二条")));
      await waitForUi(() =>
        expect(view.container.querySelector("output")?.textContent).toBe("success:第二条"),
      );
      await act(() => first.resolve(result("第一条")));
      await waitForUi(() =>
        expect(view.container.querySelector("output")?.textContent).toBe("success:第二条"),
      );
    } finally {
      await view.close();
    }
  });
});
