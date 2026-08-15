// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SearchableSelect, filterSearchableOption } from "../searchable-select";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SearchableSelect", () => {
  it("searches custom option text such as a member email", () => {
    const option = {
      label: "张三",
      searchValue: "张三 zhangsan@example.com",
      value: "user-1",
    };

    expect(filterSearchableOption(option, "ZHANGSAN@")).toBe(true);
    expect(filterSearchableOption(option, "lisi")).toBe(false);
  });

  it("renders the selected option avatar inside the searchable input", () => {
    const html = renderToStaticMarkup(
      <SearchableSelect
        onChange={vi.fn()}
        options={[
          {
            avatarUrl: "https://example.com/avatar.png",
            label: "张三",
            searchValue: "张三 zhangsan@example.com",
            value: "user-1",
          },
        ]}
        value="user-1"
      />,
    );

    expect(html).toContain('data-slot="avatar"');
    expect(html).toContain('data-slot="avatar-fallback"');
    expect(html).toContain("张");
  });

  it("does not clear a required selection", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onChange = vi.fn();

    await act(async () => {
      root.render(
        <SearchableSelect
          clearable
          onChange={onChange}
          options={[{ label: "张三", value: "user-1" }]}
          required
          value="user-1"
        />,
      );
      await Promise.resolve();
    });

    const clearButton = container.querySelector<HTMLButtonElement>('[data-slot="combobox-clear"]');
    expect(clearButton).not.toBeNull();
    await act(async () => {
      clearButton?.click();
      await Promise.resolve();
    });

    expect(onChange).not.toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });

  it("shows the clear button next to the dropdown icon only when there is text", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onChange = vi.fn();

    await act(async () => {
      root.render(
        <SearchableSelect
          onChange={onChange}
          options={[{ label: "张三", value: "user-1" }]}
          value={null}
        />,
      );
      await Promise.resolve();
    });

    expect(container.querySelector('[data-slot="combobox-clear"]')).toBeNull();

    await act(async () => {
      root.render(
        <SearchableSelect
          onChange={onChange}
          options={[{ label: "张三", value: "user-1" }]}
          value="user-1"
        />,
      );
      await Promise.resolve();
    });

    expect(container.querySelector('[data-slot="combobox-clear"]')).not.toBeNull();
    const actions = container.querySelector('[data-slot="combobox-actions"]');
    expect(actions?.children).toHaveLength(2);
    expect(actions?.firstElementChild?.getAttribute("data-slot")).toBe("combobox-clear");
    expect(actions?.lastElementChild?.getAttribute("data-slot")).toBe("input-group-button");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-slot="combobox-clear"]')?.click();
      await Promise.resolve();
    });

    expect(onChange).toHaveBeenCalledWith(null);

    act(() => root.unmount());
    container.remove();
  });
});
