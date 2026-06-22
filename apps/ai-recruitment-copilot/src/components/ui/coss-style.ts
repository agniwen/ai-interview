const cossControlOverlayClass =
  "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:shadow-[0_1px_--theme(--color-black/4%)] dark:before:shadow-[0_-1px_--theme(--color-white/6%)]";

const cossFieldSurfaceClass =
  "relative rounded-md border border-input bg-background bg-clip-padding text-foreground shadow-xs/5 ring-ring/24 transition-shadow dark:bg-input/30 " +
  cossControlOverlayClass +
  " has-focus-visible:border-ring has-focus-visible:ring-[3px] has-[input:disabled]:opacity-50 has-[textarea:disabled]:opacity-50 has-[select:disabled]:opacity-50 has-aria-invalid:border-destructive has-aria-invalid:ring-destructive/20 dark:has-aria-invalid:ring-destructive/40 has-[:focus-visible,[aria-invalid=true]]:shadow-none has-[:focus-visible,[aria-invalid=true]]:before:shadow-none has-[input:disabled]:shadow-none has-[textarea:disabled]:shadow-none has-[select:disabled]:shadow-none has-[input:disabled]:before:shadow-none has-[textarea:disabled]:before:shadow-none has-[select:disabled]:before:shadow-none";

const cossTriggerSurfaceClass =
  "relative rounded-md border border-input bg-background bg-clip-padding text-foreground shadow-xs/5 outline-none ring-ring/24 transition-shadow dark:bg-input/30 " +
  cossControlOverlayClass +
  " focus-visible:border-ring focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[invalid=true]:border-destructive data-[invalid=true]:ring-[3px] data-[invalid=true]:ring-destructive/20 dark:aria-invalid:ring-destructive/40 disabled:shadow-none disabled:before:shadow-none focus-visible:shadow-none focus-visible:before:shadow-none aria-invalid:shadow-none aria-invalid:before:shadow-none data-[invalid=true]:shadow-none data-[invalid=true]:before:shadow-none data-[state=open]:shadow-none data-[state=open]:before:shadow-none";

const cossPopupSurfaceClass =
  "relative rounded-md border border-border bg-popover bg-clip-padding text-popover-foreground shadow-[0_1px_3px_--theme(--color-black/5%),0_1px_0_--theme(--color-white/70%)_inset] outline-none dark:shadow-[0_1px_3px_--theme(--color-black/24%),0_1px_0_--theme(--color-white/8%)_inset] " +
  cossControlOverlayClass;

const cossModalSurfaceClass =
  "relative border border-border bg-background bg-clip-padding shadow-[0_1px_3px_--theme(--color-black/5%),0_1px_0_--theme(--color-white/70%)_inset] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:shadow-[0_1px_--theme(--color-black/4%)] dark:shadow-[0_1px_3px_--theme(--color-black/24%),0_1px_0_--theme(--color-white/8%)_inset] dark:before:shadow-[0_-1px_--theme(--color-white/6%)]";

const cossMenuItemClass =
  "relative flex cursor-default items-center gap-2 rounded-sm text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground";

export {
  cossControlOverlayClass,
  cossFieldSurfaceClass,
  cossMenuItemClass,
  cossModalSurfaceClass,
  cossPopupSurfaceClass,
  cossTriggerSurfaceClass,
};
