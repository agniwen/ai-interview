// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enableReactActEnvironment, waitForUi } from "@/test-utils/react-act";
import {
  CandidateActionDock,
  useCandidateActionFlow,
  useActionFlowCompletion,
  useActionRecordVersion,
} from "./candidate-action-dock";
import { ActionFlowSurface } from "./action-flow-surface";
import { dockReducer } from "./action-flow-state";

enableReactActEnvironment();
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi
    .fn()
    .mockReturnValue({ addEventListener: vi.fn(), matches: true, removeEventListener: vi.fn() }),
});

function TestFlow({
  submit,
  version = 1,
}: {
  submit: (reason: string, version: number) => Promise<void>;
  version?: number;
}) {
  const flow = useCandidateActionFlow("review-node");
  const complete = useActionFlowCompletion("review-node");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expectedVersion = useActionRecordVersion(flow.open, version);
  const [selector, setSelector] = useState(false);
  return (
    <>
      <button
        onClick={() => {
          if (!flow.open) {
            setReason("");
          }
          flow.setOpen(true);
        }}
      >
        填写结果
      </button>
      <ActionFlowSurface
        flowId="review-node"
        title="确认结果"
        open={flow.open}
        onOpenChange={flow.setOpen}
        busy={busy}
        error={error}
        footer={
          <>
            <button disabled={busy} onClick={() => flow.setOpen(false)}>
              放弃填写
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                if (busy) {
                  return;
                }
                setBusy(true);
                setError(null);
                try {
                  await submit(reason, expectedVersion ?? version);
                  complete("已保存");
                  flow.setOpen(false);
                } catch {
                  setError("提交失败，请重试");
                } finally {
                  setBusy(false);
                }
              }}
            >
              提交
            </button>
          </>
        }
      >
        <input aria-label="说明" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button onClick={() => setSelector(true)}>打开选择器</button>
        {selector
          ? createPortal(
              <button
                data-selector
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSelector(false);
                  }
                }}
              >
                选择器
              </button>,
              document.body,
            )
          : null}
      </ActionFlowSurface>
    </>
  );
}
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});
async function mount(submit = vi.fn().mockResolvedValue(null)) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = async (candidate = "a", version = 1) => {
    await act(() =>
      root.render(
        <>
          <button data-background>查看简历</button>
          <CandidateActionDock key={candidate} candidateName={candidate}>
            <TestFlow submit={submit} version={version} />
          </CandidateActionDock>
        </>,
      ),
    );
  };
  cleanups.push(async () => {
    await act(() => root.unmount());
    host.remove();
  });
  await render();
  return { host, render, submit };
}
async function click(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (el) => el.textContent === text && !el.closest("[hidden]"),
  );
  expect(button, text).toBeDefined();
  await act(() => {
    button?.focus();
    button?.click();
  });
}
async function fill(value: string) {
  const input = document.querySelector<HTMLInputElement>('input[aria-label="说明"]');
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function expanded() {
  return document.querySelector<HTMLElement>('[data-slot="candidate-action-dock"]')?.dataset
    .expanded;
}

describe("candidate action dock", () => {
  it("retains draft on return, restores focus, and clears only on explicit discard", async () => {
    await mount();
    await click("填写结果");
    await fill("已沟通");
    await waitForUi(() =>
      expect(
        document.querySelector<HTMLElement>('[data-action-flow="review-node"] > div')?.style
          .opacity,
      ).toBe("1"),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement?.textContent).toBe("确认结果");
    await click("返回操作");
    expect(expanded()).toBe("false");
    await waitForUi(() => expect(document.activeElement?.textContent).toBe("填写结果"));
    await click("填写结果");
    expect(document.querySelector<HTMLInputElement>("input")?.value).toBe("已沟通");
    await click("放弃填写");
    await click("填写结果");
    expect(document.querySelector<HTMLInputElement>("input")?.value).toBe("");
  });
  it("keeps failures and drafts visible, freezes edit version, then completes on retry", async () => {
    const submit = vi.fn().mockRejectedValueOnce(new Error("conflict")).mockResolvedValueOnce(null);
    const view = await mount(submit);
    await click("填写结果");
    await fill("结果说明");
    await view.render("a", 2);
    await click("提交");
    expect(submit).toHaveBeenCalledWith("结果说明", 1);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("提交失败");
    expect(expanded()).toBe("true");
    await click("提交");
    expect(expanded()).toBe("false");
    expect(document.querySelector("output")?.textContent).toBe("已保存");
  });
  it("isolates candidates and ignores old asynchronous completion", async () => {
    const deferred = Promise.withResolvers<null>();
    const submit = vi.fn(async () => {
      await deferred.promise;
    });
    const view = await mount(submit);
    await click("填写结果");
    await fill("候选人 A");
    await click("提交");
    await click("返回操作");
    expect(expanded()).toBe("true");
    await click("提交");
    expect(submit).toHaveBeenCalledOnce();
    await view.render("b");
    await click("填写结果");
    expect(document.querySelector<HTMLInputElement>("input")?.value).toBe("");
    await act(() => deferred.resolve(null));
    expect(expanded()).toBe("true");
  });
  it("keeps background interactive and gives portalled selectors and IME precedence over Escape", async () => {
    await mount();
    await click("填写结果");
    await click("查看简历");
    expect(expanded()).toBe("true");
    await click("打开选择器");
    await act(() =>
      document
        .querySelector("[data-selector]")
        ?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })),
    );
    expect(expanded()).toBe("true");
    const input = document.querySelector("input");
    await act(() =>
      input?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, isComposing: true, key: "Escape" }),
      ),
    );
    expect(expanded()).toBe("true");
    await act(() =>
      input?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })),
    );
    expect(expanded()).toBe("false");
  });
  it("does not let cleanup from an older flow close a newer one", () => {
    expect(
      dockReducer({ active: "review-node" }, { id: "close-candidate", type: "leave" }),
    ).toEqual({ active: "review-node" });
  });
});
