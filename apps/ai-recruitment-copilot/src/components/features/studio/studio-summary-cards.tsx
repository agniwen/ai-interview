import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@arc/shared/utils";

export interface StudioSummaryCardItem {
  id: string;
  description: ReactNode;
  label: ReactNode;
  value: ReactNode;
}

interface StudioSummaryCardsProps {
  className?: string;
  items: StudioSummaryCardItem[];
}

export function StudioSummaryCards({ className, items }: StudioSummaryCardsProps) {
  return (
    <section className={cn("grid grid-cols-2 gap-4 xl:grid-cols-4", className)}>
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
  );
}
