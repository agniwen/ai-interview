import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DatePicker } from "./date-picker";

describe("DatePicker", () => {
  it("renders a calendar popover trigger instead of a native date input", () => {
    const html = renderToStaticMarkup(
      <DatePicker onValueChange={vi.fn()} placeholder="全部日期" value="2026-08-11" />,
    );

    expect(html).toContain("2026年8月11日");
    expect(html).toContain('data-slot="popover-trigger"');
    expect(html).not.toContain('type="date"');
  });
});
