// 演示窗口骨架屏：SSR 与演示分包加载期间显示，几何对齐 AppShell 与招聘台（1440×856 画布内）。
// 只依赖 Skeleton，避免把 studio 列表卡片的依赖带进首屏包。
// Demo window skeleton shown during SSR and while the demo chunk loads; geometry mirrors AppShell
// and the recruiting desk on the 1440×856 canvas. Uses Skeleton only to keep the hero bundle light.
import { cn } from "@app/shared/utils";
import { Skeleton } from "@/components/ui/skeleton";

const NAV_GROUPS = [
  { items: ["w-16", "w-20", "w-14", "w-16", "w-20", "w-14", "w-12"], key: "data", sub: 5 },
  { items: ["w-16", "w-24", "w-16"], key: "config", sub: 0 },
  { items: ["w-14", "w-14"], key: "bank", sub: 0 },
] as const;

const SUB_TABS = ["w-8", "w-24", "w-20", "w-20", "w-20", "w-16", "w-16", "w-24", "w-20", "w-24"];

function SidebarSkeleton() {
  return (
    <aside className="flex w-[288px] shrink-0 flex-col p-2">
      <div className="flex shrink-0 flex-col gap-3 p-2">
        <div className="flex h-8 items-center gap-2">
          <Skeleton className="size-6 rounded-lg" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-8 w-full rounded-lg" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {NAV_GROUPS.map((group) => (
          <div className="flex flex-col p-2" key={group.key}>
            <div className="flex h-8 items-center px-2">
              <Skeleton className="h-3 w-10" />
            </div>
            <div className="flex flex-col gap-px">
              {group.items.map((width, index) => (
                // oxlint-disable-next-line react/no-array-index-key -- 静态骨架行。 Static skeleton rows.
                <div className="contents" key={`${group.key}-${index}`}>
                  <div className="flex h-8 items-center gap-2 px-2">
                    <Skeleton className="size-4 rounded" />
                    <Skeleton className={cn("h-3.5", width)} />
                  </div>
                  {index === 0 && group.sub > 0 ? (
                    <div className="mx-3.5 flex flex-col gap-px border-sidebar-border border-l px-2.5 pt-1 pb-0.5">
                      {Array.from({ length: group.sub }, (_, sub) => (
                        <div className="flex h-8 items-center px-2" key={sub}>
                          <Skeleton className="h-3 w-14" />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex h-9 items-center gap-2 px-2.5 pb-1">
        <Skeleton className="size-6 rounded-full" />
        <Skeleton className="h-3.5 w-16" />
      </div>
    </aside>
  );
}

function ResumeCardSkeleton({ divider }: { divider: boolean }) {
  return (
    <div
      className={cn(
        "relative py-1.5",
        divider &&
          "after:pointer-events-none after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-border",
      )}
    >
      <div className="flex gap-3 p-4">
        <Skeleton className="mt-3 size-4 shrink-0" />
        <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_15rem] gap-x-6 gap-y-2">
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="size-12 shrink-0 rounded-full" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-6 w-20 rounded-[8px]" />
            <Skeleton className="h-6 w-28 rounded-[8px]" />
          </div>
          <div />
          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="flex items-center gap-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-4 w-[70%]" />
            {["w-[62%]", "w-[54%]", "w-[58%]"].map((width) => (
              <div className="flex items-center gap-3" key={width}>
                <Skeleton className="h-6 w-24 rounded-[8px]" />
                <Skeleton className={cn("h-4", width)} />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2.5 border-border border-l border-dashed pl-6">
            {["w-36", "w-32", "w-36"].map((width) => (
              <div className="flex items-center gap-4" key={width}>
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className={cn("h-3.5", width)} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DemoWindowSkeleton() {
  return (
    <div
      aria-hidden="true"
      // 窗口按约 0.85 缩小，默认 gray-3 骨架在 gray-1 底上几乎不可见；统一提到半透明 gray-a5，明暗主题都适用。
      // 骨架只是演示窗口加载前的静态占位，不做闪烁动画。
      // The canvas renders scaled down, so default gray-3 bars vanish on gray-1; use translucent gray-a5 in both themes.
      // It is a static placeholder until the demo loads, so the bars do not pulse.
      className="flex h-full w-full bg-sidebar [&_[data-slot=skeleton]]:animate-none [&_[data-slot=skeleton]]:bg-(--gray-a5)"
      data-slot="home-demo-skeleton"
    >
      <SidebarSkeleton />
      <section className="relative m-3 ml-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-background shadow-default dark:shadow-none dark:ring-[0.5px] dark:ring-border">
        <div className="flex h-12 shrink-0 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-16" />
            <Skeleton className="size-7" />
            <Skeleton className="size-7" />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden px-6 py-6">
          <Skeleton className="h-7 w-28" />
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-[30rem] rounded-lg" />
            <div className="flex items-center gap-6">
              {SUB_TABS.map((width, index) => (
                // oxlint-disable-next-line react/no-array-index-key -- 静态骨架行。 Static skeleton rows.
                <Skeleton className={cn("h-3.5", width)} key={index} />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-28" />
            </div>
            <div>
              <div className="flex h-11 items-center gap-2 px-4">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-3 w-12" />
              </div>
              <ResumeCardSkeleton divider />
              <ResumeCardSkeleton divider={false} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
