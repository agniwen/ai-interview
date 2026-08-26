// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enableReactActEnvironment,
  installNoopResizeObserver,
  renderInAct,
  unmountInAct,
} from "@/test-utils/react-act";
import { Toolbar } from "../toolbar";

enableReactActEnvironment();
installNoopResizeObserver();
const roots: Awaited<ReturnType<typeof renderInAct>>["root"][] = [];

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
});

async function clickText(selector: string, text: string) {
  const element = [...document.querySelectorAll<HTMLElement>(selector)].find(
    (item) => item.textContent?.trim() === text,
  );
  expect(element, `Missing ${selector}: ${text}`).toBeDefined();
  await act(async () => {
    element?.click();
    await Promise.resolve();
  });
}

async function enterDate(value: string) {
  const input = document.querySelector<HTMLInputElement>('input[type="date"]');
  if (!input) {
    throw new Error("Date input missing");
  }
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setValue?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
}

describe("Toolbar filter editing", () => {
  it("validates date bounds before applying an edited date", async () => {
    const onChange = vi.fn();
    const { root } = await renderInAct(
      <Toolbar
        filters={[
          {
            boundary: "from",
            key: "from",
            label: "起始日期",
            max: "2026-08-25",
            type: "date",
          },
        ]}
        filterValues={{ from: "2026-08-20" }}
        onFilterChange={onChange}
      />,
    );
    roots.push(root);
    await clickText("button", "2026-08-20");
    await enterDate("2026-08-26");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("不能晚于");
    expect(onChange).not.toHaveBeenCalled();
    await enterDate("2026-08-24");
    expect(document.querySelector('[role="alert"]')).toBeNull();
    await clickText("button", "应用");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("from", "2026-08-24");
  });

  it("does not submit an incomplete newly added condition", async () => {
    const onChange = vi.fn();
    const { root } = await renderInAct(
      <Toolbar
        filters={[
          {
            key: "status",
            label: "状态",
            options: [{ label: "完成", value: "done" }],
            type: "select",
          },
        ]}
        filterValues={{ status: "" }}
        onFilterChange={onChange}
      />,
    );
    roots.push(root);
    await clickText("button", "添加筛选");
    await clickText('[role="option"]', "状态");
    expect(onChange).not.toHaveBeenCalled();
    await clickText('[role="option"]', "是");
    expect(onChange).not.toHaveBeenCalled();
    await clickText('[role="option"]', "完成");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("status", "done");
  });

  it("keeps multi-select changes local until Apply and discards cancellation", async () => {
    const onChange = vi.fn();
    const { root } = await renderInAct(
      <Toolbar
        filters={[
          {
            key: "skills",
            label: "技能",
            match: "all",
            options: [
              { label: "React", value: "react" },
              { label: "TypeScript", value: "ts" },
            ],
            type: "multi-select",
          },
        ]}
        filterValues={{ skills: "react" }}
        onFilterChange={onChange}
      />,
    );
    roots.push(root);

    await clickText("button", "React");
    expect(document.querySelector('[data-slot="scroll-area-viewport"]')).not.toBeNull();
    await clickText('[role="option"]', "TypeScript");
    expect(onChange).not.toHaveBeenCalled();
    await clickText("button", "取消");
    expect(onChange).not.toHaveBeenCalled();
    expect(document.querySelector('[data-slot="filter-chip"]')?.textContent).not.toContain(
      "TypeScript",
    );

    await clickText("button", "React");
    await clickText('[role="option"]', "TypeScript");
    await clickText("button", "应用");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("skills", "react,ts");
  });
});
