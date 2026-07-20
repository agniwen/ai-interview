interface FeishuTextRun {
  text_run: {
    content: string;
    text_element_style?: {
      bold?: boolean;
      link?: { url: string };
    };
  };
}

const BLOCK_TYPE = {
  CALLOUT: 19,
  HEADING_2: 4,
  HEADING_3: 5,
  ORDERED: 13,
  QUOTE: 15,
  TEXT: 2,
  TODO: 17,
} as const;

const CALLOUT_COLOR = {
  GREEN: 4,
  ORANGE: 2,
  RED: 1,
  YELLOW: 3,
} as const;

interface FeishuTextContent {
  elements: FeishuTextRun[];
  style?: { done?: boolean };
}

export interface FeishuDocumentBlock {
  block_type: number;
  callout?: {
    background_color: number;
    border_color: number;
  };
  children?: FeishuDocumentBlock[];
  heading2?: FeishuTextContent;
  heading3?: FeishuTextContent;
  ordered?: FeishuTextContent;
  quote?: FeishuTextContent;
  text?: FeishuTextContent;
  todo?: FeishuTextContent;
}

interface EvaluationEvidence {
  quote?: unknown;
}

interface EvaluationQuestion {
  assessment?: unknown;
  evidence?: unknown;
  maxScore?: unknown;
  question?: unknown;
  score?: unknown;
}

interface HrEvaluation {
  availability?: unknown;
  careerProgression?: unknown;
  compensationExpectations?: unknown;
  jobMotivation?: unknown;
  overseasTravel?: unknown;
  recentWork?: unknown;
}

export interface InterviewEvaluationDocumentInput {
  candidateName: string;
  detailUrl: string;
  duration: string;
  evaluation: Record<string, unknown>;
  interviewStartedAt: string;
  resumeUrl: string;
  summary: string | null;
  targetRole: string | null;
}

function textContent(
  content: string,
  options: { bold?: boolean; link?: string } = {},
): FeishuTextContent {
  return {
    elements: [
      {
        text_run: {
          content,
          text_element_style:
            options.bold || options.link
              ? {
                  bold: options.bold,
                  link: options.link ? { url: options.link } : undefined,
                }
              : undefined,
        },
      },
    ],
  };
}

function textBlock(content: string, bold = false): FeishuDocumentBlock {
  return { block_type: BLOCK_TYPE.TEXT, text: textContent(content, { bold }) };
}

function heading2Block(content: string): FeishuDocumentBlock {
  return { block_type: BLOCK_TYPE.HEADING_2, heading2: textContent(content) };
}

function heading3Block(content: string): FeishuDocumentBlock {
  return { block_type: BLOCK_TYPE.HEADING_3, heading3: textContent(content) };
}

function calloutBlock(
  backgroundColor: number,
  borderColor: number,
  children: FeishuDocumentBlock[],
): FeishuDocumentBlock {
  return {
    block_type: BLOCK_TYPE.CALLOUT,
    callout: { background_color: backgroundColor, border_color: borderColor },
    children,
  };
}

