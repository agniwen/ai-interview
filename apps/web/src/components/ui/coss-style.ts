/**
 * Surface depth follows the four elevation tokens in globals.css:
 * - Resting controls: shadow-default (0.5px ring + tight drop) instead of a border.
 * - Anchored popups: shadow-large. Modals: shadow-extra-large.
 * Fields keep a transparent 1px border so invalid/focus states can still colour it.
 */
const cossWhisperShadowClass = "shadow-large";

const cossFieldFocusClass =
  "has-focus-visible:border-ring has-focus-visible:ring-[3px] has-focus-visible:ring-ring/15";

const cossFieldSurfaceClass =
  "relative rounded-lg border border-transparent bg-control text-foreground shadow-default transition-[border-color,box-shadow] " +
  `${cossFieldFocusClass} has-[input:disabled]:opacity-50 has-[textarea:disabled]:opacity-50 has-[select:disabled]:opacity-50 has-aria-invalid:border-destructive has-aria-invalid:ring-destructive/20 dark:has-aria-invalid:ring-destructive/40`;

const cossTriggerSurfaceClass =
  "relative rounded-md border border-transparent bg-control text-foreground shadow-default outline-none transition-[border-color,box-shadow] " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[invalid=true]:border-destructive data-[invalid=true]:ring-[3px] data-[invalid=true]:ring-destructive/20 dark:aria-invalid:ring-destructive/40";

const cossPopupSurfaceClass =
  "relative rounded-xl bg-popover text-popover-foreground outline-none " + cossWhisperShadowClass;

/**
 * One transitions.dev menu-dropdown recipe for every Base UI surface anchored
 * to a trigger. Base UI owns the lifecycle; these states mirror the recipe's
 * 250ms open, 150ms close, 0.97/0.99 scales and origin-aware transform.
 */
const cossAnchoredPopupMotionClass =
  "origin-(--transform-origin) transition-[scale,opacity] duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] data-instant:transition-none data-starting-style:scale-(--scale-medium) data-starting-style:opacity-0 data-ending-style:scale-(--scale-tiny) data-ending-style:opacity-0 data-ending-style:duration-[var(--duration-quick)] motion-reduce:transition-none";

const cossModalSurfaceClass = "relative bg-background shadow-extra-large";

const cossModalOverlayMotionClass =
  "transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] data-instant:transition-none data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-[var(--duration-quick)] motion-reduce:transition-none";

const cossModalMotionClass =
  "transition-[scale,opacity] duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] data-instant:transition-none data-starting-style:scale-(--scale-large) data-starting-style:opacity-0 data-ending-style:scale-(--scale-large) data-ending-style:opacity-0 data-ending-style:duration-[var(--duration-quick)] motion-reduce:transition-none";

const cossTooltipMotionClass =
  "origin-(--transform-origin) transition-[scale,opacity] duration-[var(--duration-quick)] ease-[var(--ease-out)] data-instant:transition-none data-starting-style:scale-(--scale-small) data-starting-style:opacity-0 data-ending-style:scale-(--scale-small) data-ending-style:opacity-0 data-ending-style:duration-[50ms] motion-reduce:transition-none";

const cossMenuItemClass =
  "relative flex cursor-default items-center gap-2 rounded-lg text-[13px] outline-hidden select-none focus:bg-component focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground";

export {
  cossAnchoredPopupMotionClass,
  cossFieldFocusClass,
  cossFieldSurfaceClass,
  cossMenuItemClass,
  cossModalMotionClass,
  cossModalOverlayMotionClass,
  cossModalSurfaceClass,
  cossPopupSurfaceClass,
  cossTooltipMotionClass,
  cossTriggerSurfaceClass,
  cossWhisperShadowClass,
};
