// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { DataField } from "../data-field";
import { DataFields } from "../data-fields";

// SAFETY: The test fixture is constructed with the asserted shape before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderFields() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);

  act(() => {
    root.render(
      <DataFields columns={3} density="compact" label="候选人信息">
        <DataField kind="email" label="邮箱" value="candidate@example.com" />
        <DataField kind="phone" label="联系电话" value="13800138000" />
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

    act(() => root.unmount());
    host.remove();
  });
});
