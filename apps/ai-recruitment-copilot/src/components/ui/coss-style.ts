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
  "relative rounded-md border border-input bg-background bg-clip-padding text-foreground ring-ring/24 transition-[border-color,box-shadow] dark:bg-input/30 " +
  "has-focus-visible:border-ring has-focus-visible:ring-[3px] has-[input:disabled]:opacity-50 has-[textarea:disabled]:opacity-50 has-[select:disabled]:opacity-50 has-aria-invalid:border-destructive has-aria-invalid:ring-destructive/20 dark:has-aria-invalid:ring-destructive/40";

const cossTriggerSurfaceClass =
  "relative rounded-md border border-input bg-background bg-clip-padding text-foreground outline-none ring-ring/24 transition-[border-color,box-shadow] dark:bg-input/30 " +
  "focus-visible:border-ring focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[invalid=true]:border-destructive data-[invalid=true]:ring-[3px] data-[invalid=true]:ring-destructive/20 dark:aria-invalid:ring-destructive/40";

const cossPopupSurfaceClass =
  "relative rounded-md border border-border bg-popover bg-clip-padding text-popover-foreground outline-none " +
  cossWhisperShadowClass;

const cossModalSurfaceClass =
  "relative border border-border bg-background bg-clip-padding " + cossWhisperShadowClass;

const cossMenuItemClass =
  "relative flex cursor-default items-center gap-2 rounded-sm text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground";

export {
  cossControlOverlayClass,
  cossFieldSurfaceClass,
  cossMenuItemClass,
  cossModalSurfaceClass,
  cossPopupSurfaceClass,
  cossTriggerSurfaceClass,
  cossWhisperShadowClass,
};
