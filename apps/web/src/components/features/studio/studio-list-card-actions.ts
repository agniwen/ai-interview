/** 招聘台 / 人才库列表卡片的根节点 class，供操作浮层响应 hover / 聚焦。 */
export const STUDIO_LIST_CARD_GROUP_CLASS = "group/list-card";

/**
 * PC（lg 及以上）下操作区以浮层形式铺满卡片右侧整高（左缘渐变过渡）、按钮垂直居中，仅在 hover、键盘聚焦或菜单展开时出现，
 * 不占用卡片排版；移动端仍在卡片底部常驻。
 */
export const STUDIO_LIST_CARD_FLOATING_ACTIONS_CLASS =
  "lg:pointer-events-none lg:absolute lg:inset-y-0 lg:right-0 lg:z-20 lg:items-center lg:bg-muted lg:px-3 lg:opacity-0 lg:transition-opacity lg:dark:bg-[color-mix(in_oklab,var(--input)_30%,var(--background))] lg:before:pointer-events-none lg:before:absolute lg:before:inset-y-0 lg:before:right-full lg:before:w-8 lg:before:bg-linear-to-r lg:before:from-transparent lg:before:to-muted lg:dark:before:to-[color-mix(in_oklab,var(--input)_30%,var(--background))] lg:group-hover/list-card:pointer-events-auto lg:group-hover/list-card:opacity-100 lg:group-focus-within/list-card:pointer-events-auto lg:group-focus-within/list-card:opacity-100 lg:has-data-popup-open:pointer-events-auto lg:has-data-popup-open:opacity-100";

/** 浮层内按钮纵向排列。 */
export const STUDIO_LIST_CARD_ACTIONS_STACK_CLASS =
  "flex items-center justify-end gap-1.5 lg:flex-col lg:items-stretch lg:gap-0.5";
