// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchableMultiSelect } from "./searchable-multi-select";

const options = [
  { label: "岗位 A", value: "job-a" },
  { label: "岗位 B", value: "job-b" },
];
const value = ["job-a", "job-b"];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SearchableMultiSelect display mode", () => {
  it("starts measuring when switching from count display to item preview", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();

    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        observe = observe;
        disconnect = disconnect;
      },
    );

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <SearchableMultiSelect
          onChange={() => {}}
          options={options}
          selectedDisplay="count"
          value={value}
        />,
      );
    });

    expect(observe).not.toHaveBeenCalled();

    act(() => {
      root.render(
        <SearchableMultiSelect
          onChange={() => {}}
          options={options}
          selectedDisplay="items"
          value={value}
        />,
      );
    });

    expect(observe).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    host.remove();
  });
});
