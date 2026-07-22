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
} as const;

const CALLOUT_COLOR = {
  ORANGE: 2,
} as const;

interface FeishuTextContent {
  elements: FeishuTextRun[];
}

export interface FeishuDocumentBlock {
  block_type: number;
  callout?: {
    background_color: number;
    border_color: number;
  };
  children?: FeishuDocumentBlock[];
  file?: Record<string, never>;
  heading2?: FeishuTextContent;
  heading3?: FeishuTextContent;
  text?: FeishuTextContent;
}

interface HrEvaluation {
  availability?: unknown;
  careerProgression?: unknown;
  compensationExpectations?: unknown;
  jobMotivation?: unknown;
  overseasTravel?: unknown;
  projectHighlights?: unknown;
  recentWork?: unknown;
}

export interface HrInterviewEvaluationInput {
  candidateName: string;
  evaluation: Record<string, unknown>;
}

export interface InterviewEvaluationDocumentInput extends HrInterviewEvaluationInput {
  resumeUrl: string;
}

export interface HrInterviewEvaluationPreview {
  block: FeishuDocumentBlock;
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

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function hrQuestionBlocks(
  questionNumber: number,
  question: string,
  answer: unknown,
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
  const hrEvaluation =
    input.evaluation.hrEvaluation && typeof input.evaluation.hrEvaluation === "object"
      ? (input.evaluation.hrEvaluation as HrEvaluation)
      : {};
  const hrChildren = [
    heading3Block("📚 HR面试评价"),
    ...hrQuestionBlocks(1, "求职动机：", hrEvaluation.jobMotivation),
    ...hrQuestionBlocks(2, "最快到岗时间：", hrEvaluation.availability),
    ...hrQuestionBlocks(3, "伦敦出差情况：", hrEvaluation.overseasTravel),
    ...hrQuestionBlocks(4, "薪酬预期沟通：", hrEvaluation.compensationExpectations),
    ...hrQuestionBlocks(5, "加薪晋升情况：", hrEvaluation.careerProgression, ""),
    ...hrQuestionBlocks(6, "目前两份工作：", hrEvaluation.recentWork),
    ...hrQuestionBlocks(7, "亮点项目分享", hrEvaluation.projectHighlights),
  ];

  return {
    block: calloutBlock(CALLOUT_COLOR.ORANGE, CALLOUT_COLOR.ORANGE, hrChildren),
    title: `${input.candidateName} - HR面试评价预览`,
  };
}

export function buildInterviewEvaluationDocument(input: InterviewEvaluationDocumentInput): {
  blocks: FeishuDocumentBlock[];
  title: string;
} {
  const hrEvaluationBlock = buildHrInterviewEvaluationBlock(input);

  return {
    blocks: [
      heading2Block("简历"),
      {
        block_type: BLOCK_TYPE.TEXT,
        text: textContent("查看候选人简历", { link: input.resumeUrl }),
      },
      hrEvaluationBlock.block,
    ],
    title: `${input.candidateName} - 面试评价表`,
  };
}
