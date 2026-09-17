import { IconRobot, IconUsers } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ResumeLibraryDetail } from "@app/shared/studio-resumes";
import { toast } from "sonner";
import { RecruitingActionButton as Button } from "./recruiting-action-button";
import { useHasPermission } from "@/hooks/use-has-permission";
import { transitionInterviewRecord } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

/** 筛选通过并推进只更新招聘节点，实际面试排期由目标阶段发起。 */
export function ScreeningAdvanceActions({
  record,
  onAdvanced,
}: {
  onAdvanced?: (target: "ai_interview" | "second_interview") => void;
  record: Pick<
    ResumeLibraryDetail,
    "id" | "version" | "pipelineStage" | "resumeEvaluationStatus"
  > & { jobDescriptionId?: string | null };
}) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const canUpdate = useHasPermission("resumeLibrary", "update");
  const canCreateAi = useHasPermission("interview", "create");
  const canCreateHuman = useHasPermission("humanInterview", "create");
  const mutation = useMutation({
    mutationFn: (targetNode: "ai_interview" | "second_interview") =>
      transitionInterviewRecord(slug, record.id, {
        action: "screening_advance",
        expectedVersion: record.version,
        targetNode,
      }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "推进失败"),
    onSuccess: async (_data, target) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["studio-resumes", slug] }),
        queryClient.invalidateQueries({ queryKey: ["studio-resume-metrics", slug] }),
      ]);
      onAdvanced?.(target);
      toast.success("已通过简历筛选并推进阶段");
    },
  });
  if (
    !canUpdate ||
    record.pipelineStage !== "screening" ||
    record.resumeEvaluationStatus === "fail"
  ) {
    return null;
  }
  return (
    <>
      {canCreateAi && (
        <Button
          size="sm"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate("ai_interview")}
        >
          <IconRobot className="size-4" />
          推进 AI 初面
        </Button>
      )}
      {canCreateHuman && (
        <Button
          size="sm"
          disabled={mutation.isPending}
          disabledReason={record.jobDescriptionId ? null : "请先绑定在招岗位，再安排复试"}
          onClick={() => mutation.mutate("second_interview")}
        >
          <IconUsers className="size-4" />
          直接安排复试
        </Button>
      )}
    </>
  );
}
