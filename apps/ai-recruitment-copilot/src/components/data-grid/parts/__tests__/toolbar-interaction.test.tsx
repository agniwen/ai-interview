// @vitest-environment jsdom

import { createStore, Provider } from "jotai";
import { listFilterSelectionAtom } from "../filter-selection";

import { act, useState } from "react";
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
    (item) => item.textContent?.trim() === text || item.getAttribute("aria-label") === text,
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
  it("clears only values in one commit and retains active fields restored from the URL", async () => {
    const store = createStore();
    store.set(listFilterSelectionAtom, {});
    const onClear = vi.fn();
    function Harness() {
      const [values, setValues] = useState<Record<string, string>>({
        archivedFilter: "active",
        textFilters: '{"company":"极光"}',
      });
      return (
        <Provider store={store}>
          <Toolbar
            canResetFilters={false}
            filterStorageKey="clear-test"
            filters={[
              { key: "textFilters", resource: "resumes", type: "text-filters" },
              {
                key: "archivedFilter",
                label: "归档状态",
                options: [{ label: "未归档", value: "active" }],
                type: "select",
                unfilteredValue: "all",
              },
            ]}
            filterValues={values}
            onResetFilters={(next = {}) => {
              onClear(next);
              setValues(next);
            }}
            onRefresh={vi.fn()}
            toolbarRight={<button type="button">创建记录</button>}
          />
        </Provider>
      );
    }
    const { root } = await renderInAct(<Harness />);
    roots.push(root);
    await clickText("button", "清空筛选");
    expect(onClear).toHaveBeenCalledExactlyOnceWith({ archivedFilter: "all", textFilters: "" });
    expect(store.get(listFilterSelectionAtom)["clear-test"]).toEqual([
      "text:company",
      "archivedFilter",
    ]);
    expect(document.querySelectorAll('[data-slot="filter-chip"]')).toHaveLength(2);
    expect(document.body.textContent).not.toContain("极光");
    expect(document.body.textContent).not.toContain("未归档");
    expect(document.body.textContent).toContain("选择…");
    const actions = [
      ...document.querySelectorAll('[data-slot="data-grid-toolbar-actions"] button'),
    ];
    expect(actions.map((item) => item.textContent?.trim())).toEqual([
      "清空筛选",
      "刷新",
      "创建记录",
    ]);
    expect(actions[0]).toHaveProperty("disabled", true);
  });

  it("remembers selected fields without persisting values, including empty conditions", async () => {
    const saved = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => saved.get(key) ?? null,
        removeItem: (key: string) => saved.delete(key),
        setItem: (key: string, value: string) => saved.set(key, value),
      },
    });
    const store = createStore();
    const onChange = vi.fn();
    const renderToolbar = (textFilters: string) => (
      <Provider store={store}>
        <Toolbar
          filterStorageKey="persist-test"
          filters={[{ key: "textFilters", resource: "resumes", type: "text-filters" }]}
          filterValues={{ textFilters }}
          onFilterChange={onChange}
        />
      </Provider>
    );
    const { root } = await renderInAct(renderToolbar('{"candidateName":"Alice"}'));
    roots.push(root);
    await clickText("button", "添加筛选");
    await clickText('[role="option"]', "公司");
    expect(onChange).not.toHaveBeenCalled();
    expect(store.get(listFilterSelectionAtom)["persist-test"]).toEqual([
      "text:candidateName",
      "text:company",
    ]);
    expect(window.localStorage.getItem("arc:list-filter-selection:v1")).not.toContain("Alice");
    await act(async () => {
      root.render(renderToolbar(""));
      await Promise.resolve();
    });
    expect(document.querySelectorAll('[data-slot="filter-chip"]')).toHaveLength(2);
    expect(document.body.textContent).not.toContain("Alice");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("validates date bounds before applying an edited date", async () => {
    const onChange = vi.fn();
    const { root } = await renderInAct(
      <Toolbar
        filters={[
          { key: "extraA", label: "备注", type: "search" },
          { key: "extraB", label: "编号", type: "search" },
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
          { key: "extraA", label: "备注", type: "search" },
          { key: "extraB", label: "编号", type: "search" },
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
          { key: "extraA", label: "备注", type: "search" },
          { key: "extraB", label: "编号", type: "search" },
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
