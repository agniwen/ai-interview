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

function textInput(label: string) {
  const input = document.querySelector<HTMLInputElement>(
    `[data-slot="filter-chip"] input[aria-label="${label}"]`,
  );
  if (!input) {
    throw new Error(`Missing inline input: ${label}`);
  }
  return input;
}

async function typeText(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(() => {
    input.focus();
    setValue?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function pressKey(input: HTMLElement, key: string, isComposing = false) {
  await act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, isComposing, key }),
    );
  });
}

function TextHarness({ onChange }: { onChange: (key: string, value: string) => void }) {
  const [values, setValues] = useState({ textFilters: '{"candidateName":"Alice"}' });
  return (
    <Toolbar
      filters={[{ key: "textFilters", resource: "resumes", type: "text-filters" }]}
      filterValues={values}
      onFilterChange={(key, value) => {
        onChange(key, value);
        setValues((previous) => ({ ...previous, [key]: value }));
      }}
      onResetFilters={() => setValues({ textFilters: "" })}
    />
  );
}

describe("Toolbar filter editing", () => {
  it("keeps the add-filter button labeled when conditions exist and after clearing values", async () => {
    const { root } = await renderInAct(
      <Provider store={createStore()}>
        <TextHarness onChange={vi.fn()} />
      </Provider>,
    );
    roots.push(root);
    expect(document.querySelectorAll('[data-slot="filter-chip"]')).toHaveLength(1);
    const addButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "添加筛选",
    );
    expect(addButton).toBeDefined();
    expect(addButton?.dataset.size).toBe("default");
    expect(addButton?.querySelector('[data-icon="inline-start"]')).not.toBeNull();

    await clickText("button", "清空筛选");
    expect(addButton?.textContent?.trim()).toBe("添加筛选");
  });

  it("edits text inside the chip and commits once on Enter or blur", async () => {
    const onChange = vi.fn();
    const { root } = await renderInAct(<TextHarness onChange={onChange} />);
    roots.push(root);
    const input = textInput("候选人");
    expect(input.value).toBe("Alice");
    expect(input.parentElement?.classList.contains("has-focus-visible:shadow-none")).toBe(true);
    expect(input.parentElement?.className).not.toContain("has-focus-visible:shadow-[");
    await typeText(input, "Bob");
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    await pressKey(input, "Enter");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("textFilters", '{"candidateName":"Bob"}');
    await pressKey(input, "Enter");
    await act(() => input.blur());
    expect(onChange).toHaveBeenCalledTimes(1);
    await typeText(input, "Carol");
    await act(() => input.blur());
    expect(onChange).toHaveBeenLastCalledWith("textFilters", '{"candidateName":"Carol"}');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("reverts Escape and does not commit Enter while the IME is composing", async () => {
    const onChange = vi.fn();
    const { root } = await renderInAct(<TextHarness onChange={onChange} />);
    roots.push(root);
    const input = textInput("候选人");
    await typeText(input, "discard me");
    await pressKey(input, "Escape");
    expect(input.value).toBe("Alice");
    await act(() => input.blur());
    expect(onChange).not.toHaveBeenCalled();

    await act(() => {
      input.focus();
      input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    });
    await typeText(input, "张三");
    await pressKey(input, "Enter", true);
    expect(onChange).not.toHaveBeenCalled();
    await act(() => {
      input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "张三" }));
    });
    expect(onChange).not.toHaveBeenCalled();
    await pressKey(input, "Enter");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("textFilters", '{"candidateName":"张三"}');
  });

  it("clears inline text values while retaining their fields", async () => {
    const onChange = vi.fn();
    const { root } = await renderInAct(<TextHarness onChange={onChange} />);
    roots.push(root);
    await clickText("button", "清空筛选");
    expect(textInput("候选人").value).toBe("");
    expect(onChange).not.toHaveBeenCalled();
    await typeText(textInput("候选人"), "Bob");
    await pressKey(textInput("候选人"), "Enter");
    await typeText(textInput("候选人"), "");
    await pressKey(textInput("候选人"), "Enter");
    expect(onChange).toHaveBeenLastCalledWith("textFilters", "");
    expect(document.querySelectorAll('[data-slot="filter-chip"]')).toHaveLength(1);
  });

  it("defaults newly added text conditions and focuses their value without an operator popup", async () => {
    const onChange = vi.fn();
    const { root } = await renderInAct(<TextHarness onChange={onChange} />);
    roots.push(root);
    await clickText("button", "添加筛选");
    expect(
      document.querySelector('[data-slot="popover-content"]')?.classList.contains("bg-background"),
    ).toBe(true);
    await clickText('[role="option"]', "公司");
    expect(document.querySelector('[data-slot="popover-content"]')).toBeNull();
    expect(document.activeElement).toBe(textInput("公司"));
    expect(
      [...document.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === "添加筛选",
      ),
    ).toBe(true);
    expect(document.querySelector('[data-slot="filter-editor"]')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    await typeText(textInput("公司"), "极光");
    await pressKey(textInput("公司"), "Enter");
    expect(onChange).toHaveBeenCalledExactlyOnceWith(
      "textFilters",
      '{"candidateName":"Alice","company":"极光"}',
    );
  });

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
      ...document.querySelectorAll<HTMLButtonElement>(
        '[data-slot="data-grid-toolbar-actions"] button',
      ),
    ];
    expect(actions.map((item) => item.textContent?.trim())).toEqual([
      "清空筛选",
      "刷新",
      "创建记录",
    ]);
    expect(actions[0]).toHaveProperty("disabled", true);
    for (const action of actions.slice(0, 2)) {
      expect(action.dataset.size).toBe("default");
      expect(action.querySelector(".sr-only")).toBeNull();
      expect(action.querySelector('[data-icon="inline-start"]')).not.toBeNull();
    }
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
    expect(
      document.querySelector('[data-slot="popover-content"]')?.classList.contains("bg-background"),
    ).toBe(true);
    await enterDate("2026-08-26");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("不能晚于");
    expect(onChange).not.toHaveBeenCalled();
    await enterDate("2026-08-24");
    expect(document.querySelector('[role="alert"]')).toBeNull();
    await clickText("button", "应用");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("from", "2026-08-24");
  });

  it("opens and focuses a newly added date value directly", async () => {
    const onChange = vi.fn();
    const { root } = await renderInAct(
      <Provider store={createStore()}>
        <Toolbar
          filterStorageKey="new-date-focus"
          filters={[
            { key: "extraA", label: "备注", type: "search" },
            { key: "extraB", label: "编号", type: "search" },
            { boundary: "from", key: "from", label: "起始日期", type: "date" },
          ]}
          onFilterChange={onChange}
        />
      </Provider>,
    );
    roots.push(root);
    await clickText("button", "添加筛选");
    await clickText('[role="option"]', "起始日期");
    const input = document.querySelector('input[type="date"]');
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    expect(document.querySelector('[data-slot="filter-chip"]')?.textContent).toContain("不早于");
    expect(onChange).not.toHaveBeenCalled();
    await enterDate("2026-08-24");
    await clickText("button", "应用");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("from", "2026-08-24");
  });

  it.each(["any", "all"] as const)(
    "opens new multi-select values directly with the configured %s operator",
    async (match) => {
      const onChange = vi.fn();
      const { root } = await renderInAct(
        <Provider store={createStore()}>
          <Toolbar
            filterStorageKey={`new-multi-focus-${match}`}
            filters={[
              { key: "extraA", label: "备注", type: "search" },
              { key: "extraB", label: "编号", type: "search" },
              {
                key: "skills",
                label: "技能",
                match,
                options: [{ label: "React", value: "react" }],
                type: "multi-select",
              },
            ]}
            onFilterChange={onChange}
          />
        </Provider>,
      );
      roots.push(root);
      await clickText("button", "添加筛选");
      await clickText('[role="option"]', "技能");
      expect(document.querySelector('[data-slot="filter-chip"]')?.textContent).toContain(
        match === "all" ? "同时具备" : "属于任意",
      );
      expect(document.querySelector('[data-slot="popover-content"] input')).toBe(
        document.activeElement,
      );
      expect(onChange).not.toHaveBeenCalled();
      await clickText('[role="option"]', "React");
      expect(onChange).toHaveBeenCalledExactlyOnceWith("skills", "react");
    },
  );

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
    expect(
      [...document.querySelectorAll('[role="option"]')].some(
        (option) => option.textContent?.trim() === "是",
      ),
    ).toBe(false);
    expect(
      document.querySelector('[data-slot="popover-content"]')?.classList.contains("bg-background"),
    ).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    await clickText('[role="option"]', "完成");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("status", "done");
  });

  it("applies each multi-select toggle immediately and keeps the candidate list open", async () => {
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
    expect(
      document.querySelector('[data-slot="popover-content"]')?.classList.contains("bg-background"),
    ).toBe(true);
    expect(document.querySelector('[data-slot="scroll-area-viewport"]')).not.toBeNull();
    await clickText('[role="option"]', "TypeScript");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("skills", "react,ts");
    expect(document.querySelector('[data-slot="filter-chip"]')?.textContent).toContain(
      "TypeScript",
    );
    expect(
      [...document.querySelectorAll("button")].some((button) =>
        ["应用", "取消"].includes(button.textContent?.trim() ?? ""),
      ),
    ).toBe(false);
    await clickText('[role="option"]', "React");
    expect(onChange).toHaveBeenLastCalledWith("skills", "ts");
    await clickText('[role="option"]', "TypeScript");
    expect(onChange).toHaveBeenLastCalledWith("skills", "");
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(document.querySelectorAll('[data-slot="filter-chip"]')).toHaveLength(1);
    expect(document.querySelector('[data-slot="scroll-area-viewport"]')).not.toBeNull();
  });
});
