// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CandidateInvitation } from "./candidate-invitation";

// SAFETY: React's test-only act flag is intentionally attached to the jsdom global.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = "";
  document.body.className = "";
});

function render(overrides: Partial<React.ComponentProps<typeof CandidateInvitation>> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const onRespond = vi.fn(async () => {});
  act(() =>
    root.render(
      <CandidateInvitation
        candidateName="张居正"
        title="张居正-高级前端开发工程师-业务三面"
        scheduledAt="2026-09-10T06:23:00Z"
        canRespond
        pending={false}
        onRespond={onRespond}
        {...overrides}
      />,
    ),
  );
  return { container, onRespond };
}

describe("candidate invitation", () => {
  it("keeps acceptance and decline callbacks and shows the appointment in Beijing time", async () => {
    const { container, onRespond } = render();
    expect(container.textContent).toContain("张居正，请确认是否参加本次面试。");
    expect(container.textContent).toContain("14:23（北京时间）");
    const buttons = [...container.querySelectorAll("button")];
    await act(() => buttons.find((button) => button.textContent === "确认参加")?.click());
    await act(() => buttons.find((button) => button.textContent === "无法参加")?.click());
    expect(onRespond.mock.calls).toEqual([["accept"], ["decline"]]);
  });

  it.each(["你已拒绝本次面试，如需变更请联系 HR。", "该邀请已失效，请联系 HR。"])(
    "hides response actions for %s",
    (message) => {
      const { container } = render({ canRespond: false, message });
      expect(container.textContent).toContain(message);
      expect(container.textContent).not.toContain("确认参加");
      expect(container.textContent).not.toContain("无法参加");
    },
  );

  it("disables both responses while submitting", () => {
    const { container } = render({ pending: true });
    expect(container.querySelectorAll("button:disabled")).toHaveLength(2);
  });

  it("uses the meeting theme without an independent appearance control", () => {
    document.body.className = "human-interview-palette";
    const documentTheme = document.documentElement.className;
    const { container } = render();
    expect(container.querySelector("main")?.classList.contains("dark")).toBe(true);
    expect(container.querySelector("main")?.classList.contains("bg-background")).toBe(true);
    expect(container.querySelectorAll("button")).toHaveLength(2);
    expect(document.body.className).toBe("human-interview-palette");
    expect(document.documentElement.className).toBe(documentTheme);
  });

  it("handles missing appointment time without inventing a date", () => {
    const { container } = render({ scheduledAt: null });
    expect(container.textContent).toContain("具体时间请联系招聘负责人确认");
    expect(container.querySelector("time")).toBeNull();
  });
});
