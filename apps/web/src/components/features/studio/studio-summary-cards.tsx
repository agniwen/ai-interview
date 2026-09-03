import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";

export interface StudioSummaryCardItem {
  id: string;
  description: ReactNode;
  label: ReactNode;
  value: ReactNode;
}

interface StudioSummaryCardsProps {
  className?: string;
  items: StudioSummaryCardItem[];
  loading?: boolean;
}

export function StudioSummaryCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <section
      aria-label="概览数据加载中"
      className="grid grid-cols-2 gap-4 xl:grid-cols-4"
      data-slot="studio-summary-cards-skeleton"
    >
      {Array.from({ length: count }, (_, index) => (
        <Card key={index}>
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-9 w-16" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-5 w-4/5" />
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

export function StudioSummaryCards({ className, items, loading = false }: StudioSummaryCardsProps) {
  return (
    <SkeletonReveal
      className={className}
      loading={loading}
      skeleton={<StudioSummaryCardsSkeleton count={items.length} />}
    >
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {items.map((item) => (
          <Card key={item.id}>
            <CardHeader className="pb-2">
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="text-3xl">{item.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-muted-foreground text-sm">{item.description}</div>
            </CardContent>
          </Card>
        ))}
      </section>
    </SkeletonReveal>
  );
}
