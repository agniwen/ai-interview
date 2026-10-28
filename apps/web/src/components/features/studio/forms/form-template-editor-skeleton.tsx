import { IconAdjustmentsHorizontal, IconListCheck, IconSettings2 } from "@tabler/icons-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EditorWorkspaceSurface } from "../editor-page-surface";
import { FADING_DIVIDER } from "./form-template-editor-layout";

function FieldSkeleton({ multiline = false }: { multiline?: boolean }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-20" />
      <Skeleton className={multiline ? "h-20 w-full" : "h-8 w-full"} />
    </div>
  );
}

export function FormTemplateEditorSkeleton() {
  return (
    <EditorWorkspaceSurface
      footer={
        <>
          <Skeleton className="h-8 w-14" />
          <Skeleton className="h-8 w-14" />
        </>
      }
    >
      <div
        aria-busy="true"
        aria-label="正在加载表单题编辑器"
        className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:-mx-6 md:grid-cols-[280px_minmax(0,1fr)_300px] xl:grid-cols-[320px_minmax(0,1fr)_340px]"
      >
        <div className={`flex min-h-0 flex-col ${FADING_DIVIDER} after:right-0`}>
          <div className="flex h-11 shrink-0 items-center gap-2 border-b pr-5 text-sm font-medium md:pl-6">
            <IconAdjustmentsHorizontal className="size-4 text-muted-foreground" />
            基础设置
          </div>
          <div className="space-y-5 overflow-hidden pr-5 pt-4 md:pl-6">
            <FieldSkeleton />
            <FieldSkeleton multiline />
            <FieldSkeleton />
            <FieldSkeleton multiline />
            <Skeleton className="h-4 w-24" />
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-16 w-full" />
            ))}
          </div>
        </div>
        <div className="hidden min-h-0 flex-col bg-muted/20 md:flex">
          <div className="flex h-11 shrink-0 items-center justify-between border-b bg-background px-5 text-sm font-medium">
            <span className="flex items-center gap-2">
              <IconListCheck className="size-4 text-muted-foreground" />
              预览画布
            </span>
            <Skeleton className="h-3 w-12" />
          </div>
          <div className="overflow-hidden px-4 pt-4">
            <div className="mx-auto w-full max-w-4xl space-y-3 rounded-xl bg-background p-4 shadow-default">
              <Skeleton className="h-6 w-40" />
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="space-y-3 py-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className={`hidden min-h-0 flex-col ${FADING_DIVIDER} after:left-0 md:flex`}>
          <div className="flex h-11 shrink-0 items-center gap-2 border-b pr-6 pl-4 text-sm font-medium">
            <IconSettings2 className="size-4 text-muted-foreground" />
            题目配置
          </div>
          <div className="space-y-5 overflow-hidden pr-6 pl-4 pt-4">
            <Skeleton className="h-8 w-3/4" />
            <FieldSkeleton />
            <FieldSkeleton />
            <Skeleton className="h-5 w-20" />
            <FieldSkeleton multiline />
            <FieldSkeleton />
          </div>
        </div>
      </div>
    </EditorWorkspaceSurface>
  );
}
