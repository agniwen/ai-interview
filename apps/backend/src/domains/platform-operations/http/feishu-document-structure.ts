/* oxlint-disable anti-slop/no-unsafe-dictionary-type, no-use-before-define, typescript/no-invalid-void-type -- Feishu's recursive block tree is provider-owned JSON; traversal callbacks and relocation recursion are kept together to preserve in-place update ordering. */
import { createHash } from "node:crypto";
import { z } from "zod";
import { qualitativeResumeEvaluationSchema } from "@arc/db-schema/qualitative-resume-evaluation";
import { INTERVIEW_QUESTION_DIMENSION_LABEL } from "@arc/db-schema/interview/types";
import { studioInterviewQuestionClientSchema } from "@arc/db-schema/studio-interviews";

type Section = "recommendedQuestions" | "resumeEvaluation";
interface TextElement {
  text_run: { content: string; text_element_style?: { bold?: boolean } };
}
interface Block {
  block_type: number;
  bullet?: { elements?: TextElement[] };
  callout?: { background_color: number; border_color: number; emoji_id: string };
  children?: Block[];
  heading2?: { elements?: TextElement[] };
  heading3?: { elements?: TextElement[] };
  ordered?: { elements?: TextElement[] };
  text?: { elements?: TextElement[] };
}

