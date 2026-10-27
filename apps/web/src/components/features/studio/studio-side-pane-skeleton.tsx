import { Skeleton } from "@/components/ui/skeleton";

/** Shared list placeholders; keep the pane header and close action mounted while loading. */
export function StudioSidePaneSkeleton({
  label,
  variant = "tasks",
}: {
  label: string;
  variant?: "tasks" | "approvals";
}) {
  return (
    <div aria-busy="true" aria-label={label} className="min-h-0 flex-1 overflow-hidden">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="flex gap-3 px-4 py-3">
            {variant === "tasks" ? <Skeleton className="size-6 shrink-0" /> : null}
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-6 w-16 shrink-0" />
              </div>
              <Skeleton className="h-3 w-2/5" />
              {variant === "approvals" ? <Skeleton className="h-3 w-4/5" /> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
