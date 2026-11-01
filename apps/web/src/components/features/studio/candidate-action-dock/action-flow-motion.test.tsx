// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  enableReactActEnvironment,
  renderInAct,
  unmountInAct,
  waitForUi,
} from "@/test-utils/react-act";
import { CandidateActionDock, useCandidateActionFlow } from "./candidate-action-dock";
import { ActionFlowSurface } from "./action-flow-surface";
import type { CandidateActionId } from "./action-flow-state";

enableReactActEnvironment();
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockReturnValue({
    addEventListener: vi.fn(),
    matches: false,
    removeEventListener: vi.fn(),
  }),
});

function Flow({ id }: { id: CandidateActionId }) {
  const flow = useCandidateActionFlow(id);
  return (
    <>
      <button data-trigger={id} onClick={() => flow.setOpen(true)}>
        {id}
      </button>
      <ActionFlowSurface flowId={id} open={flow.open} onOpenChange={flow.setOpen} title={id}>
        <input aria-label={id} defaultValue="保留草稿" />
      </ActionFlowSurface>
    </>
  );
}

const flowIds: CandidateActionId[] = [
  "reopen-candidate",
  "review-node",
  "reset-ai-round",
  "close-candidate",
  "schedule-interview",
  "launch-ai-interview",
  "interview-questions",
];

describe("action panel motion", () => {
  it("reveals first mounts and resumed flows with real motion enabled", async () => {
    const view = await renderInAct(
      <StrictMode>
        <CandidateActionDock candidateName="测试">
          {flowIds.map((id) => (
            <Flow key={id} id={id} />
          ))}
        </CandidateActionDock>
      </StrictMode>,
    );
    try {
      // Interrupt entry before it finishes, then reopen the same retained panel.
      await act(() =>
        view.container
          .querySelector<HTMLButtonElement>('[data-trigger="reopen-candidate"]')
          ?.click(),
      );
      const interrupted = view.container.querySelector<HTMLElement>(
        '[data-action-flow="reopen-candidate"]',
      );
      await act(() => interrupted?.querySelector<HTMLButtonElement>("button")?.click());
      await waitForUi(() => expect(interrupted?.hidden).toBe(true));
      for (const id of [...flowIds, "reopen-candidate"]) {
        await act(() =>
          view.container.querySelector<HTMLButtonElement>(`[data-trigger="${id}"]`)?.click(),
        );
        const section = view.container.querySelector<HTMLElement>(`[data-action-flow="${id}"]`);
        await waitForUi(() => {
          expect(section?.hidden).toBe(false);
          expect(section?.querySelector<HTMLElement>(":scope > div")?.style.opacity).toBe("1");
        });
        expect(section?.querySelector("input")?.value).toBe("保留草稿");
        await act(() => section?.querySelector<HTMLButtonElement>("button")?.click());
        await waitForUi(() => expect(section?.hidden).toBe(true));
      }
    } finally {
      await unmountInAct(view.root);
      view.container.remove();
    }
  });
});
