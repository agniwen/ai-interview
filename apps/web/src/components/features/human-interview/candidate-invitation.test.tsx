// @vitest-environment jsdom
import { act } from "react";
import * as m from "@/paraglide/messages";
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
        jobDescriptionName="高级前端开发工程师"
        jobDescriptionPrompt="## 工作职责\n- 负责前端架构"
        roundLabel="业务三面"
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
  it("shows company information in a second tab when configured", async () => {
    const { container } = render({ companyContext: "我们是一家专注协作的公司。" });
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual(["岗位 JD", "公司信息"]);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    await act(() => tabs[1]?.click());
    expect(container.querySelector('[role="tabpanel"]')?.textContent).toContain(
      "我们是一家专注协作的公司。",
    );
  });

  it.each([undefined, null, "", "   "])(
    "keeps the original JD without company context %s",
    (companyContext) => {
      const { container } = render({ companyContext });
      expect(container.querySelector('[role="tablist"]')).toBeNull();
      expect(container.textContent).toContain("岗位 JD");
      expect(container.textContent).toContain("负责前端架构");
    },
  );

  it("keeps acceptance and decline callbacks and shows the appointment in Beijing time", async () => {
    const { container, onRespond } = render();
    expect(container.textContent).toContain("张居正，请确认是否参加本次面试。");
    expect(container.textContent).toContain("14:23（北京时间）");
    expect(container.querySelector("h1")?.textContent).toBe("高级前端开发工程师");
    expect(container.textContent).toContain("业务三面");
    expect(container.textContent).toContain("负责前端架构");
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

  it("uses the meeting theme and exposes the theme control", () => {
    const bodyClassName = document.body.className;
    const documentTheme = document.documentElement.className;
    const { container } = render();
    expect(container.querySelector("main")?.classList.contains("dark")).toBe(false);
    expect(container.querySelector("main")?.classList.contains("bg-background")).toBe(true);
    expect(container.querySelectorAll("button")).toHaveLength(3);
    expect(
      [...container.querySelectorAll("button")].some(
        (button) => button.getAttribute("aria-label") === m.theme_switcher_label(),
      ),
    ).toBe(true);
    expect(document.body.className).toBe(bodyClassName);
    expect(document.documentElement.className).toBe(documentTheme);
  });

  it("shows honest fallbacks when no job details are available", () => {
    const { container } = render({ jobDescriptionName: null, jobDescriptionPrompt: null });
    expect(container.textContent).toContain("岗位信息待确认");
    expect(container.textContent).toContain("暂未提供岗位 JD");
  });

  it("handles missing appointment time without inventing a date", () => {
    const { container } = render({ scheduledAt: null });
    expect(container.textContent).toContain("具体时间请联系招聘负责人确认");
    expect(container.querySelector("time")).toBeNull();
  });
});
