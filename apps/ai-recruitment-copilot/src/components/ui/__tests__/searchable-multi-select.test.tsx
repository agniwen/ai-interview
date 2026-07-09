import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SearchableMultiSelect } from "../searchable-multi-select";

const source = readFileSync(new URL("../searchable-multi-select.tsx", import.meta.url), "utf-8");

const options = [
  { label: "岗位 A", value: "job-a" },
  { label: "岗位 B", value: "job-b" },
  { label: "岗位 C", value: "job-c" },
];
const selectedValues = ["job-a", "job-b"];

describe("SearchableMultiSelect", () => {
  it("hides removable selected badges by default", () => {
    const html = renderToStaticMarkup(
      <SearchableMultiSelect onChange={() => {}} options={options} value={selectedValues} />,
    );

    expect(html).not.toContain("移除 岗位 A");
    expect(html).not.toContain("移除 岗位 B");
  });

  it("keeps removable selected badges available when explicitly enabled", () => {
    const html = renderToStaticMarkup(
      <SearchableMultiSelect
        onChange={() => {}}
        options={options}
        showBadges
        value={selectedValues}
      />,
    );

    expect(html).toContain("移除 岗位 A");
    expect(html).toContain("移除 岗位 B");
  });

  it("previews selected item labels by default", () => {
    const html = renderToStaticMarkup(
      <SearchableMultiSelect onChange={() => {}} options={options} value={selectedValues} />,
    );

    expect(html).toContain('title="岗位 A"');
    expect(html).toContain('title="岗位 B"');
    expect(html).not.toContain("已选 2 项");
  });

  it("keeps the selected-count display mode available", () => {
    const html = renderToStaticMarkup(
      <SearchableMultiSelect
        onChange={() => {}}
        options={options}
        selectedDisplay="count"
        selectedFormat={(count) => `已选 ${count} 个岗位`}
        value={selectedValues}
      />,
    );

    expect(html).toContain("已选 2 个岗位");
    expect(html).not.toContain('title="岗位 A、岗位 B"');
  });

  it("limits selected item previews before width-based folding", () => {
    const html = renderToStaticMarkup(
      <SearchableMultiSelect
        onChange={() => {}}
        options={options}
        selectedPreviewLimit={2}
        value={["job-a", "job-b", "job-c"]}
      />,
    );

    expect(html).toContain('title="岗位 A"');
    expect(html).toContain('title="岗位 B"');
    expect(html).not.toContain('title="岗位 C"');
    expect(html).toContain("+1");
  });

  it("lets long option lists flip on collision and keep wheel scrolling", () => {
    expect(source).toContain("collisionAvoidance={{");
    expect(source).toContain('side: "flip"');
    expect(source).toContain('fallbackAxisSide: "none"');
    expect(source).toContain("onWheelCapture={handleScrollableListWheel}");
  });
});
