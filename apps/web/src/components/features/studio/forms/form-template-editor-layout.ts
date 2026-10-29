// 表单题编辑器分栏样式，供编辑器和骨架屏共用。 Form editor column styles, shared by the editor and its skeleton.

// 独立页的栏间分隔线：标题行这一段从透明渐变到实色。
// Page column divider that fades in across the header row.
export const FADING_DIVIDER =
  "relative after:pointer-events-none after:absolute after:inset-y-0 after:w-px after:bg-[linear-gradient(to_bottom,transparent,var(--border)_2.75rem)]";

// 独立页的网格向外扩到面板边缘（抵消页面 px-6），两侧栏再把这 24px 补回内边距。
// The page grid bleeds to the panel edges (cancelling the page's px-6); side columns pad it back.
export const SETTINGS_ASIDE_CLASS = {
  dialog: "flex min-h-0 flex-col gap-3 border-r bg-background px-4 py-4",
  page: `flex min-h-0 flex-col bg-background ${FADING_DIVIDER} after:right-0`,
} as const;

// 独立页左栏（基础设置，紧凑布局下为页签栏）：外侧 24px 对齐页面边缘，分隔线一侧 20px。
// Page left column (settings, or the tab column when compact): 24px outer edge, 20px at the divider.
export const SETTINGS_HEADER_CLASS = "flex h-11 shrink-0 items-center gap-2 border-b pr-5 pl-6";
export const SETTINGS_BODY_CLASS = "min-h-0 flex-1 space-y-5 overflow-y-auto pr-5 pl-6 pt-4 pb-20";

export const CONFIG_ASIDE_CLASS = {
  dialog: "flex min-h-0 flex-col border-l bg-background",
  page: `flex min-h-0 flex-col bg-background ${FADING_DIVIDER} after:left-0`,
} as const;

export const CONFIG_HEADER_CLASS = {
  dialog: "flex h-11 shrink-0 items-center gap-2 border-b px-4",
  page: "flex h-11 shrink-0 items-center gap-2 border-b pr-6 pl-5",
} as const;

export const CONFIG_BODY_CLASS = {
  dialog: "min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-20",
  page: "min-h-0 flex-1 overflow-y-auto pr-6 pl-5 pt-4 pb-20",
} as const;

// 独立页按编辑器自身宽度排版（打开侧面板时视口不变但可用宽度变窄）：
// 不足 1024px 时基础设置与题目配置合并为左侧页签栏、画布在右，避免画布被挤压；1280px 起两侧栏加宽。
// The page editor lays out by its own width (a side pane narrows it without changing the
// viewport): below 1024px settings and question config merge into a left tab column beside the
// canvas; from 1280px the
// side columns widen.
export type FormEditorWorkspaceLayout = "compact" | "regular" | "wide";

const COMPACT_MAX_WIDTH = 1024;
const WIDE_MIN_WIDTH = 1280;

export function getFormEditorWorkspaceLayout(width: number): FormEditorWorkspaceLayout {
  // 0 表示尚未测量或网格被隐藏（移动端），保持常规三栏。
  if (width > 0 && width < COMPACT_MAX_WIDTH) {
    return "compact";
  }
  return width >= WIDE_MIN_WIDTH ? "wide" : "regular";
}

export const WORKSPACE_COLUMNS_CLASS = {
  compact: "grid-cols-[320px_minmax(0,1fr)]",
  regular: "grid-cols-[280px_minmax(0,1fr)_300px]",
  wide: "grid-cols-[320px_minmax(0,1fr)_340px]",
} satisfies Record<FormEditorWorkspaceLayout, string>;
