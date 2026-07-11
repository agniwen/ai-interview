// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { DataField } from "../data-field";
import { DataFields } from "../data-fields";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderFields() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);

  act(() => {
    root.render(
      <DataFields columns={3} density="compact" label="候选人信息">
        <DataField kind="email" label="邮箱" value="candidate@example.com" />
        <DataField kind="number" label="工作年限" value={12_345} />
        <DataField kind="boolean" label="已入库" value={false} />
        <DataField label="电话" span="full" value={null} />
      </DataFields>,
    );
  });

  return { host, root };
}

describe("DataField", () => {
  it("formats common data types and empty values", () => {
    const { host, root } = renderFields();

    expect(host.querySelector('a[href="mailto:candidate@example.com"]')?.textContent).toBe(
      "candidate@example.com",
    );
    expect(host.textContent).toContain("12,345");
    expect(host.textContent).toContain("否");
    expect(host.textContent).toContain("—");
    expect(host.querySelector('[class~="text-muted-foreground/60"]')?.textContent).toBe("—");

    act(() => root.unmount());
    host.remove();
  });

  it("applies the requested grid columns, density, and field span", () => {
    const { host, root } = renderFields();
    const fields = host.querySelector('[data-slot="data-fields"]');
    const group = host.querySelector('[data-slot="data-fields-group"]');
    const fullField = host.querySelector('[data-slot="data-field"].col-span-full');

    expect(fields?.className).toContain("lg:grid-cols-3");
    expect(fields?.className).toContain("gap-y-3");
    expect(group?.querySelector("h3")?.textContent).toBe("候选人信息");
    expect(fullField).not.toBeNull();

    act(() => root.unmount());
    host.remove();
  });
});
