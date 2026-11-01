import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecruitingCardsView } from "../recruiting-cards-view";
import type { RecruitingCardsViewProps } from "../recruiting-cards-view";
import { detailCard, listCard } from "./fixtures";

// SAFETY: React 只在该全局标记为 true 时把 act() 视为测试环境。
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(props: Partial<RecruitingCardsViewProps>) {
  const host = document.createElement("div");
  document.body.append(host);
  const nextRoot = createRoot(host);
  container = host;
  root = nextRoot;
  act(() => {
    nextRoot.render(
      <RecruitingCardsView
        card={null}
        detail={null}
        error={null}
        onBack={vi.fn()}
        pendingCandidateId={null}
        {...props}
      />,
    );
  });
  return host;
}

function buttonByText(view: HTMLElement, text: string) {
  return [...view.querySelectorAll("button")].find((button) => button.textContent?.includes(text));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("RecruitingCardsView", () => {
  it("lists candidates and drills into the one the user picks", () => {
    const onSelectCandidate = vi.fn();
    const view = render({ card: listCard, onSelectCandidate });

    expect(view.textContent).toContain("共找到 5 位候选人");
    expect(view.textContent).toContain("还有 3 位未展示");
    act(() => buttonByText(view, "李雷")?.click());

    expect(onSelectCandidate).toHaveBeenCalledWith("resume-2");
  });

  it("marks the candidate being loaded as busy and blocks repeat clicks", () => {
    const view = render({
      card: listCard,
      onSelectCandidate: vi.fn(),
      pendingCandidateId: "resume-1",
    });
    const pending = buttonByText(view, "张妍");

    expect(pending?.getAttribute("aria-busy")).toBe("true");
    expect(pending?.disabled).toBe(true);
  });

  it("opens the workspace link and returns to the list from a drilled-in detail", () => {
    const onBack = vi.fn();
    const onOpenLink = vi.fn();
    const view = render({ card: listCard, detail: detailCard, onBack, onOpenLink });

    expect(view.textContent).toContain("沟通清晰，期望薪资在预算内。");
    act(() => buttonByText(view, "在工作台打开")?.click());
    act(() => buttonByText(view, "返回列表")?.click());

    expect(onOpenLink).toHaveBeenCalledWith(detailCard.candidate.url);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("has no back action when the tool result itself is a candidate detail", () => {
    const view = render({ card: detailCard, onOpenLink: vi.fn() });

    expect(buttonByText(view, "返回列表")).toBeUndefined();
    expect(buttonByText(view, "在工作台打开")).toBeDefined();
  });

  it("shows the server's error when there is no card to render", () => {
    const view = render({ error: "候选人不存在或不可访问。" });

    expect(view.textContent).toBe("候选人不存在或不可访问。");
  });
});
