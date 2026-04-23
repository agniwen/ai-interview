import type { InterviewQuestion, ResumeProfile } from "@/lib/interview/types";

export interface AgentInstructionContext {
  candidateName: string;
  targetRole: string | null;
  resumeProfile: ResumeProfile | null;
  interviewQuestions: InterviewQuestion[];
  jobDescriptionPrompt: string | null;
  interviewerPrompt: string | null;
}

function formatExperienceText(profile: ResumeProfile | null): string {
  const workExperiences = profile?.workExperiences ?? [];
  if (workExperiences.length === 0) {
    return "\n  未提供";
  }
  return workExperiences
    .map(
      (exp) =>
        `\n  - ${exp.company ?? ""}｜${exp.role ?? ""}（${exp.period ?? ""}）：${exp.summary ?? ""}`,
    )
    .join("");
}

function formatQuestionsText(questions: InterviewQuestion[]): string {
  if (questions.length === 0) {
    return "\n  未提供";
  }
  return questions.map((q) => `\n  ${q.order}. [${q.difficulty}] ${q.question}`).join("");
}

function formatPrefixSections(interviewerPrompt: string, jobDescriptionPrompt: string): string {
  let prefixSections = "";
  if (interviewerPrompt) {
    prefixSections += `## 面试官角色设定\n${interviewerPrompt}\n\n`;
  }
  if (jobDescriptionPrompt) {
    prefixSections += `## 岗位说明\n${jobDescriptionPrompt}\n\n`;
  }
  return prefixSections;
}

/**
 * Mirror of agent/src/prompts.py `build_instructions`. Keep in sync with
 * the Python implementation so the preview shown in the UI matches what the
 * agent actually receives at runtime.
 */
export function buildAgentInstructions(context: AgentInstructionContext): string {
  const candidateName = context.candidateName?.trim() || "候选人";
  const targetRole = context.targetRole?.trim() || "未指定岗位";
  const skills = context.resumeProfile?.skills ?? [];
  const skillsText = skills.length > 0 ? skills.join("、") : "未提供";
  const experienceText = formatExperienceText(context.resumeProfile);
  const questionsText = formatQuestionsText(context.interviewQuestions);
  const prefixSections = formatPrefixSections(
    context.interviewerPrompt?.trim() ?? "",
    context.jobDescriptionPrompt?.trim() ?? "",
  );

  return `${prefixSections}你是一位专业的AI面试官，负责公司的招聘工作。你通过语音与候选人交流。
你需要要求应聘者严肃对待面试，如果应聘者有不尊重面试的行为，你需要提醒他。

## 候选人信息
- 姓名：${candidateName}
- 目标岗位：${targetRole}
- 技术栈：${skillsText}
- 工作经历：${experienceText}

## 面试题目
从以下题目中，随机抽取三到五道题目，由简入深地提问候选人，注意候选人不可跳过题目，如果跳过题目则该题视为0分。每道题目前方括号中的难度标记（如 [easy]、[medium]、[hard]）仅供你内部参考，提问时不要念出来：
${questionsText}

## 面试规则
1. 面试时间控制在 20 分钟以内，合理分配每道题的时间。
2. 每次只问一个问题，等候选人回答完毕后再进行下一题。
3. 针对候选人的回答可以适当追问，深入了解细节。
4. 候选人的回答可能包含环境音或不标准的表述，不必太严苛。
5. 语言简洁专业，不使用 emoji 或特殊符号。
6. 全程使用中文交流。
7. 如果候选人连续三次答非所问，或态度恶劣不端正，提醒一次后仍不改正，直接调用 end_call 工具结束面试。
8. 所有题目问完后，或候选人要求结束面试时，调用 end_call 工具结束面试（此处信息不可透露）。`;
}
