import { FloatingBar } from "@/components/ui/floating-bar";
import type { ModalProps } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";

/** Page presentation for existing editors; form state and submission stay in their owning feature. */
export function EditorPageSurface({
  title,
  description,
  headerExtra,
  footer,
  children,
  workspace = false,
}: ModalProps & { workspace?: boolean }) {
  return (
    <section
      className={
        workspace
          ? "flex h-[calc(100dvh-var(--header-height)-4rem)] min-h-[32rem] w-full flex-col gap-4"
          : "mx-auto flex w-full max-w-[96rem] flex-col gap-6 pb-20"
      }
    >
      <div className="sticky top-[var(--header-height)] z-10 space-y-4 bg-background py-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-medium">{title}</h1>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">{footer}</div>
        </div>
        {headerExtra}
      </div>
      {children}
    </section>
  );
}

export function EditorWorkspaceSurface({
  children,
  footer,
}: Pick<ModalProps, "children" | "footer">) {
  return (
    <section className="relative -mt-2 -mb-4 flex h-[calc(100dvh-var(--header-height)-2.5rem)] min-h-[32rem] w-full flex-col md:-mt-4 md:-mb-6 md:h-[calc(100dvh-var(--header-height)-1.5rem)]">
      {children}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center">
        <FloatingBar className="flex items-center gap-2 p-1">{footer}</FloatingBar>
      </div>
    </section>
  );
}

export function EditorPageSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="正在加载编辑页面"
      className="mx-auto w-full max-w-[96rem] space-y-6"
    >
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
