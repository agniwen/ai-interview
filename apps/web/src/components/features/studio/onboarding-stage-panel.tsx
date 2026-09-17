import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DatePicker } from "@/components/date-time-picker";
import { updateCandidateExpectations } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import type { ResumeLibraryDetail } from "@app/shared/studio-resumes";
import { candidateOutcomeMeta, recruitingNodeStatusMeta } from "@app/db-schema/studio-interviews";
import { Badge } from "@/components/ui/badge";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { EmptyValue } from "@/components/features/display/empty-value";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { TimeDisplay } from "@/components/features/display/time-display";
import { DetailRow } from "./interviews/interview-detail/detail-row";

function OnboardingHiredDetails({
  details,
}: {
  details: NonNullable<ResumeLibraryDetail["closedMeta"]>["hiredDetails"];
}) {
  const salary = details?.finalBaseSalary;
  return (
    <>
      <DetailRow label="最终职位" value={details?.finalPosition || <EmptyValue />} />
      <DetailRow
        label="最终月薪"
        value={
          salary !== null && salary !== undefined ? `¥ ${salary.toLocaleString()}` : <EmptyValue />
        }
      />
      <DetailRow label="入职联系人" value={details?.onboardingContact || <EmptyValue />} />
    </>
  );
}

function OnboardingEarliestDate({ record }: { record: ResumeLibraryDetail }) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (value: string) =>
      updateCandidateExpectations(slug, record.id, { earliestJoiningDate: value || null }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存日期失败"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["studio-resumes", slug] }),
  });
  return (
    <DatePicker
      aria-label="最早可到岗日期"
      value={record.candidateExpectationsMeta?.earliestJoiningDate ?? ""}
      onValueChange={(value) => mutation.mutate(value)}
      disabled={mutation.isPending}
    />
  );
}

function earliestDateValue(record: ResumeLibraryDetail, canUpdate: boolean) {
  if (canUpdate && record.pipelineStage === "onboarding") {
    return <OnboardingEarliestDate record={record} />;
  }
  return record.candidateExpectationsMeta?.earliestJoiningDate || <EmptyValue />;
}

export function OnboardingStagePanel({
  record,
  canUpdate = false,
}: {
  record: ResumeLibraryDetail;
  canUpdate?: boolean;
}) {
  const node = record.nodeStates.find((state) => state.node === "onboarding");
  const closed = record.pipelineStage === "closed";
  const hired = closed && record.outcome === "hired";
  const details = record.closedMeta?.hiredDetails;
  const status = closed
    ? candidateOutcomeMeta[record.outcome].label
    : recruitingNodeStatusMeta[node?.status ?? "pending"].label;
  const reason = node?.reason || (closed ? record.closedReason : null);

  return (
    <Frame>
      <FrameHeader>
        <FrameTitle>入职办理</FrameTitle>
      </FrameHeader>
      <FramePanel className="space-y-6">
        {!closed && (
          <p className="text-muted-foreground text-sm">
            跟进入职材料和到岗情况。候选人到岗后，点击操作栏的“确认入职结果”，填写到岗日期与说明并确认入职。
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailRow
            label="办理状态"
            value={<Badge variant={hired ? "success" : "outline"}>{status}</Badge>}
          />
          <DetailRow
            label="进入办理时间"
            value={<TimeDisplay value={node?.enteredAt} emptyText="未记录" />}
          />
          <DetailRow label="最早可到岗日期" value={earliestDateValue(record, canUpdate)} />
          <DetailRow label="到岗日期" value={details?.actualJoiningDate || <EmptyValue />} />
          {closed && (
            <DetailRow
              label="结果确认时间"
              value={<TimeDisplay value={node?.decidedAt} emptyText="未记录" />}
            />
          )}
          {hired && <OnboardingHiredDetails details={details} />}
        </div>
        <div className="space-y-2">
          <h4 className="font-medium text-sm">办理说明</h4>
          {reason ? (
            <MarkdownView content={reason} />
          ) : (
            <p className="text-muted-foreground text-sm">暂无办理说明</p>
          )}
        </div>
      </FramePanel>
    </Frame>
  );
}