const existingBlockSchema = z
  .object({
    block_id: z.string().min(1),
    block_type: z.number().int(),
    bullet: z
      .object({ elements: z.array(z.unknown()).optional() })
      .passthrough()
      .optional(),
    children: z.array(z.string()).optional(),
    heading2: z
      .object({ elements: z.array(z.unknown()).optional() })
      .passthrough()
      .optional(),
    heading3: z
      .object({ elements: z.array(z.unknown()).optional() })
      .passthrough()
      .optional(),
    ordered: z
      .object({ elements: z.array(z.unknown()).optional() })
      .passthrough()
      .optional(),
    text: z
      .object({ elements: z.array(z.unknown()).optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();
type ExistingBlock = z.infer<typeof existingBlockSchema>;

const responseSchema = z.object({
  code: z.number(),
  data: z.unknown().optional(),
  msg: z.string().optional(),
});
const listSchema = z.object({
  has_more: z.boolean().optional(),
  items: z.array(existingBlockSchema).optional(),
  page_token: z.string().optional(),
});
const createSchema = z.object({
  children: z
    .array(z.object({ block_id: z.string().optional(), children: z.array(z.string()).optional() }))
    .optional(),
});

function text(content: string, bold = false): Block {
  return {
    block_type: 2,
    text: {
      elements: [
        {
          text_run: {
            content,
            text_element_style: bold ? { bold: true } : undefined,
          },
        },
      ],
    },
  };
}

function callout(emoji: string, color: number, children: Block[]): Block {
  return {
    block_type: 19,
    callout: { background_color: color, border_color: color, emoji_id: emoji },
    children,
  };
}

function plainText(block: ExistingBlock | undefined) {
  const value =
    block?.bullet ?? block?.heading2 ?? block?.heading3 ?? block?.ordered ?? block?.text;
  return (value?.elements ?? [])
    .flatMap((element) => {
      const parsed = z
        .object({ text_run: z.object({ content: z.string() }).passthrough() })
        .safeParse(element);
      return parsed.success ? [parsed.data.text_run.content] : [];
    })
    .join("")
    .trim();
}

function desiredText(block: Block) {
  const value = block.bullet ?? block.heading2 ?? block.heading3 ?? block.ordered ?? block.text;
  return (value?.elements ?? [])
    .map((element) => element.text_run.content)
    .join("")
    .trim();
}

function topLevelTitle(block: ExistingBlock | undefined, byId: Map<string, ExistingBlock>) {
  const child = block?.children?.[0];
  return child ? plainText(byId.get(child)) : plainText(block);
}

function isHrTitle(value: string) {
  return /^HR面试评价(?:$|[(:])/u.test(
    value
      .normalize("NFKC")
      .trim()
      .replace(/^(?:\p{Extended_Pictographic}\uFE0F?\s*)+/u, ""),
  );
}

export function planDocumentSections(titles: string[], desired: Set<Section>) {
  const resumeIndex = titles.findIndex(
    (title) => title === "简历AI简历评价" || title === "简历评价",
  );
  const questionsIndex = titles.indexOf("推荐面试题");
  const hrIndex = titles.findIndex(isHrTitle);
  const ratingIndex = titles.indexOf("评级等级确定");
  if ((desired.size > 0 && hrIndex === -1) || (ratingIndex !== -1 && ratingIndex < hrIndex)) {
    throw new Error("飞书文档缺少有效的 HR 面试评价结构锚点");
  }
  const questionsCorrect =
    questionsIndex !== -1 &&
    questionsIndex > hrIndex &&
    (ratingIndex === -1 || questionsIndex < ratingIndex);
  return {
    questionsIndex,
    questionsInsertIndex: ratingIndex === -1 ? hrIndex + 1 : ratingIndex,
    relocateQuestions:
      desired.has("recommendedQuestions") && questionsIndex !== -1 && !questionsCorrect,
    resumeIndex,
    resumeInsertIndex: hrIndex,
  };
}

async function feishuRequest(
  accessToken: string,
  path: string,
  method: "DELETE" | "GET" | "PATCH" | "POST",
  body?: Record<string, unknown>,
) {
  const headers = new Headers({ Authorization: `Bearer ${accessToken}` });
  const request: RequestInit = {
    headers,
    method,
    signal: AbortSignal.timeout(15_000),
  };
  if (body !== undefined && method !== "GET") {
    headers.set("Content-Type", "application/json; charset=utf-8");
    request.body = JSON.stringify(body);
  }
  const response = await fetch(`https://open.feishu.cn/open-apis${path}`, request);
  const parsed = responseSchema.safeParse(await response.json());
  if (!(response.ok && parsed.success && parsed.data.code === 0)) {
    throw new Error(
      parsed.success
        ? `Feishu API request failed: ${parsed.data.code || response.status} ${parsed.data.msg ?? ""}`
        : `Feishu API request failed: HTTP ${response.status}`,
    );
  }
  return parsed.data.data;
}

async function listBlocks(accessToken: string, documentId: string) {
  const rows: ExistingBlock[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ page_size: "500" });
    if (pageToken) {
      query.set("page_token", pageToken);
    }
    const parsed = listSchema.parse(
      await feishuRequest(
        accessToken,
        `/docx/v1/documents/${encodeURIComponent(documentId)}/blocks?${query}`,
        "GET",
      ),
    );
    rows.push(...(parsed.items ?? []));
    pageToken = parsed.has_more ? parsed.page_token : undefined;
    if (parsed.has_more && !pageToken) {
      throw new Error("Feishu block page token is missing");
    }
  } while (pageToken);
  return rows;
}

async function insertCallout(input: {
  accessToken: string;
  block: Block;
  documentId: string;
  index: number;
  seed: string;
}) {
  const token = createHash("sha256").update(input.seed).digest("hex");
  const created = createSchema.parse(
    await feishuRequest(
      input.accessToken,
      `/docx/v1/documents/${encodeURIComponent(input.documentId)}/blocks/${encodeURIComponent(input.documentId)}/children?client_token=${token}`,
      "POST",
      { children: [{ ...input.block, children: undefined }], index: input.index },
    ),
  );
  const calloutId = created.children?.[0]?.block_id;
  if (!calloutId) {
    throw new Error("Feishu did not return the created callout block id");
  }
  const [title, ...body] = input.block.children ?? [];
  const titleId = created.children?.[0]?.children?.[0];
  if (title && titleId) {
    await updateTextBlock(input.accessToken, input.documentId, titleId, title);
  }
  if (body.length > 0) {
    await feishuRequest(
      input.accessToken,
      `/docx/v1/documents/${encodeURIComponent(input.documentId)}/blocks/${encodeURIComponent(calloutId)}/children`,
      "POST",
      { children: body },
    );
  }
}

async function updateTextBlock(
  accessToken: string,
  documentId: string,
  blockId: string,
  block: Block,
) {
  const elements = block.text?.elements ?? block.heading3?.elements;
  if (!elements) {
    throw new Error("Feishu callout title must be a text block");
  }
  await feishuRequest(
    accessToken,
    `/docx/v1/documents/${encodeURIComponent(documentId)}/blocks/${encodeURIComponent(blockId)}`,
    "PATCH",
    { update_text_elements: { elements } },
  );
}

async function deleteChild(input: {
  accessToken: string;
  documentId: string;
  end: number;
  parentId: string;
  start: number;
}) {
  await feishuRequest(
    input.accessToken,
    `/docx/v1/documents/${encodeURIComponent(input.documentId)}/blocks/${encodeURIComponent(input.parentId)}/children/batch_delete`,
    "DELETE",
    { end_index: input.end, start_index: input.start },
  );
}

function contentMatches(
  existing: ExistingBlock | undefined,
  desired: Block,
  byId: Map<string, ExistingBlock>,
) {
  const existingChildren = (existing?.children ?? []).map((id) => byId.get(id));
  const desiredChildren = desired.children ?? [];
  return (
    existingChildren.length === desiredChildren.length &&
    existingChildren.every(
      (child, index) =>
        child?.block_type === desiredChildren[index]?.block_type &&
        plainText(child) === desiredText(desiredChildren[index] ?? text("")),
    )
  );
}

async function syncChildren(input: {
  accessToken: string;
  desired: Block;
  documentId: string;
  existing: ExistingBlock;
}) {
  const [desiredTitle, ...desiredBody] = input.desired.children ?? [];
  const existingTitleId = input.existing.children?.[0];
  if (desiredTitle && existingTitleId) {
    await updateTextBlock(input.accessToken, input.documentId, existingTitleId, desiredTitle);
  }
  if ((input.existing.children?.length ?? 0) > 1) {
    const existingChildCount = input.existing.children?.length ?? 0;
    await deleteChild({
      accessToken: input.accessToken,
      documentId: input.documentId,
      end: existingChildCount,
      parentId: input.existing.block_id,
      start: 1,
    });
  }
  if (desiredBody.length > 0) {
    await feishuRequest(
      input.accessToken,
      `/docx/v1/documents/${encodeURIComponent(input.documentId)}/blocks/${encodeURIComponent(input.existing.block_id)}/children`,
      "POST",
      { children: desiredBody },
    );
  }
}

function desiredSections(input: { evaluation: unknown; questions: unknown }) {
  const evaluation = qualitativeResumeEvaluationSchema.safeParse(input.evaluation);
  const questions = studioInterviewQuestionClientSchema.array().safeParse(input.questions);
  const result = new Map<Section, Block>();
  if (evaluation.success) {
    result.set(
      "resumeEvaluation",
      callout("books", 5, [
        text("简历AI简历评价", true),
        text(evaluation.data.detailedOverall.judgment),
        text("匹配依据", true),
        text(evaluation.data.detailedOverall.matchingEvidence),
        text("风险与待确认项", true),
        text(evaluation.data.detailedOverall.risks),
      ]),
    );
  }
  const available = questions.success
    ? questions.data
        .filter((question) => question.question.trim())
        .toSorted((left, right) => left.order - right.order)
    : [];
  if (available.length > 0) {
    result.set(
      "recommendedQuestions",
      callout("technologist", 6, [
        text("推荐面试题", true),
        ...available.flatMap((question, index) => [
          text(`${index + 1}. ${question.question.trim()}`, true),
          text(
            `考核点(${INTERVIEW_QUESTION_DIMENSION_LABEL[question.dimension ?? "business"]}维度)`,
            true,
          ),
          text(question.evaluationFocus?.trim() || "未提供"),
          text("追问方向", true),
          text(question.followUpDirections?.trim() || "未提供"),
          ...(index === available.length - 1 ? [] : [text("")]),
        ]),
      ]),
    );
  }
  return result;
}

const updateTails = new Map<string, Promise<void>>();

export async function syncInterviewEvaluationDocument(input: {
  accessToken: string;
  documentId: string;
  evaluation: unknown;
  questions: unknown;
}) {
  const previous = updateTails.get(input.documentId) ?? Promise.resolve();
  const { promise: current, resolve: release } = Promise.withResolvers<void>();
  updateTails.set(input.documentId, current);
  await previous;
  try {
    const desired = desiredSections(input);
    const blocks = await listBlocks(input.accessToken, input.documentId);
    const byId = new Map(blocks.map((block) => [block.block_id, block]));
    const root = byId.get(input.documentId);
    if (!root) {
      throw new Error("飞书文档缺少根节点，无法更新结构");
    }
    const top = (root.children ?? []).map((id) => byId.get(id));
    const titles = top.map((block) => topLevelTitle(block, byId));
    const plan = planDocumentSections(titles, new Set(desired.keys()));
    const insertedSections: Section[] = [];
    const updatedSections: Section[] = [];

    const questions = desired.get("recommendedQuestions");
    const existingQuestions = top[plan.questionsIndex];
    if (questions && plan.relocateQuestions && existingQuestions) {
      await deleteChild({
        accessToken: input.accessToken,
        documentId: input.documentId,
        end: plan.questionsIndex + 1,
        parentId: input.documentId,
        start: plan.questionsIndex,
      });
      const adjustedIndex =
        plan.questionsIndex < plan.questionsInsertIndex
          ? plan.questionsInsertIndex - 1
          : plan.questionsInsertIndex;
      await insertCallout({
        accessToken: input.accessToken,
        block: questions,
        documentId: input.documentId,
        index: adjustedIndex,
        seed: `${input.documentId}:recommendedQuestions:relocate:v1`,
      });
      updatedSections.push("recommendedQuestions");
    } else if (questions && existingQuestions) {
      if (!contentMatches(existingQuestions, questions, byId)) {
        await syncChildren({
          accessToken: input.accessToken,
          desired: questions,
          documentId: input.documentId,
          existing: existingQuestions,
        });
        updatedSections.push("recommendedQuestions");
      }
    } else if (questions) {
      await insertCallout({
        accessToken: input.accessToken,
        block: questions,
        documentId: input.documentId,
        index: plan.questionsInsertIndex,
        seed: `${input.documentId}:recommendedQuestions:insert:v1`,
      });
      insertedSections.push("recommendedQuestions");
    }

    const resume = desired.get("resumeEvaluation");
    const existingResume = top[plan.resumeIndex];
    if (resume && existingResume) {
      if (!contentMatches(existingResume, resume, byId)) {
        await syncChildren({
          accessToken: input.accessToken,
          desired: resume,
          documentId: input.documentId,
          existing: existingResume,
        });
        updatedSections.push("resumeEvaluation");
      }
    } else if (resume) {
      const refreshedBlocks = await listBlocks(input.accessToken, input.documentId);
      const refreshedById = new Map(refreshedBlocks.map((block) => [block.block_id, block]));
      const refreshedRoot = refreshedById.get(input.documentId);
      const refreshedTitles = (refreshedRoot?.children ?? []).map((id) =>
        topLevelTitle(refreshedById.get(id), refreshedById),
      );
      const refreshedResumeIndex = planDocumentSections(
        refreshedTitles,
        new Set(["resumeEvaluation"]),
      ).resumeInsertIndex;
      await insertCallout({
        accessToken: input.accessToken,
        block: resume,
        documentId: input.documentId,
        index: refreshedResumeIndex,
        seed: `${input.documentId}:resumeEvaluation:insert:v1`,
      });
      insertedSections.push("resumeEvaluation");
    }
    return { insertedSections, updatedSections };
  } finally {
    release();
    if (updateTails.get(input.documentId) === current) {
      updateTails.delete(input.documentId);
    }
  }
}
