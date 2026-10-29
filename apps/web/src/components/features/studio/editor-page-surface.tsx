import { IconDeviceFloppy, IconLoader2, IconPlus, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { FloatingBar } from "@/components/ui/floating-bar";
import type { ModalProps } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { StudioPageActions } from "./studio-content-route-overlay";

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
      <div className="space-y-4 pt-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-medium">{title}</h1>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {headerExtra}
      </div>
      {children}
      {footer ? <StudioPageActions>{footer}</StudioPageActions> : null}
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
        <FloatingBar className="flex items-center gap-(--floating-bar-inset) p-1">
          {footer}
        </FloatingBar>
      </div>
    </section>
  );
}

/** 编辑器取消/提交按钮：创建用加号，保存用软盘，提交中替换为加载图标。 */
export function EditorFormActions({
  creating,
  formId,
  onCancel,
  submitting,
}: {
  creating: boolean;
  formId: string;
  onCancel: () => void;
  submitting: boolean;
}) {
  let submitIcon = <IconDeviceFloppy data-icon="inline-start" />;
  if (submitting) {
    submitIcon = <IconLoader2 className="animate-spin" data-icon="inline-start" />;
  } else if (creating) {
    submitIcon = <IconPlus data-icon="inline-start" />;
  }
  return (
    <>
      <Button onClick={onCancel} type="button" variant="outline">
        <IconX data-icon="inline-start" />
        取消
      </Button>
      <Button disabled={submitting} form={formId} type="submit">
        {submitIcon}
        {creating ? "创建" : "保存"}
      </Button>
    </>
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
