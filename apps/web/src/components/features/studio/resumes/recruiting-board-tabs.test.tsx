// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableReactActEnvironment, renderInAct, unmountInAct } from "@/test-utils/react-act";
import { RecruitingBoardTabs } from "./recruiting-board-tabs";

enableReactActEnvironment();

const roots: Awaited<ReturnType<typeof renderInAct>>["root"][] = [];

class ResizeObserverStub {
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
}

/** 读取某个 tablist 下每个 tab 的角标文本（无角标为 null），按 tab 名称索引。 */
function badgesByTab(listLabel: string) {
  return Object.fromEntries(
    [...document.querySelectorAll(`[role="tablist"][aria-label="${listLabel}"] [role="tab"]`)].map(
      (tab) => {
        const badge = tab.querySelector('[data-slot="recruiting-board-tab-count"]');
        return [tab.textContent?.replace(badge?.textContent ?? "", ""), badge?.textContent ?? null];
      },
    ),
  );
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("RecruitingBoardTabs counts", () => {
  it("shows each stage count on its own tab, caps large counts and hides empty or closed stages", async () => {
    const { root } = await renderInAct(
      <RecruitingBoardTabs
        counts={
          new Map([
            ["all", 1850],
            ["screening", 1000],
            ["interview", 999],
            ["onboarding", 0],
            ["closed", 101],
          ])
        }
        onChange={vi.fn()}
        value="all"
      />,
    );
    roots.push(root);

    expect(badgesByTab("招聘阶段")).toEqual({
      Offer协商: null,
      入职办理: null,
      全部: "999+",
      已结束: null,
      简历筛选: "999+",
      面试: "999",
    });
  });

  it("shows child-status counts only on a fixed submenu page and never for closed stages", async () => {
    const counts = new Map([
      ["interview", 12],
      ["closed", 30],
    ]);
    const { root } = await renderInAct(
      <RecruitingBoardTabs
        counts={counts}
        fixedGroupId="interview"
        onChange={vi.fn()}
        value="interview:all"
        viewCounts={
          new Map([
            ["interview:ai", 7],
            ["interview:second", 5],
            ["interview:final", 0],
          ])
        }
      />,
    );
    roots.push(root);
    expect(badgesByTab("面试子流程")).toEqual({
      "AI 初面": "7",
      全部: "12",
      复试: "5",
      终试: null,
    });

    await act(async () => {
      root.render(
        <RecruitingBoardTabs
          counts={counts}
          fixedGroupId="closed"
          onChange={vi.fn()}
          value="closed:all"
          viewCounts={new Map([["closed:rejected", 9]])}
        />,
      );
      await Promise.resolve();
    });
    expect(Object.values(badgesByTab("已结束子流程")).every((badge) => badge === null)).toBe(true);
  });
});
