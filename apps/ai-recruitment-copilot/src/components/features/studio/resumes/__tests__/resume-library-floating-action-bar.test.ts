import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../resume-library-floating-action-bar.tsx", import.meta.url),
  "utf-8",
);

describe("ResumeLibraryFloatingActionBar", () => {
  it("renders a bottom-centered floating bulk delete action only when rows are selected", () => {
    expect(source).toContain("export function ResumeLibraryFloatingActionBar");
    expect(source).toContain("const visible = selectedCount > 0;");
    expect(source).toContain("interface ResumeLibraryFloatingActionItem");
    expect(source).toContain("jobDescriptionLabel: string | null;");
    expect(source).toContain("const FLOATING_ACTION_GLASS_CLASS");
    expect(source).toContain("bg-background/32");
    expect(source).toContain("backdrop-blur-lg");
    expect(source).toContain("selectedItems: ResumeLibraryFloatingActionItem[];");
    expect(source).toContain("onClearSelection: () => void;");
    expect(source).toContain("onRemoveItem: (id: string) => void;");
    expect(source).toContain("onViewItem: (id: string) => void;");
    expect(source).toContain('import { ScrollArea } from "@/components/ui/scroll-area";');
    expect(source).toContain("<AnimatePresence>");
    expect(source).toContain(
      "fixed right-4 bottom-[calc(2.5rem+env(safe-area-inset-bottom))] left-4",
    );
    expect(source).toContain("flex flex-col items-center justify-center gap-2");
    expect(source).toContain("pointer-events-none");
    expect(source).toContain('<ScrollArea className="max-h-[7.75rem]" scrollbars="leave">');
    expect(source).not.toContain("overflow-y-auto");
    expect(source).toContain("selectedItems.map");
    expect(source).toContain("grid-cols-[minmax(0,1fr)_minmax(6rem,13rem)_auto]");
    expect(source).toContain("text-xs");
    expect(source).toContain("text-[11px]");
    expect(source).toContain('item.jobDescriptionLabel ?? "未匹配岗位"');
    expect(source).toContain("onClick={() => onViewItem(item.id)}");
    expect(source).toContain("onClick={() => onRemoveItem(item.id)}");
    expect(source).toContain('title="查看"');
    expect(source).toContain("select-none whitespace-nowrap");
    expect(source).toContain("已选择 {selectedCount} 条");
    expect(source).toContain("onClick={onClearSelection}");
    expect(source).toContain("取消选择");
    expect(source).toContain("pointer-events-auto inline-flex");
    expect(source).toContain("FLOATING_ACTION_GLASS_CLASS}");
    expect(source).toContain("批量删除");
    expect(source).not.toContain("rounded-full");
    expect(source).not.toContain("bg-background/95");
  });
});
