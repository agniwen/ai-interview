// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { setLocale } from "@/paraglide/runtime";
import DemoHumanRoom from "./demo-human-room";
import { DemoCandidateDetail } from "./demo-candidate-detail";
import { DemoProvider, useDemo } from "./demo-context";
import { DemoDialogLayer } from "./demo-dialog";
import { getDemoScreenCopy } from "./demo-screen-copy";
import { DEMO_CANDIDATE_ID } from "./demo-workflow-data";

// SAFETY: React's test-only act flag belongs to the global test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HAN_CHARACTER = /\p{Script=Han}/u;

function Harness() {
  const demo = useDemo();
  return (
    <>
      <button type="button" data-open onClick={() => demo.setCandidate({ id: DEMO_CANDIDATE_ID })}>
        open
      </button>
      <button type="button" data-finish-ai onClick={() => demo.setPhase("ai-completed")}>
        finish AI
      </button>
      {demo.candidate &&
        (demo.phase === "human-live" ? <DemoHumanRoom /> : <DemoCandidateDetail />)}
      <DemoDialogLayer />
    </>
  );
}

/** Walks the same scenes as the homepage tour; `visit` inspects the window after every step. */
async function walkWorkflow(visit: (container: HTMLElement, step: string) => void) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient();
  const request = vi.spyOn(globalThis, "fetch");
  const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  const pageStyles = [document.body.style.cssText, document.documentElement.style.cssText];
  vi.stubGlobal("matchMedia", () => ({
    addEventListener: vi.fn(),
    matches: false,
    removeEventListener: vi.fn(),
  }));
  const click = async (selector: string) => {
    const button = container.querySelector<HTMLButtonElement>(selector);
    expect(button, selector).not.toBeNull();
    await act(() => button?.click());
    expect([document.body.style.cssText, document.documentElement.style.cssText]).toEqual(
      pageStyles,
    );
    visit(container, selector);
  };
  try {
    await act(() =>
      root.render(
        <QueryClientProvider client={client}>
          <DemoProvider>
            <Harness />
          </DemoProvider>
        </QueryClientProvider>,
      ),
    );
    await click("[data-open]");
    await click('[data-demo-detail-tab="evaluation"]');
    await act(async () => {
      await import("./demo-interview-panels");
    });
    visit(container, "evaluation-loaded");
    await click("[data-demo-launch]");
    await click("[data-demo-enter-interview]");
    await click("[data-finish-ai]");
    await click('[data-demo-detail-tab="interviews"]');
    await click("[data-demo-ai-transcript]");
    await click("[data-demo-transition-human]");
    await click("[data-demo-dialog-close]");
    await click("[data-demo-enter-human-room]");
    await click("[data-demo-room-materials]");
    await click("[data-demo-timeline] li:nth-child(2) button");
    await click("[data-demo-resume-fullscreen]");
    await click("[data-demo-dialog-close]");
    await click("[data-demo-room-questions]");
    await click("[data-demo-room-review]");
    await click("[data-demo-finish-human]");
    await click('[data-demo-detail-tab="human"]');
    await click("[data-demo-human-analysis] button[aria-expanded]");
    await click("[data-demo-transition-offer]");
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    request.mockRestore();
    if (originalScroll) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScroll);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
    vi.unstubAllGlobals();
    client.clear();
    container.remove();
  }
}

afterEach(() => {
  setLocale("zh-CN", { reload: false });
});

it("keeps the identity while showing evaluation, round and Offer scenes", async () => {
  setLocale("zh-CN", { reload: false });
  const copy = getDemoScreenCopy();
  const seen = new Map<string, string>();
  await walkWorkflow((container, step) => {
    seen.set(step, container.textContent ?? "");
    if (step === "[data-demo-transition-offer]") {
      expect(
        container.querySelector<HTMLElement>('[data-slot="demo-candidate-detail"]')?.dataset
          .candidateId,
      ).toBe(DEMO_CANDIDATE_ID);
      expect(container.querySelector("h1")?.textContent).toBe(copy.people.candidate);
    }
    if (step === "[data-demo-launch]") {
      expect(container.querySelector('[data-slot="demo-dialog"]')?.textContent).toContain(
        copy.detail.launchAi,
      );
    }
    if (step === "[data-demo-transition-human]") {
      expect(
        container.querySelector('[data-slot="demo-dialog"] button:disabled')?.textContent,
      ).toBe(copy.dialog.saveSchedule);
    }
    if (step === "[data-demo-resume-fullscreen]") {
      const dialog = container.querySelector('[data-slot="demo-dialog"]')?.textContent;
      expect(dialog).toContain(copy.dialog.structuredResume);
      expect(dialog).not.toContain(copy.dialog.saveSchedule);
    }
    if (step === "[data-demo-enter-interview]") {
      expect(container.querySelector('[data-slot="demo-dialog"]')).toBeNull();
    }
  });
  expect(seen.get("evaluation-loaded")).toContain(copy.evaluationUi.dimensionsTitle);
  expect(seen.get("evaluation-loaded")).toContain(copy.desk.highlyRecommended);
  expect(seen.get('[data-demo-detail-tab="interviews"]')).toContain("86 / 100");
  expect(seen.get("[data-demo-enter-human-room]")).toContain(copy.people.interviewer);
  expect(seen.get("[data-demo-timeline] li:nth-child(2) button")).toContain(
    copy.room.historyRoundLabel,
  );
  expect(seen.get("[data-demo-room-review]")).toContain(copy.room.reviewFields.conclusion);
  expect(seen.get('[data-demo-detail-tab="human"]')).toContain(
    copy.round.title(1, copy.humanInterview.roundLabel),
  );
  expect(seen.get("[data-demo-human-analysis] button[aria-expanded]")).toContain(
    copy.round.detailedAnalysis,
  );
  expect(seen.get("[data-demo-transition-offer]")).toContain(copy.offer.progress.label);
  expect(seen.get("[data-demo-transition-offer]")).toContain("19,000");
});

it("renders every demo scene in the visitor's language without Chinese leftovers", async () => {
  setLocale("en", { reload: false });
  await walkWorkflow((container, step) => {
    const leftover = [...container.querySelectorAll("*")]
      .flatMap((element) => [
        ...[...element.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? ""),
        element.getAttribute("aria-label") ?? "",
      ])
      .find((text) => HAN_CHARACTER.test(text));
    expect(leftover, step).toBeUndefined();
  });
});
