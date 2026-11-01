import { Agent } from "@mastra/core/agent";
import { mastraModels, withThinkingDisabled } from "@app/ai-runtime/models";
import type { CandidateFormTemplateRecord } from "@app/db-schema/candidate-forms";
import type { InterviewQuestionTemplateRecord } from "@app/db-schema/interview-question-templates";
import type { CandidateFormAgentPageContext } from "@app/shared/candidate-form-agent";
import type { InterviewQuestionAgentPageContext } from "@app/shared/interview-question-agent";
import {
  BINDABLE_JOB_DESCRIPTIONS_TOOL_ID,
  CANDIDATE_FORM_PATCH_TOOL_ID,
  INTERVIEW_QUESTION_PATCH_TOOL_ID,
  createCandidateFormSubjectTools,
  createInterviewQuestionSubjectTools,
} from "../tools/question-template-subjects";
import type { LoadBindableJobDescriptions } from "../tools/question-template-subjects";
import { buildSubjectAgentInstructions } from "./subject-agent-instructions";

const interviewQuestionInstructions = buildSubjectAgentInstructions({
  optionsTool: BINDABLE_JOB_DESCRIPTIONS_TOOL_ID,
  patchTool: INTERVIEW_QUESTION_PATCH_TOOL_ID,
  readOnlyNote: null,
  recordLabel: "沟通题",
  referenceFields: "绑定岗位（jobDescriptionIds）",
  responsibilities:
    "回答与当前沟通题有关的问题，帮助拟定标题、描述、作用范围和绑定岗位，以及题目、每道题的难度、考核点和追问方向。",
  savedTool: "get_saved_interview_question_template",
  writingGuide:
    "出题要求：每题只考察一个能力点，题干口语化、适合 AI 语音面试提问；考核点写清楚要验证什么，追问方向给出根据回答选择的具体追问，不包含与岗位无关或涉及隐私、歧视的问题。",
});

const candidateFormInstructions = buildSubjectAgentInstructions({
  optionsTool: BINDABLE_JOB_DESCRIPTIONS_TOOL_ID,
  patchTool: CANDIDATE_FORM_PATCH_TOOL_ID,
  readOnlyNote: null,
  recordLabel: "表单题",
  referenceFields: "绑定岗位（jobDescriptionIds）",
  responsibilities:
    "回答与当前表单题有关的问题，帮助拟定标题、描述、作用范围、绑定岗位和候选人需要填写的题目，选择合适的题型、展示方式、选项和是否必填。",
  savedTool: "get_saved_candidate_form_template",
  writingGuide:
    "表单要求：只收集招聘流程确实需要的信息，题目简短明确；能用选项的用单选或多选，选项互斥且覆盖常见情况；不收集与岗位无关的敏感个人信息。",
});

export function createInterviewQuestionSubjectAgent({
  loadJobDescriptions,
  loadTemplate,
  pageContext,
}: {
  loadJobDescriptions: LoadBindableJobDescriptions;
  loadTemplate: () => Promise<InterviewQuestionTemplateRecord | null>;
  pageContext: InterviewQuestionAgentPageContext | null;
}) {
  return new Agent({
    id: "interview-question-subject-agent",
    instructions: interviewQuestionInstructions,
    maxRetries: 1,
    model: withThinkingDisabled(mastraModels.fastModel),
    name: "InterviewQuestionSubjectAgent",
    tools: createInterviewQuestionSubjectTools({ loadJobDescriptions, loadTemplate, pageContext }),
  });
}

export function createCandidateFormSubjectAgent({
  loadJobDescriptions,
  loadTemplate,
  pageContext,
}: {
  loadJobDescriptions: LoadBindableJobDescriptions;
  loadTemplate: () => Promise<CandidateFormTemplateRecord | null>;
  pageContext: CandidateFormAgentPageContext | null;
}) {
  return new Agent({
    id: "candidate-form-subject-agent",
    instructions: candidateFormInstructions,
    maxRetries: 1,
    model: withThinkingDisabled(mastraModels.fastModel),
    name: "CandidateFormSubjectAgent",
    tools: createCandidateFormSubjectTools({ loadJobDescriptions, loadTemplate, pageContext }),
  });
}
