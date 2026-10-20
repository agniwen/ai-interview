// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FilterChip, FilterValuePopover } from "@/components/reui/filters/filters-chip";
import { Filters, createFilterQuery, createFilterRule } from "@/components/reui/filters/filters";
import type {
  FilterEditorProps,
  FilterField,
  FilterOperator,
} from "@/components/reui/filters/filters-types";
import { installNoopResizeObserver } from "@/test-utils/react-act";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
installNoopResizeObserver();

const operator: FilterOperator = { value: "contains", label: "contains" };

function createHarness(observedDrafts: string[]) {
  function DraftEditor({ value, onValueChange, cancel }: FilterEditorProps<string>) {
    React.useLayoutEffect(() => {
      observedDrafts.push(value ?? "");
    });

    return (
      <div>
        <output data-slot="draft-value">{value ?? ""}</output>
        <button type="button" onClick={() => onValueChange("draft")}>
          Edit draft
        </button>
        <button type="button" onClick={cancel}>
          Cancel
        </button>
      </div>
    );
  }

  const field: FilterField<string> = {
    id: "name",
    label: "Name",
    editor: DraftEditor,
    operators: [operator],
  };

  return (value: string) => {
    const rule = createFilterRule({
      id: "rule-1",
      path: [field.id],
      operator: operator.value,
      value,
    });

    return (
      <Filters fields={[field]} query={createFilterQuery([rule])}>
        <FilterValuePopover
          field={field}
          operator={operator}
          rule={rule}
          trigger={<button type="button">Value</button>}
        />
      </Filters>
    );
  };
}

async function click(element: Element | null) {
  if (!element) throw new Error("Expected clickable element");
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

function button(text: string) {
  return (
    [...document.querySelectorAll("button")].find((entry) => entry.textContent === text) ?? null
  );
}

describe("FilterValuePopover draft lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
  });

  it("reopens a cancelled draft with the committed value on its first visible commit", async () => {
    const observedDrafts: string[] = [];
    const renderHarness = createHarness(observedDrafts);
    act(() => root.render(renderHarness("saved")));

    await click(button("Value"));
    await click(button("Edit draft"));
    expect(document.querySelector('[data-slot="draft-value"]')?.textContent).toBe("draft");
    await click(button("Cancel"));

    observedDrafts.length = 0;
    await click(button("Value"));

    expect(observedDrafts[0]).toBe("saved");
    expect(observedDrafts.every((value) => value === "saved")).toBe(true);
  });

  it("shows an external value update without committing the previous draft first", async () => {
    const observedDrafts: string[] = [];
    const renderHarness = createHarness(observedDrafts);
    act(() => root.render(renderHarness("saved")));
    await click(button("Value"));
    await click(button("Edit draft"));

    observedDrafts.length = 0;
    act(() => root.render(renderHarness("external")));

    expect(observedDrafts[0]).toBe("external");
    expect(observedDrafts.every((value) => value === "external")).toBe(true);
  });

  it("keeps the unsaved draft in the closing popover commit", async () => {
    const observedDrafts: string[] = [];
    const renderHarness = createHarness(observedDrafts);
    act(() => root.render(renderHarness("saved")));
    await click(button("Value"));
    await click(button("Edit draft"));

    observedDrafts.length = 0;
    await click(button("Cancel"));

    expect(observedDrafts.at(-1)).toBe("draft");
    expect(observedDrafts.every((value) => value === "draft")).toBe(true);
  });
});

function renderChipLabel(field: FilterField, operatorValue: string) {
  const rule = createFilterRule({ id: "rule-1", path: [field.id], operator: operatorValue });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() =>
    root.render(
      <Filters fields={[field]} query={createFilterQuery([rule])}>
        <FilterChip index={0} rule={rule} />
      </Filters>,
    ),
  );

  const label = [...document.querySelectorAll("label")].find(
    (entry) => entry.textContent === field.label,
  );
  return { control: label?.control ?? null, unmount: () => act(() => root.unmount()) };
}

describe("FilterChip field label", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("labels the inline text input with the field name", () => {
    const { control, unmount } = renderChipLabel(
      { id: "phone", label: "电话", type: "text" },
      "contains",
    );
    expect(control).toBe(document.querySelector('input[aria-label="电话"]'));
    unmount();
  });

  it("labels the value trigger of an option field with the field name", () => {
    const { control, unmount } = renderChipLabel(
      { id: "stage", label: "阶段", type: "select", options: [{ value: "a", label: "A" }] },
      "is",
    );
    expect(control?.tagName).toBe("BUTTON");
    expect(control?.closest('[data-slot="filter-chip"]')).not.toBeNull();
    unmount();
  });
});
