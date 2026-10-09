// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { MeetingInfoHoverCard } from "./meeting-info-hover-card";

// SAFETY: React's test-only act flag is intentionally attached to the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

it("shows the meeting details and the resume uploader in the hover card", async () => {
  vi.stubGlobal("matchMedia", () => ({
    addEventListener: vi.fn(),
    matches: false,
    removeEventListener: vi.fn(),
  }));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(() =>
      root.render(
        <MeetingInfoHoverCard
          jobDescriptionName="用户运营经理"
          meetingTitle="陈绮浈-用户运营经理-测试"
          responsibleHrImage="https://example.com/hr.png"
          responsibleHrName="艾伦"
          roundLabel="业务一面"
          scheduledAt="2026-09-28T14:19:00.000Z"
          showResponsibleHr
        />,
      ),
    );
    const trigger = host.querySelector<HTMLButtonElement>("button");
    expect(trigger?.textContent).toContain("会议信息");
    await act(() => trigger?.click());
    const content = document.body.querySelector('[data-slot="hover-card-content"]');
    expect(content?.textContent).toContain("用户运营经理");
    expect(content?.textContent).toContain("业务一面");
    expect(content?.textContent).toContain("2026年9月28日 22:19");
    expect(content?.textContent).toContain("负责 HR");
    expect(content?.querySelector("dd:last-child > span:last-child")?.textContent).toBe("艾伦");
  } finally {
    await act(() => root.unmount());
  }
});

it("hides the responsible HR from candidates", async () => {
  vi.stubGlobal("matchMedia", () => ({
    addEventListener: vi.fn(),
    matches: false,
    removeEventListener: vi.fn(),
  }));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(() =>
      root.render(
        <MeetingInfoHoverCard
          jobDescriptionName="用户运营经理"
          meetingTitle="候选人面试"
          responsibleHrImage={null}
          responsibleHrName={null}
          roundLabel="业务一面"
          scheduledAt="2026-09-28T14:19:00.000Z"
          showResponsibleHr={false}
        />,
      ),
    );
    await act(() => host.querySelector("button")?.click());
    const content = document.body.querySelector('[data-slot="hover-card-content"]');
    expect(content?.textContent).not.toContain("负责 HR");
  } finally {
    await act(() => root.unmount());
  }
});
