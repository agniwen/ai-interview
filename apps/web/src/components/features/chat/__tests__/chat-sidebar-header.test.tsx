// @vitest-environment jsdom

import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { enableReactActEnvironment, renderInAct, unmountInAct } from "@/test-utils/react-act";
import { ChatSidebarHeader } from "../chat-sidebar-slots";

enableReactActEnvironment();
const roots: Root[] = [];

function HeaderHarness({ onNewConversation }: { onNewConversation: () => void }) {
  const [editMode, setEditMode] = useState(false);
  return (
    <SidebarProvider>
      <ChatSidebarHeader
        editMode={editMode}
        isBulkDeleting={false}
        onBulkDelete={vi.fn()}
        onNewConversation={onNewConversation}
        onToggleEditMode={() => setEditMode((current) => !current)}
        selectedCount={0}
      />
    </SidebarProvider>
  );
}

function findButton(label: string) {
  return [...document.querySelectorAll("button")].find(
    (button) => button.textContent === label || button.getAttribute("aria-label") === label,
  );
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() }),
  });
});

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
  document.body.innerHTML = "";
});

describe("ChatSidebarHeader bulk edit", () => {
  it("keeps New chat in place but disabled while bulk editing", async () => {
    const onNewConversation = vi.fn();
    const { root } = await renderInAct(<HeaderHarness onNewConversation={onNewConversation} />);
    roots.push(root);

    act(() => findButton("批量编辑")?.click());

    const newChat = findButton("创建对话");
    expect(newChat).toBeDefined();
    expect(newChat?.disabled).toBe(true);
    act(() => newChat?.click());
    expect(onNewConversation).not.toHaveBeenCalled();

    act(() => findButton("退出批量编辑")?.click());

    expect(findButton("创建对话")?.disabled).toBe(false);
    act(() => findButton("创建对话")?.click());
    expect(onNewConversation).toHaveBeenCalledOnce();
  });
});
