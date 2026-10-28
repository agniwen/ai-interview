import { Agent } from "@mastra/core/agent";
import { mastraModels, withThinkingDisabled } from "@app/ai-runtime/models";
import type {
  JobDescriptionAgentOptions,
  JobDescriptionAgentPageContext,
} from "@app/shared/job-description-agent";
import type { JobDescriptionRecord } from "@app/shared/job-descriptions";
import {
  JOB_DESCRIPTION_OPTIONS_TOOL_ID,
  JOB_DESCRIPTION_PATCH_TOOL_ID,
  createJobDescriptionSubjectTools,
} from "../tools/job-description-subject";
import { buildSubjectAgentInstructions } from "./subject-agent-instructions";

const instructions = buildSubjectAgentInstructions({
  optionsTool: JOB_DESCRIPTION_OPTIONS_TOOL_ID,
  patchTool: JOB_DESCRIPTION_PATCH_TOOL_ID,
  readOnlyNote: "岗位编码由表单中的“生成”按钮生成，不能由你填写。",
  recordLabel: "岗位",
  referenceFields:
    "所属部门（departmentId）、面试官（interviewerIds）、汇报上级（reportingManagerUserId）",
  responsibilities:
    "回答与当前岗位有关的问题，帮助填写或改进岗位名称、所属部门、面试官（未开启跨部门时只能选所属部门的面试官）、汇报上级、薪资范围、招聘人数、岗位权重、优先级、目标日期、发布日期、简历推荐渠道、岗位 JD 和内部标准。",
  savedTool: "get_saved_job_description",
  writingGuide:
    "岗位 JD 写作要求：职责与要求分开、具体可核验，避免空泛形容词，不加入与岗位无关的歧视性条件。",
});

export function createJobDescriptionSubjectAgent({
  loadJobDescription,
  loadOptions,
  pageContext,
}: {
  loadJobDescription: () => Promise<JobDescriptionRecord | null>;
  loadOptions: () => Promise<JobDescriptionAgentOptions>;
  pageContext: JobDescriptionAgentPageContext | null;
}) {
  return new Agent({
    id: "job-description-subject-agent",
    instructions,
    maxRetries: 1,
    model: withThinkingDisabled(mastraModels.fastModel),
    name: "JobDescriptionSubjectAgent",
    tools: createJobDescriptionSubjectTools({ loadJobDescription, loadOptions, pageContext }),
  });
}
