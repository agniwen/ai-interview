// @vitest-environment jsdom
/* oxlint-disable anti-slop/no-module-mocking -- A deferred module double is required to observe the real React.lazy Suspense boundary before the chunk resolves. */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import {
  LazyRecruitingConversationThread,
  preloadRecruitingConversationThread,
} from "./lazy-recruiting-conversation-thread";

const conversationModule = vi.hoisted(() => ({
  imports: 0,
  ...Promise.withResolvers<{
    default: (props: { historyLoading: boolean }) => React.ReactNode;
  }>(),
}));

vi.mock("./recruiting-conversation-thread", () => {
  conversationModule.imports += 1;
  return conversationModule.promise;
});

// SAFETY: React 19 reads this documented test-environment flag from the global object.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("LazyRecruitingConversationThread", () => {
  it("shares one preload with Suspense and preserves a conversation-shaped fallback", async () => {
    const preload = preloadRecruitingConversationThread();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <LazyRecruitingConversationThread
          conversationId="conversation-1"
          historyLoading
          historyLoadingFallback={<div />}
          isRunning={false}
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(conversationModule.imports).toBe(1);
    expect(container.querySelector('[aria-label="聊天界面加载中"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="聊天界面加载中"]')?.className).toContain(
      "flex-col",
    );
    expect(container.querySelector('[class*="rounded-[28px]"]')).not.toBeNull();

    await act(async () => {
      conversationModule.resolve({
        default: ({ historyLoading }) => (
          <div data-history-loading={String(historyLoading)} data-testid="loaded-thread" />
        ),
      });
      await preload;
    });

    expect(container.querySelector('[data-testid="loaded-thread"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="聊天界面加载中"]')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
