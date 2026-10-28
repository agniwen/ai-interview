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

export const CONFIG_ASIDE_CLASS = {
  dialog: "flex min-h-0 flex-col border-l bg-background",
  page: `flex min-h-0 flex-col bg-background ${FADING_DIVIDER} after:left-0`,
} as const;

export const CONFIG_HEADER_CLASS = {
  dialog: "flex h-11 shrink-0 items-center gap-2 border-b px-4",
  page: "flex h-11 shrink-0 items-center gap-2 border-b pr-6 pl-4",
} as const;

export const CONFIG_BODY_CLASS = {
  dialog: "min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-20",
  page: "min-h-0 flex-1 overflow-y-auto pr-6 pl-4 pt-4 pb-20",
} as const;
