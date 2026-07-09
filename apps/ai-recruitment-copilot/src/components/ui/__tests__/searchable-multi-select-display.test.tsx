// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { SearchableMultiSelect } from "../searchable-multi-select";

const options = [
  { label: "岗位 A", value: "job-a" },
  { label: "岗位 B", value: "job-b" },
];
const value = ["job-a", "job-b"];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SearchableMultiSelect display mode", () => {
  it("keeps the searchable combobox input when switching display modes", () => {
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

    expect(host.querySelector('[role="combobox"]')).not.toBeNull();

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

    expect(host.querySelector('[role="combobox"]')).not.toBeNull();

    act(() => {
      root.unmount();
    });
    host.remove();
  });
});
