// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setTimeout as delay } from "node:timers/promises";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HumanInterviewOutcomeDialog } from "./human-interview-outcome-dialog";

const api = { resolveHumanInterviewRoundOutcome: vi.fn() };
const dependencies = {
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  save: api.resolveHumanInterviewRoundOutcome,
};
// SAFETY: React's test-only flag belongs to the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((media: string) => ({
    addEventListener: vi.fn(),
    matches: false,
    media,
    removeEventListener: vi.fn(),
  })),
});
afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = "";
  vi.clearAllMocks();
});
async function flush() {
  await act(async () => {
    await delay(0);
  });
}
function render() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  const close = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <HumanInterviewOutcomeDialog
          dependencies={dependencies}
          round={{ id: "round", interviewRecordId: "candidate", label: "业务一面" }}
          slug="light"
          onClose={close}
        />
      </QueryClientProvider>,
    ),
  );
  const select = document.querySelector("select");
  const button = [...document.querySelectorAll("button")].find(
    (item) => item.textContent === "确认修改",
  );
  if (!select || !button) {
    throw new Error("找不到修改结论控件");
  }
  return { button, close, invalidate, select };
}
describe("historical outcome dialog", () => {
  it.each(["pass", "fail"] as const)(
    "requires selection and refreshes the candidate after %s",
    async (outcome) => {
      api.resolveHumanInterviewRoundOutcome.mockResolvedValue({ ok: true });
      const { button, select, close, invalidate } = render();
      expect(select.value).toBe("");
      expect(button.disabled).toBe(true);
      expect([...select.options].map((option) => option.value)).toEqual(["", "pass", "fail"]);
      act(() => {
        select.value = outcome;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      act(() => button.click());
      await flush();
      expect(api.resolveHumanInterviewRoundOutcome).toHaveBeenCalledWith(
        "light",
        "candidate",
        "round",
        outcome,
      );
      expect(invalidate).toHaveBeenCalled();
      expect(close).toHaveBeenCalledOnce();
    },
  );
  it("keeps the chosen conclusion open on failure", async () => {
    api.resolveHumanInterviewRoundOutcome.mockRejectedValue(new Error("冲突，请刷新"));
    const { button, select, close, invalidate } = render();
    act(() => {
      select.value = "fail";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    act(() => button.click());
    await flush();
    expect(close).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(select.value).toBe("fail");
    expect(button.disabled).toBe(false);
  });
});
