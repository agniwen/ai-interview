import { z } from "zod";
import type { QualitativeResumeEvaluation } from "@arc/db-schema/qualitative-resume-evaluation";
import type { InterviewQuestion } from "@arc/db-schema/interview/types";
import type { JsonObject } from "@arc/db-schema/json";

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
  TEXT: 2,
  TODO: 17,
} as const;

const CALLOUT_COLOR = {
  BLUE: 5,
  GREEN: 4,
  ORANGE: 2,
  PURPLE: 6,
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
    emoji_id?: string;
  };
  children?: FeishuDocumentBlock[];
  file?: { token?: string; view_type?: 1 | 2 };
  heading2?: FeishuTextContent;
  heading3?: FeishuTextContent;
  text?: FeishuTextContent;
  todo?: FeishuTextContent;
}

const hrEvaluationSchema = z.object({
  availability: z.string().optional(),
  careerProgression: z.string().optional(),
  compensationExpectations: z.string().optional(),
  jobMotivation: z.string().optional(),
  overseasTravel: z.string().optional(),
  projectHighlights: z.string().optional(),
  recentWork: z.string().optional(),
});

export interface HrInterviewEvaluationInput {
  candidateName: string;
  evaluation: JsonObject;
}

export interface InterviewEvaluationDocumentInput extends HrInterviewEvaluationInput {
  includeResumeLink?: boolean;
  recommendedQuestions?: InterviewQuestion[];
  resumeEvaluation?: Pick<QualitativeResumeEvaluation, "detailedOverall"> | null;
  resumeUrl: string;
}

export interface HrInterviewEvaluationPreview {
  block: FeishuDocumentBlock;
  title: string;
}

