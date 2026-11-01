import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";

interface StudioSummaryCardItem {
  id: string;
  label: ReactNode;
  value: ReactNode;
}

interface StudioSummaryCardsProps {
  className?: string;
  items: StudioSummaryCardItem[];
  loading?: boolean;
}

/**
 * compact：与 StudioSummaryCards 一致的单行卡片（左标签、右数值）；默认保留带说明的高卡片骨架。
 * compact mirrors StudioSummaryCards' single-row cards; the default keeps the taller described layout.
 */
export function StudioSummaryCardsSkeleton({
  compact = false,
  count = 4,
}: {
  compact?: boolean;
  count?: number;
}) {
  return (
    <section
      aria-label="概览数据加载中"
      className="grid grid-cols-2 gap-4 xl:grid-cols-4"
      data-slot="studio-summary-cards-skeleton"
    >
      {Array.from({ length: count }, (_, index) =>
        compact ? (
          <Card className="flex-row items-center justify-between px-5 py-3" key={index}>
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-7 w-12" />
          </Card>
        ) : (
          <Card key={index}>
            <CardHeader className="pb-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-9 w-16" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-5 w-4/5" />
            </CardContent>
          </Card>
        ),
      )}
    </section>
  );
}

export function StudioSummaryCards({ className, items, loading = false }: StudioSummaryCardsProps) {
  return (
    <SkeletonReveal
      className={className}
      loading={loading}
      skeleton={<StudioSummaryCardsSkeleton compact count={items.length} />}
    >
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {items.map((item) => (
          <Card className="flex-row items-center justify-between gap-3 px-5 py-3" key={item.id}>
            <CardDescription className="truncate">{item.label}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{item.value}</CardTitle>
          </Card>
        ))}
      </section>
    </SkeletonReveal>
  );
}