function todoBlock(content: string): FeishuDocumentBlock {
  return { block_type: BLOCK_TYPE.TODO, todo: { ...textContent(content), style: { done: false } } };
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function evaluationQuestionBlocks(evaluation: Record<string, unknown>): FeishuDocumentBlock[] {
  if (!Array.isArray(evaluation.questions)) {
    return [];
  }

  return evaluation.questions.flatMap((rawQuestion): FeishuDocumentBlock[] => {
    if (!rawQuestion || typeof rawQuestion !== "object") {
      return [];
    }
    const question = rawQuestion as EvaluationQuestion;
    const questionText = stringValue(question.question, "未命名题目");
    const score = numberValue(question.score);
    const maxScore = numberValue(question.maxScore);
    const scoreLabel = score === null ? "暂无评分" : `${score}/${maxScore ?? 10}`;
    const blocks: FeishuDocumentBlock[] = [
      {
        block_type: BLOCK_TYPE.ORDERED,
        ordered: textContent(`${questionText}（${scoreLabel}）`, { bold: true }),
      },
      textBlock(`评价：${stringValue(question.assessment, "暂无评价")}`),
    ];

    if (Array.isArray(question.evidence)) {
      for (const rawEvidence of question.evidence) {
        if (!rawEvidence || typeof rawEvidence !== "object") {
          continue;
        }
        const quote = stringValue((rawEvidence as EvaluationEvidence).quote, "");
        if (quote) {
          blocks.push({
            block_type: BLOCK_TYPE.QUOTE,
            quote: textContent(`候选人原话：${quote}`),
          });
        }
      }
    }

    return blocks;
  });
}

function interviewStageCallout(
  title: string,
  backgroundColor: number,
  borderColor: number,
  includeSalary: boolean,
): FeishuDocumentBlock {
  const fields = ["面试评级（A,B,C,D）：", "团队定位：", "职级定位："];
  if (includeSalary) {
    fields.push("建议薪资：");
  }
  fields.push("优劣势：", "风险关注项：");
  return calloutBlock(backgroundColor, borderColor, [
    heading3Block(title),
    ...fields.map((field) => textBlock(field)),
  ]);
}

function hrQuestionBlocks(question: string, answer: unknown): FeishuDocumentBlock[] {
  return [
    {
      block_type: BLOCK_TYPE.ORDERED,
      ordered: textContent(question),
    },
    textBlock(`答案：${stringValue(answer, "未收集到")}`),
  ];
}

export function buildInterviewEvaluationDocument(input: InterviewEvaluationDocumentInput): {
  blocks: FeishuDocumentBlock[];
  title: string;
} {
  const overallScore = numberValue(input.evaluation.overallScore);
  const recommendation = stringValue(input.evaluation.recommendation, "暂无建议");
  const overallAssessment = stringValue(input.evaluation.overallAssessment, "暂无整体评价");
  const hrEvaluation =
    input.evaluation.hrEvaluation && typeof input.evaluation.hrEvaluation === "object"
      ? (input.evaluation.hrEvaluation as HrEvaluation)
      : {};
  const hrChildren = [
    heading3Block("📚 HR面试评价（AI）"),
    ...hrQuestionBlocks("求职动机：", hrEvaluation.jobMotivation),
    ...hrQuestionBlocks(
      "最快到岗时间：当前 base 地、求职状态及到岗时间；",
      hrEvaluation.availability,
    ),
    ...hrQuestionBlocks(
      "海外出差情况：成家情况，是否可以接受短期海外出差及周期；",
      hrEvaluation.overseasTravel,
    ),
    ...hrQuestionBlocks(
      "薪酬预期沟通：过往 2 份薪酬及结构，【年包=固定月薪+浮动月薪+奖金+期权/股票】，薪酬期望。",
      hrEvaluation.compensationExpectations,
    ),
    ...hrQuestionBlocks(
      "加薪晋升情况：过往 2 份工作的绩效情况、是否有晋升、加薪晋级获奖荣誉；",
      hrEvaluation.careerProgression,
    ),
    ...hrQuestionBlocks(
      "目前两份工作：公司规模以及部门架构，个人角色定位（主导者还是参与者）；\n① 非管理岗：工作节奏、压力、离职原因及亮点项目；\n② 管理岗：向上、向下管理技巧及沟通。",
      hrEvaluation.recentWork,
    ),
    {
      block_type: BLOCK_TYPE.ORDERED,
      ordered: textContent("签证评估情况：小原评估"),
    } satisfies FeishuDocumentBlock,
    heading3Block("AI 面试结果"),
    textBlock(`候选人：${input.candidateName}`),
    textBlock(`目标岗位：${input.targetRole ?? "未填写"}`),
    textBlock(`面试时间：${input.interviewStartedAt}`),
    textBlock(`面试耗时：${input.duration}`),
    textBlock(`综合评分：${overallScore === null ? "暂无评分" : `${overallScore}/100`}`, true),
    textBlock(`推荐结论：${recommendation}`, true),
    textBlock(`整体评价：${overallAssessment}`),
    textBlock(`面试摘要：${input.summary?.trim() || "暂无摘要"}`),
    ...evaluationQuestionBlocks(input.evaluation),
    {
      block_type: BLOCK_TYPE.TEXT,
      text: textContent("AI面试链接：查看完整报告", { bold: true, link: input.detailUrl }),
    } satisfies FeishuDocumentBlock,
  ];

  return {
    blocks: [
      heading2Block("简历"),
      {
        block_type: BLOCK_TYPE.TEXT,
        text: textContent("查看候选人简历", { link: input.resumeUrl }),
      },
      calloutBlock(CALLOUT_COLOR.ORANGE, CALLOUT_COLOR.ORANGE, hrChildren),
      heading2Block("评级等级确定"),
      todoBlock("A-超出预期 薪资110%~130%"),
      todoBlock("B-完全匹配 薪资100%~120%"),
      todoBlock("C-基本匹配 薪资90%~110%"),
      todoBlock("D-勉强接受 薪资80%~100%"),
      interviewStageCallout("🧑‍💻 业务一面评价", CALLOUT_COLOR.GREEN, CALLOUT_COLOR.GREEN, false),
      interviewStageCallout("👨‍💻 业务二面评价", CALLOUT_COLOR.GREEN, CALLOUT_COLOR.GREEN, true),
      interviewStageCallout("🧑‍💼 HRD面试评价", CALLOUT_COLOR.YELLOW, CALLOUT_COLOR.ORANGE, true),
      interviewStageCallout("👨‍💼 CEO面试评价", CALLOUT_COLOR.RED, CALLOUT_COLOR.RED, false),
    ],
    title: `${input.candidateName} - 面试评价表`,
  };
}
