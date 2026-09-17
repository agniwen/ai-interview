// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { enableReactActEnvironment, waitForUi } from "@/test-utils/react-act";
import { RecruitingActionButton, RecruitingActionBusyContext } from "./recruiting-action-button";
import { PipelineStageActionBar } from "./pipeline-stage-action-bar";
import { ButtonGroup } from "@/components/ui/button-group";

enableReactActEnvironment();

describe("recruiting disabled action explanations", () => {
  it("keeps a disabled action focusable, shows its reason and blocks activation without a wrapper", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onClick = vi.fn();
    await act(() =>
      root.render(
        <ButtonGroup>
          <RecruitingActionButton disabledReason="请先确认背调通过" onClick={onClick}>
            进入入职
          </RecruitingActionButton>
        </ButtonGroup>,
      ),
    );
    const button = host.querySelector("button");
    expect(button?.parentElement?.dataset.slot).toBe("button-group");
    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute("aria-disabled")).toBe("true");
    await act(() => {
      button?.focus();
      button?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      button?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    });
    expect(onClick).not.toHaveBeenCalled();
    await waitForUi(() =>
      expect(document.querySelector('[data-slot="tooltip-content"]')?.textContent).toContain(
        "请先确认背调通过",
      ),
    );
    await act(() => button?.click());
    expect(onClick).not.toHaveBeenCalled();
    await act(() => root.unmount());
    host.remove();
  });
  it("enables an action after confirming a result while its disabled tooltip is open", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onClick = vi.fn();
    const renderAction = (reason: string | null) =>
      root.render(
        <ButtonGroup>
          <RecruitingActionButton disabledReason={reason} onClick={onClick}>
            进入入职
          </RecruitingActionButton>
        </ButtonGroup>,
      );
    await act(() => renderAction("请先确认背调通过"));
    await act(() => host.querySelector("button")?.focus());
    await waitForUi(() =>
      expect(document.querySelector('[data-slot="tooltip-content"]')?.textContent).toContain(
        "请先确认背调通过",
      ),
    );
    await act(() => renderAction(null));
    expect(host.querySelector("button")?.getAttribute("aria-disabled")).not.toBe("true");
    await act(() => host.querySelector("button")?.click());
    expect(onClick).toHaveBeenCalledTimes(1);
    await act(() => root.unmount());
    host.remove();
  });
  it("advances the full action bar after a node result changes and releases busy state", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let pending = Promise.withResolvers<null>();
    const onAdvance = vi.fn(async () => {
      pending = Promise.withResolvers<null>();
      await pending.promise;
    });
    const renderBar = (passed: boolean) =>
      root.render(
        <PipelineStageActionBar
          pipelineStage="background_check"
          currentNodePassed={passed}
          canCreateOffer
          canCreateHumanInterview
          hasJobDescription
          onAdvance={onAdvance}
          onRequestClose={vi.fn()}
          onRequestReactivate={vi.fn()}
          onViewCurrentStage={vi.fn()}
        />,
      );
    const advanceButton = () =>
      [...host.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("进入入职"),
      );
    await act(() => renderBar(false));
    expect(advanceButton()?.getAttribute("aria-disabled")).toBe("true");
    await act(() => advanceButton()?.focus());
    await act(() => renderBar(true));
    expect(advanceButton()?.getAttribute("aria-disabled")).not.toBe("true");
    await act(() => {
      const button = advanceButton();
      button?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      button?.focus();
      button?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    });
    expect(onAdvance).toHaveBeenCalledWith("onboarding");
    expect(host.textContent).toContain("处理中");
    await act(() => pending.resolve(null));
    expect(advanceButton()?.getAttribute("aria-disabled")).not.toBe("true");
    await act(() => {
      const button = advanceButton();
      button?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      button?.focus();
      button?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    });
    expect(onAdvance).toHaveBeenCalledTimes(2);
    await act(() => pending.resolve(null));
    await act(() => root.unmount());
    host.remove();
  });
  it("keeps loading actions disabled without repeating the busy tooltip", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onClick = vi.fn();
    await act(() =>
      root.render(
        <RecruitingActionBusyContext.Provider value="正在推进流程，请稍候">
          <RecruitingActionButton isLoading onClick={onClick}>
            处理中…
          </RecruitingActionButton>
        </RecruitingActionBusyContext.Provider>,
      ),
    );
    const button = host.querySelector("button");
    expect(button?.getAttribute("aria-disabled")).toBe("true");
    expect(button?.getAttribute("aria-busy")).toBe("true");
    await act(() => {
      button?.focus();
      button?.click();
    });
    expect(document.querySelector('[data-slot="tooltip-content"]')).toBeNull();
    expect(onClick).not.toHaveBeenCalled();
    await act(() => root.unmount());
    host.remove();
  });
  it("locks nested actions using the specific shared busy reason", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onClick = vi.fn();
    await act(() =>
      root.render(
        <RecruitingActionBusyContext.Provider value="正在重置面试，请稍候">
          <RecruitingActionButton onClick={onClick}>标记结束</RecruitingActionButton>
        </RecruitingActionBusyContext.Provider>,
      ),
    );
    const button = host.querySelector("button");
    await act(() => {
      button?.focus();
      button?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      button?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    });
    expect(onClick).not.toHaveBeenCalled();
    await waitForUi(() =>
      expect(document.querySelector('[data-slot="tooltip-content"]')?.textContent).toContain(
        "正在重置面试，请稍候",
      ),
    );
    await act(() => button?.click());
    expect(onClick).not.toHaveBeenCalled();
    await act(() => root.unmount());
    host.remove();
  });
});
