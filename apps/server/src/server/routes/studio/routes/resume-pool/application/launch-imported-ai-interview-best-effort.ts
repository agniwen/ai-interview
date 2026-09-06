import type { LaunchAiInterviewRoundResult } from "../../resumes/application/launch-ai-interview-round";

const reasons = {
  closed_candidate: "招聘流程已结束，请重新打开后发起面试。",
  not_found: "招聘记录暂不可访问，请刷新招聘台后重试。",
  resume_not_ready: "简历尚未就绪，请完成解析后发起面试。",
  round_not_created: "面试轮次暂未创建，请在招聘台重试。",
  screening_not_passed: "简历筛选尚未通过，请确认筛选结果后发起面试。",
  stage_conflict: "招聘阶段已变更，请在招聘台确认当前阶段。",
  structured_evaluation_confirmation_required: "需要确认简历评估结果，请在招聘台发起面试。",
};

/** 导入事务已经提交，轮次创建失败只报告可恢复原因，不能再返回导入失败。 */
export async function launchImportedAiInterviewBestEffort(
  resumeRecordId: string,
  launch: () => Promise<LaunchAiInterviewRoundResult>,
): Promise<string | undefined> {
  try {
    const result = await launch();
    return result.ok ? undefined : `已加入招聘台，但未创建面试轮次：${reasons[result.reason]}`;
  } catch (error) {
    console.error("[resume-pool] AI interview launch failed after import", {
      error,
      resumeRecordId,
    });
    return "已加入招聘台，但未创建面试轮次，请在招聘台重试。";
  }
}
