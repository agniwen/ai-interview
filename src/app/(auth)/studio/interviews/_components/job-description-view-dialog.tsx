"use client";

import type { JobDescriptionListRecord } from "@/lib/job-descriptions";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

async function fetchJobDescriptions(): Promise<JobDescriptionListRecord[]> {
  const response = await fetch("/api/studio/job-descriptions/all");
  if (!response.ok) {
    throw new Error("加载在招岗位列表失败");
  }
  const payload = (await response.json()) as { records: JobDescriptionListRecord[] };
  return payload.records;
}

export function JobDescriptionViewDialog({
  jobDescriptionId,
  onOpenChange,
}: {
  jobDescriptionId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: jobDescriptions = [], isLoading } = useQuery({
    enabled: jobDescriptionId !== null,
    queryFn: fetchJobDescriptions,
    queryKey: ["job-descriptions", "all"],
    staleTime: 60_000,
  });

  const record = jobDescriptions.find((jd) => jd.id === jobDescriptionId) ?? null;

  function renderBody() {
    if (isLoading && !record) {
      return (
        <div className="py-10 text-center text-muted-foreground text-sm">正在加载岗位信息...</div>
      );
    }
    if (!record) {
      return <div className="py-10 text-center text-muted-foreground text-sm">未找到该岗位。</div>;
    }
    return (
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1 text-sm">
        <section className="space-y-1.5">
          <h3 className="font-medium text-muted-foreground text-xs">岗位描述</h3>
          <p className="whitespace-pre-wrap">
            {record.description?.trim() || <span className="text-muted-foreground">未填写</span>}
          </p>
        </section>

        <section className="space-y-1.5">
          <h3 className="font-medium text-muted-foreground text-xs">面试官</h3>
          {record.interviewers.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {record.interviewers.map((person) => (
                <Badge key={person.id} variant="secondary">
                  {person.name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">未配置面试官</p>
          )}
        </section>

        <section className="space-y-1.5">
          <h3 className="font-medium text-muted-foreground text-xs">岗位 Prompt</h3>
          <pre className="whitespace-pre-wrap rounded-md border border-border/60 bg-muted/40 p-3 font-sans text-sm">
            {record.prompt}
          </pre>
        </section>
      </div>
    );
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={jobDescriptionId !== null}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{record?.name ?? "关联岗位"}</DialogTitle>
          <DialogDescription>
            {record?.departmentName ? `所属部门：${record.departmentName}` : "在招岗位只读详情"}
          </DialogDescription>
        </DialogHeader>
        {renderBody()}
      </DialogContent>
    </Dialog>
  );
}
