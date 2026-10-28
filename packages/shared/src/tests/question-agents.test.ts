import { describe, expect, it } from "vitest";
import {
  buildCandidateFormAgentPatch,
  candidateFormAgentPatchInputSchema,
  findCandidateFormAgentPatchConflicts,
  resolveCandidateFormAgentQuestions,
} from "../candidate-form-agent";
import type { CandidateFormAgentPageContext } from "../candidate-form-agent";
import {
  buildInterviewQuestionAgentPatch,
  findInterviewQuestionAgentPatchConflicts,
  interviewQuestionAgentPatchMatches,
  pickInterviewQuestionAgentPageContext,
  resolveInterviewQuestionAgentQuestions,
  toInterviewQuestionFormQuestions,
} from "../interview-question-agent";
import type { InterviewQuestionAgentPageContext } from "../interview-question-agent";
import {
  createSubjectAgentReferenceResolution,
  resolveSubjectAgentJobBinding,
} from "../subject-agent-references";

const interviewContext: InterviewQuestionAgentPageContext = {
  description: "",
  jobDescriptionIds: [],
  questions: [
    {
      content: "介绍一个你负责的项目。",
      difficulty: "easy",
      evaluationFocus: null,
      followUpDirections: null,
      id: "q-1",
    },
  ],
  scope: "global",
  title: "前端沟通题",
};

const formContext: CandidateFormAgentPageContext = {
  description: "",
  jobDescriptionIds: [],
  questions: [
    {
      displayMode: "textarea",
      helperText: "",
      id: "f-1",
      label: "期望薪资",
      options: [],
      required: true,
      type: "text",
    },
  ],
  scope: "global",
  title: "基础信息",
};

describe("interview question agent patch", () => {
  it("keeps existing question ids and numbers questions by position", () => {
    const ids = ["new-1"];
    const resolved = resolveInterviewQuestionAgentQuestions(
      [
        {
          content: "讲讲状态管理选择。",
          difficulty: "medium",
          evaluationFocus: null,
          followUpDirections: null,
        },
        {
          content: "介绍一个你负责的项目。",
          difficulty: "easy",
          evaluationFocus: "个人贡献",
          followUpDirections: null,
          id: "q-1",
        },
      ],
      interviewContext,
      () => ids.shift() ?? "unexpected",
    );
    const questions = toInterviewQuestionFormQuestions(resolved);

    expect(questions.map((question) => [question.id, question.sortOrder])).toEqual([
      ["new-1", 0],
      ["q-1", 1],
    ]);
  });

  it("detects a question list changed after the suggestion was generated", () => {
    const patch = buildInterviewQuestionAgentPatch(
      { changes: { title: "高级前端沟通题" }, summary: "改标题" },
      interviewContext,
    );

    expect(
      findInterviewQuestionAgentPatchConflicts(patch, { ...interviewContext, questions: [] }),
    ).toEqual([]);
    expect(
      findInterviewQuestionAgentPatchConflicts(patch, { ...interviewContext, title: "已改" }),
    ).toEqual(["title"]);
  });
});

describe("candidate form agent patch", () => {
  it("applies the saved-form question rules to agent questions", () => {
    const result = candidateFormAgentPatchInputSchema.safeParse({
      changes: {
        questions: [
          {
            displayMode: "radio",
            helperText: "",
            label: "是否接受出差",
            options: [{ label: "是", value: "yes" }],
            required: true,
            type: "single",
          },
        ],
      },
      summary: "新增单选题",
    });

    expect(result.success).toBe(false);
  });

  it("drops options from text questions and keeps existing ids", () => {
    const questions = resolveCandidateFormAgentQuestions(
      [
        {
          displayMode: "input",
          helperText: "",
          id: "f-1",
          label: "期望薪资（K）",
          options: [],
          required: true,
          type: "text",
        },
      ],
      formContext,
      () => "unexpected",
    );

    expect(questions).toEqual([
      expect.objectContaining({ id: "f-1", label: "期望薪资（K）", options: [] }),
    ]);
  });

  it("reports conflicts only for patched fields", () => {
    const patch = buildCandidateFormAgentPatch(
      { changes: { description: "入职前填写" }, summary: "补充描述" },
      formContext,
    );

    expect(
      findCandidateFormAgentPatchConflicts(patch, { ...formContext, title: "已改标题" }),
    ).toEqual([]);
  });
});

describe("subject agent job binding", () => {
  const jobs = [
    { id: "jd-1", name: "前端开发" },
    { id: "jd-2", name: "算法工程师" },
  ];
  const bound = { jobDescriptionIds: ["jd-1"], scope: "job_description" as const };

  it("switches to job scope when only jobs are given and resolves job names", () => {
    const resolution = createSubjectAgentReferenceResolution();
    const changes = resolveSubjectAgentJobBinding(
      { jobDescriptionIds: ["jd-2", "jd-1", "jd-2"] },
      { jobDescriptionIds: [], scope: "global" },
      jobs,
      resolution,
    );

    expect(changes).toEqual({ jobDescriptionIds: ["jd-2", "jd-1"], scope: "job_description" });
    expect(resolution).toEqual({
      displayValues: { jobDescriptionIds: "算法工程师、前端开发", scope: "指定在招岗位" },
      issues: [],
    });
  });

  it("clears bound jobs when the scope becomes global", () => {
    const resolution = createSubjectAgentReferenceResolution();

    expect(resolveSubjectAgentJobBinding({ scope: "global" }, bound, jobs, resolution)).toEqual({
      jobDescriptionIds: [],
      scope: "global",
    });
    expect(resolution.issues).toEqual([]);
  });

  it("rejects a job scope without jobs and unknown job ids", () => {
    const empty = createSubjectAgentReferenceResolution();
    resolveSubjectAgentJobBinding({ jobDescriptionIds: [] }, bound, jobs, empty);
    const unknown = createSubjectAgentReferenceResolution();
    resolveSubjectAgentJobBinding({ jobDescriptionIds: ["jd-x"] }, bound, jobs, unknown);

    expect(empty.issues).toHaveLength(1);
    expect(unknown.issues).toHaveLength(1);
  });
});

describe("interview question agent patch matching", () => {
  it("matches after applying a patch with new questions and blank optional text", () => {
    const patch = buildInterviewQuestionAgentPatch(
      {
        changes: {
          questions: [
            {
              content: "讲讲状态管理选择。",
              difficulty: "hard",
              evaluationFocus: null,
              followUpDirections: null,
            },
          ],
        },
        summary: "替换题目",
      },
      interviewContext,
    );
    const applied = toInterviewQuestionFormQuestions(
      resolveInterviewQuestionAgentQuestions(
        patch.changes.questions ?? [],
        interviewContext,
        () => "new-1",
      ),
    );
    const afterApply = pickInterviewQuestionAgentPageContext({
      description: "",
      jobDescriptionIds: [],
      questions: applied,
      scope: "global",
      title: interviewContext.title,
    });

    expect(interviewQuestionAgentPatchMatches(patch, interviewContext)).toBe(false);
    expect(interviewQuestionAgentPatchMatches(patch, afterApply)).toBe(true);
  });
});
