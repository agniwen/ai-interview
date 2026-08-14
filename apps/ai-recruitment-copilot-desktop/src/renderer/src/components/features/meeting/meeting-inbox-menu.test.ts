import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(import.meta.dirname, "meeting-inbox-menu.tsx"), "utf-8");

describe("Meeting inbox menu", () => {
  it("uses a wider panel and equal hover-only action buttons", () => {
    expect(source).toContain('className="w-96 p-1"');
    expect(source).toContain("group-hover:opacity-100");
    expect(source).toContain("group-hover:visible");
    expect(source).toContain('size="xs"');
    expect(source).toContain('variant="outline"');
    expect(source).toContain("InboxActionButton");
  });

  it("opens a record from the row, not a dedicated open button", () => {
    expect(source).toContain('to="/meetings/$meetingId"');
    expect(source).toContain("event.preventDefault()");
    expect(source).toContain("event.stopPropagation()");
    expect(source).toContain("onClick={onOpen}");
    expect(source).not.toContain("打开");
  });
});
