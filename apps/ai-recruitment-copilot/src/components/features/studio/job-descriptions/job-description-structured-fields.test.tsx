// @vitest-environment jsdom

import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobDescriptionStructuredFields } from "./job-description-structured-fields";

// SAFETY: The test fixture is constructed with the asserted shape before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("JobDescriptionStructuredFields", () => {
  it("uses vertical tabs for hard gates without nested section cards or markers", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <JobDescriptionStructuredFields
        config={createDefaultJobDescriptionStructuredConfig()}
        onChange={vi.fn()}
      />,
    );

    const headings = [...container.querySelectorAll("h3")];
    const hardGateHeading = headings.find((heading) => heading.textContent === "硬性门槛");
    const weightHeading = headings.find((heading) => heading.textContent === "权重配置");
    const conditionHeading = headings.find((heading) => heading.textContent === "优先与排除条件");

    expect(hardGateHeading?.previousElementSibling).toBeNull();
    expect(weightHeading?.previousElementSibling).toBeNull();
    expect(conditionHeading?.previousElementSibling).toBeNull();
    expect(container.querySelector('[data-slot="card"]')).toBeNull();
    expect(container.querySelector<HTMLElement>('[data-slot="tabs"]')?.dataset.orientation).toBe(
      "vertical",
    );
    expect(container.querySelectorAll('[data-slot="tabs-tab"]')).toHaveLength(7);
    expect(container.querySelector<HTMLElement>('[data-slot="tabs-list"]')?.dataset.variant).toBe(
      "underline",
    );
    expect(container.querySelector('[data-slot="tabs-tab"]')?.className).toContain(
      "data-active:rounded-l-none",
    );
    const hardGateInput = container.querySelector("textarea");
    expect(hardGateInput?.className).toContain("h-56");
    expect(hardGateInput?.className).toContain("resize-none");
    expect(hardGateInput?.getAttribute("aria-label")).toBe("学历要求");
    expect(container.querySelector('label[for="hard-gate-education"]')).toBeNull();
  });

  it("switches the visible hard-gate input from the vertical tab list", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const config = createDefaultJobDescriptionStructuredConfig();
    const workLocation = "上海到岗，每周至少三天";

    await act(async () => {
      root.render(
        <JobDescriptionStructuredFields
          config={{
            ...config,
            hardGates: { ...config.hardGates, workLocation },
          }}
          onChange={vi.fn()}
        />,
      );
      await Promise.resolve();
    });

    expect(container.querySelector("textarea")?.id).toBe("hard-gate-education");
    const workLocationTab = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "工作地点",
    );

    await act(async () => {
      workLocationTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector("textarea")?.id).toBe("hard-gate-workLocation");
    expect(container.querySelector("textarea")?.getAttribute("aria-label")).toBe("工作地点");
    const workLocationInput = container.querySelector("textarea");
    expect(document.activeElement).toBe(workLocationInput);
    expect(workLocationInput?.selectionStart).toBe(workLocation.length);
    expect(workLocationInput?.selectionEnd).toBe(workLocation.length);
    act(() => root.unmount());
  });

  it("keeps hard-gate tabs clickable and freezes published evaluation controls", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const config = createDefaultJobDescriptionStructuredConfig();
    const workLocation = "上海到岗，每周至少三天";

    await act(async () => {
      root.render(
        <JobDescriptionStructuredFields
          config={{
            ...config,
            hardGates: { ...config.hardGates, workLocation },
            priorityConditions: [{ condition: "具备招聘系统经验", id: "priority-1", points: 10 }],
          }}
          disabled
          onChange={vi.fn()}
        />,
      );
      await Promise.resolve();
    });

    const educationInput = container.querySelector<HTMLTextAreaElement>("textarea");
    expect(educationInput?.readOnly).toBe(true);
    expect(educationInput?.disabled).toBe(false);
    expect(container.querySelector('[role="slider"]')).toBeNull();
    expect(
      [...container.querySelectorAll("button")].filter((button) => button.textContent === "添加"),
    ).toHaveLength(0);

    const workLocationTab = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "工作地点",
    );
    expect(workLocationTab?.disabled).toBe(false);

    await act(async () => {
      workLocationTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const workLocationInput = container.querySelector<HTMLTextAreaElement>("textarea");
    expect(workLocationInput?.id).toBe("hard-gate-workLocation");
    expect(workLocationInput?.readOnly).toBe(true);
    expect(workLocationInput?.value).toBe(workLocation);
    act(() => root.unmount());
  });

  it("uses input groups and standard button variants for scoring conditions", () => {
    const container = document.createElement("div");
    const config = createDefaultJobDescriptionStructuredConfig();
    container.innerHTML = renderToStaticMarkup(
      <JobDescriptionStructuredFields
        config={{
          ...config,
          priorityConditions: [{ condition: "具备招聘系统经验", id: "priority-1", points: 10 }],
        }}
        onChange={vi.fn()}
      />,
    );

    const addButtons = [...container.querySelectorAll<HTMLButtonElement>('button[data-size="sm"]')];
    expect(addButtons).toHaveLength(2);
    expect(addButtons.every((button) => button.dataset.variant === "secondary")).toBe(true);
    expect(container.querySelectorAll('[data-slot="input-group"]')).toHaveLength(1);
    const deleteButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="删除优先条件"]',
    );
    expect(deleteButton?.dataset.size).toBe("icon-xs");
    expect(deleteButton?.dataset.variant).toBe("ghost");
  });
});
