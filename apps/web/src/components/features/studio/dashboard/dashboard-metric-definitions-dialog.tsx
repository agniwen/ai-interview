"use client";

import { Modal } from "@/components/ui/modal";
import {
  DASHBOARD_METRIC_DEFINITION_GROUPS,
  DASHBOARD_SCOPE_NOTE,
} from "./dashboard-metric-definitions";

export function DashboardMetricDefinitionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Modal
      bodyClassName="space-y-5"
      description="查看数据范围、统计周期和各指标的计算方式。"
      onOpenChange={onOpenChange}
      open={open}
      size="lg"
      title="指标说明"
    >
      <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm leading-6 text-muted-foreground">
        {DASHBOARD_SCOPE_NOTE}
      </div>
      {DASHBOARD_METRIC_DEFINITION_GROUPS.map((group) => (
        <section className="space-y-2" key={group.title}>
          <h3 className="font-medium text-sm">{group.title}</h3>
          <dl className="divide-y rounded-xl border">
            {group.items.map((item) => (
              <div
                className="grid gap-1 px-4 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4"
                key={item.label}
              >
                <dt className="font-medium text-sm">{item.label}</dt>
                <dd className="text-muted-foreground text-sm leading-6">{item.definition}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </Modal>
  );
}
