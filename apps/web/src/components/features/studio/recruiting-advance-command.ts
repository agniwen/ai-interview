import type { InterviewQuestion } from "@app/db-schema/interview/types";
import type { PipelineStage } from "@app/db-schema/studio-interviews";
import type { ResumeLibraryDetail } from "@app/shared/studio-resumes";
import type { RecruitingPipelineAction } from "@app/shared/studio-pipeline-stages";

/** 筛选推进统一走原子确认入口，不能把简历筛选记录成跳过。 */
export function buildRecruitingAdvanceCommand(
  current: Pick<ResumeLibraryDetail, "pipelineStage" | "version">,
  target: Exclude<PipelineStage, "closed">,
  interviewQuestions?: InterviewQuestion[],
): RecruitingPipelineAction {
  if (current.pipelineStage === "screening") {
    if (target !== "ai_interview" && target !== "second_interview") {
      throw new Error("简历筛选后请选择 AI 初面或复试");
    }
    return { action: "screening_advance", expectedVersion: current.version, targetNode: target };
  }
  return {
    action: "advance",
    expectedVersion: current.version,
    interviewQuestions,
    targetNode: target,
  };
}
