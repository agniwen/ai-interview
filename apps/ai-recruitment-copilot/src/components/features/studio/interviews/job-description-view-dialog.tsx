"use client";

import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useQuery } from "@tanstack/react-query";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";

export function JobDescriptionViewDialog({
  jobDescriptionId,
  onOpenChange,
}: {
  jobDescriptionId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const slug = useWorkspaceSlug();
  const { data: jobDescriptions = [], isLoading } = useQuery({
    enabled: jobDescriptionId !== null,
    queryFn: async () => {
      const payload = await rpcFetch<{ records: JobDescriptionListRecord[] }>(
        rpc.api.w[":slug"].studio["job-descriptions"].recruiting.$get({
          param: { slug },
        }),
        "加载在招岗位列表失败",
      );
      return payload.records;
    },
    queryKey: ["job-descriptions", "recruiting", slug],
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
    const interviewers = record.interviewers ?? [];
    return (
      <div className="space-y-5 text-sm">
        <section className="space-y-1.5">
          <h3 className="font-medium text-muted-foreground text-xs">面试官</h3>
          {interviewers.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {interviewers.map((person) => (
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
          <h3 className="font-medium text-muted-foreground text-xs">岗位 JD</h3>
          <Card className="gap-0 rounded-md py-0">
            <CardContent className="bg-muted/40 p-3">
              <MarkdownView className="text-sm" content={record.prompt} />
            </CardContent>
          </Card>
        </section>
      </div>
    );
  }

  return (
    <Modal
      open={jobDescriptionId !== null}
      onOpenChange={onOpenChange}
      title={record?.name ?? "关联岗位"}
      description={
        record?.departmentName ? `所属部门：${record.departmentName}` : "在招岗位只读详情"
      }
      size="lg"
    >
      {renderBody()}
    </Modal>
  );
}