export interface InterviewEvaluationDocument {
  blocks: FeishuDocumentBlock[];
  title: string;
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

function calloutBlock(
  backgroundColor: number,
  borderColor: number,
  emojiId: string,
  children: FeishuDocumentBlock[],
): FeishuDocumentBlock {
  return {
    block_type: BLOCK_TYPE.CALLOUT,
    callout: {
      background_color: backgroundColor,
      border_color: borderColor,
      emoji_id: emojiId,
    },
    children,
  };
}

function todoBlock(content: string): FeishuDocumentBlock {
  return {
    block_type: BLOCK_TYPE.TODO,
    todo: { ...textContent(content), style: { done: false } },
  };
}

function interviewStageCallout(
  emojiId: string,
  title: string,
  backgroundColor: number,
  borderColor = backgroundColor,
): FeishuDocumentBlock {
  return calloutBlock(backgroundColor, borderColor, emojiId, [
    textBlock(title, true),
    textBlock("评级（A,B,C,D）："),
    textBlock("职级定位：业务负责人/小组主管/执行员工"),
    textBlock("角色定位：主导决策者/辅助执行者"),
    textBlock("专业技能：优/良/中/差"),
    textBlock("优势特点："),
    textBlock("劣势风险："),
    textBlock("薪资建议：月薪"),
  ]);
}

function stringValue(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function restrictedMarkdownText(value: string): string {
  return value
    .trim()
    .replaceAll(/\*\*(.+?)\*\*/g, "$1")
    .replaceAll(/\*(.+?)\*/g, "$1");
}

function buildResumeEvaluationBlocks(
  evaluation: InterviewEvaluationDocumentInput["resumeEvaluation"],
): FeishuDocumentBlock[] {
  if (!evaluation) {
    return [];
  }
  const { detailedOverall } = evaluation;
  return [
    calloutBlock(CALLOUT_COLOR.BLUE, CALLOUT_COLOR.BLUE, "books", [
      textBlock("简历评价", true),
      textBlock("综合评价", true),
      textBlock(restrictedMarkdownText(detailedOverall.judgment)),
      textBlock("匹配依据", true),
      textBlock(restrictedMarkdownText(detailedOverall.matchingEvidence)),
      textBlock("风险与待确认项", true),
      textBlock(restrictedMarkdownText(detailedOverall.risks)),
    ]),
  ];
}

function buildRecommendedQuestionBlocks(
  questions: InterviewEvaluationDocumentInput["recommendedQuestions"],
): FeishuDocumentBlock[] {
  const orderedQuestions = (questions ?? [])
    .filter((question) => question.question.trim())
    .toSorted((left, right) => left.order - right.order);
  if (orderedQuestions.length === 0) {
    return [];
  }
  return [
    calloutBlock(CALLOUT_COLOR.PURPLE, CALLOUT_COLOR.PURPLE, "technologist", [
      textBlock("推荐面试题", true),
      ...orderedQuestions.flatMap((question, index) => [
        textBlock(`${question.order}. ${question.question.trim()}`, true),
        textBlock("考核点", true),
        textBlock(stringValue(question.evaluationFocus ?? undefined, "未提供")),
        textBlock("追问方向", true),
        textBlock(stringValue(question.followUpDirections ?? undefined, "未提供")),
        ...(index === orderedQuestions.length - 1 ? [] : [textBlock("")]),
      ]),
    ]),
  ];
}

function hrQuestionBlocks(
  questionNumber: number,
  question: string,
  answer: string | undefined,
  fallback = "未收集到",
): FeishuDocumentBlock[] {
  return [
    textBlock(`${questionNumber}. ${question}`, true),
    textBlock(stringValue(answer, fallback)),
    textBlock(""),
  ];
}

export function buildHrInterviewEvaluationBlock(
  input: HrInterviewEvaluationInput,
): HrInterviewEvaluationPreview {
  const parsedHrEvaluation = hrEvaluationSchema.safeParse(input.evaluation.hrEvaluation);
  const hrEvaluation = parsedHrEvaluation.success ? parsedHrEvaluation.data : {};
  const hrChildren = [
    textBlock("HR面试评价", true),
    ...hrQuestionBlocks(1, "求职动机：", hrEvaluation.jobMotivation),
    ...hrQuestionBlocks(2, "最快到岗时间：", hrEvaluation.availability),
    ...hrQuestionBlocks(3, "伦敦出差情况：", hrEvaluation.overseasTravel),
    ...hrQuestionBlocks(4, "薪酬预期沟通：", hrEvaluation.compensationExpectations),
    ...hrQuestionBlocks(5, "加薪晋升情况：", hrEvaluation.careerProgression, ""),
    ...hrQuestionBlocks(6, "目前两份工作：", hrEvaluation.recentWork),
    ...hrQuestionBlocks(7, "亮点项目分享", hrEvaluation.projectHighlights),
  ];

  return {
    block: calloutBlock(CALLOUT_COLOR.ORANGE, CALLOUT_COLOR.ORANGE, "books", hrChildren),
    title: `${input.candidateName} - HR面试评价预览`,
  };
}

export function buildInterviewEvaluationDocument(
  input: InterviewEvaluationDocumentInput,
): InterviewEvaluationDocument {
  const hrEvaluationBlock = buildHrInterviewEvaluationBlock(input);
  const resumeLinkBlocks =
    input.includeResumeLink === false
      ? []
      : [
          heading2Block("简历"),
          {
            block_type: BLOCK_TYPE.TEXT,
            text: textContent("查看候选人简历", { link: input.resumeUrl }),
          },
        ];

  return {
    blocks: [
      ...resumeLinkBlocks,
      ...buildResumeEvaluationBlocks(input.resumeEvaluation),
      hrEvaluationBlock.block,
      heading2Block("评级等级确定"),
      todoBlock("A-超出预期 薪资110%~130%"),
      todoBlock("B-完全匹配 薪资100%~120%"),
      todoBlock("C-基本匹配 薪资90%~110%"),
      todoBlock("D-勉强接受 薪资80%~100%"),
      ...buildRecommendedQuestionBlocks(input.recommendedQuestions),
      interviewStageCallout("technologist", "业务一面评价", CALLOUT_COLOR.GREEN),
      interviewStageCallout("man_technologist", "业务二面评价", CALLOUT_COLOR.GREEN),
      interviewStageCallout(
        "office_worker",
        "HRD面试评价",
        CALLOUT_COLOR.YELLOW,
        CALLOUT_COLOR.ORANGE,
      ),
      calloutBlock(CALLOUT_COLOR.RED, CALLOUT_COLOR.RED, "man_office_worker", [
        textBlock("CEO面试评价", true),
      ]),
    ],
    title: `${input.candidateName} - 面试评价表`,
  };
}
