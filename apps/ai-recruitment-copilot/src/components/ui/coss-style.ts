/**
 * Surface depth follows Yohaku:
 * - Resting controls/cards: border only (no drop / inset micro-shadows).
 * - Elevated popups/modals: one whisper shadow.
 */
const cossWhisperShadowClass =
  "shadow-[0_4px_24px_rgb(0_0_0/0.05)] dark:shadow-[0_4px_24px_rgb(0_0_0/0.2)]";

/** @deprecated Kept for call-site compatibility; Yohaku resting surfaces use border only. */
const cossControlOverlayClass = "";

const cossFieldSurfaceClass =
  "relative rounded-md border border-input bg-background bg-clip-padding text-foreground transition-[border-color,box-shadow] dark:bg-input/30 " +
  "has-focus-visible:shadow-[0_1px_1px_0_--theme(--color-foreground/16%)] has-[input:disabled]:opacity-50 has-[textarea:disabled]:opacity-50 has-[select:disabled]:opacity-50 has-aria-invalid:border-destructive has-aria-invalid:ring-destructive/20 dark:has-aria-invalid:ring-destructive/40";

const cossTriggerSurfaceClass =
  "relative rounded-md border border-input bg-background bg-clip-padding text-foreground outline-none transition-[border-color,box-shadow] dark:bg-input/30 " +
  "focus-visible:shadow-[0_1px_1px_0_--theme(--color-foreground/16%)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[invalid=true]:border-destructive data-[invalid=true]:ring-[3px] data-[invalid=true]:ring-destructive/20 dark:aria-invalid:ring-destructive/40";

const cossPopupSurfaceClass =
  "relative rounded-md border border-border bg-popover bg-clip-padding text-popover-foreground outline-none " +
  cossWhisperShadowClass;

/**
 * One transitions.dev menu-dropdown recipe for every Base UI surface anchored
 * to a trigger. Base UI owns the lifecycle; these states mirror the recipe's
 * 250ms open, 150ms close, 0.97/0.99 scales and origin-aware transform.
 */
const cossAnchoredPopupMotionClass =
  "origin-(--transform-origin) transition-[scale,opacity] duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] data-instant:transition-none data-starting-style:scale-(--scale-medium) data-starting-style:opacity-0 data-ending-style:scale-(--scale-tiny) data-ending-style:opacity-0 data-ending-style:duration-[var(--duration-quick)] motion-reduce:transition-none";

const cossModalSurfaceClass =
  "relative border border-border bg-background bg-clip-padding " + cossWhisperShadowClass;

const cossModalOverlayMotionClass =
  "transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] data-instant:transition-none data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-[var(--duration-quick)] motion-reduce:transition-none";

const cossModalMotionClass =
  "transition-[scale,opacity] duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] data-instant:transition-none data-starting-style:scale-(--scale-large) data-starting-style:opacity-0 data-ending-style:scale-(--scale-large) data-ending-style:opacity-0 data-ending-style:duration-[var(--duration-quick)] motion-reduce:transition-none";

const cossTooltipMotionClass =
  "origin-(--transform-origin) transition-[scale,opacity] duration-[var(--duration-quick)] ease-[var(--ease-out)] data-instant:transition-none data-starting-style:scale-(--scale-small) data-starting-style:opacity-0 data-ending-style:scale-(--scale-small) data-ending-style:opacity-0 data-ending-style:duration-[50ms] motion-reduce:transition-none";

const cossMenuItemClass =
  "relative flex cursor-default items-center gap-2 rounded-sm text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground";

export {
  cossAnchoredPopupMotionClass,
  cossControlOverlayClass,
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
