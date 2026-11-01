// @vitest-environment jsdom
/* oxlint-disable anti-slop/no-module-mocking -- Keep candidate HTTP/PDF dependencies outside this dialog interaction test. */
import { setTimeout as delay } from "node:timers/promises";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { HumanMeetingReviewMaterials } from "./human-meeting-review-materials";
import { reviewRecord } from "./human-meeting-review.test-fixtures";

vi.mock("./interviewer-candidate-materials", () => ({
  InterviewerCandidateMaterials: ({ inviteToken }: { inviteToken: string }) => (
    <p>候选人概览和简历：{inviteToken}</p>
  ),
}));
// SAFETY: React's act flag is intentionally attached only in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

it.each([
  { available: true, mobile: false },
  { available: false, mobile: false },
  { available: true, mobile: true },
  { available: false, mobile: true },
])(
  "opens materials with available=$available mobile=$mobile without leaving the form",
  async ({ available, mobile }) => {
    vi.stubGlobal("innerWidth", mobile ? 390 : 1280);
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    const { transcript } = reviewRecord();
    if (!transcript) {
      throw new Error("missing transcript fixture");
    }
    const [turn] = transcript.turns;
    transcript.turns = [
      {
        ...turn,
        attribution: {
          method: "track",
          participantIdentity: "interviewer_me",
          role: "interviewer",
          sourceId: "self",
        },
        id: "self",
        text: "我的提问",
      },
      {
        ...turn,
        attribution: {
          method: "track",
          participantIdentity: "interviewer_other",
          role: "interviewer",
          sourceId: "other",
        },
        id: "other",
        text: "其他面试官提问",
      },
      {
        ...turn,
        attribution: {
          method: "track",
          participantIdentity: "candidate_round",
          role: "candidate",
          sourceId: "candidate",
        },
        id: "candidate",
        text: "服务端转录",
      },
    ];
    await act(() =>
      root.render(
        <>
          <input aria-label="评价草稿" defaultValue="未保存的评价" />
          <HumanMeetingReviewMaterials
            inviteToken="reviewer-invite"
            transcript={available ? transcript : null}
            currentReviewerId="me"
            interviewers={[
              { image: "https://example.com/me.png", name: "当前面试官", userId: "me" },
              { image: null, name: "其他面试官", userId: "other" },
            ]}
          />
        </>,
      ),
    );
    await act(() => host.querySelector("button")?.click());
    if (mobile) {
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    } else {
      expect(document.querySelector('aside[aria-label="候选人资料"]')).not.toBeNull();
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(host.querySelector("input")?.closest("[inert]")).toBeNull();
      await act(() => {
        const input = host.querySelector("input");
        if (!input) {
          throw new Error("Missing evaluation input");
        }
        input.value = "边查看边填写";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    await act(async () => {
      await delay(0);
    });
    expect(document.body.textContent).toContain("候选人概览和简历：reviewer-invite");
    const tab = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (item) => item.textContent === "面试转录",
    );
    await act(() => tab?.click());
    expect(document.body.textContent).toContain(available ? "服务端转录" : "暂无可查看的面试转录");
    if (available) {
      expect(document.querySelector('[data-speaker-side="self"]')?.textContent).toContain(
        "面试官 · 当前面试官（我）",
      );
      expect(
        document.querySelector('[data-speaker-side="self"] [aria-label="当前面试官的头像"]'),
      ).not.toBeNull();
      expect(document.querySelector('[data-speaker-side="other"]')?.textContent).toContain(
        "面试官 · 其他面试官",
      );
      expect(document.querySelector('[data-speaker-side="self"]')?.textContent).toContain(
        "我的提问",
      );
      expect(
        [...document.querySelectorAll('[data-speaker-side="other"]')].map(
          (item) => item.textContent,
        ),
      ).toEqual(
        expect.arrayContaining([
          expect.stringContaining("其他面试官提问"),
          expect.stringContaining("服务端转录"),
        ]),
      );
    }
    expect(host.querySelector("input")?.value).toBe(mobile ? "未保存的评价" : "边查看边填写");
    const close = document.querySelector<HTMLButtonElement>('[aria-label="关闭候选人资料"]');
    expect(close).toBeDefined();
    await act(() => close?.click());
    expect(host.querySelector("input")?.value).toBe(mobile ? "未保存的评价" : "边查看边填写");
  },
);
