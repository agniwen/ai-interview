/* oxlint-disable max-lines -- Feishu document transport, retry, and content-sync invariants stay in one adapter. */
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { getFeishuTenantAccessToken } from "../../../lib/server/feishu-access-token";
import type { FeishuProviderId } from "./provider";
import { z } from "zod";
import { getFeishuAppCredentials, getFeishuEvaluationFolderToken } from "./provider";
import type { FeishuDocumentBlock } from "./interview-evaluation-doc";

const FEISHU_API_ROOT = "https://open.feishu.cn/open-apis";
const EDIT_THROTTLE_MS = 350;
const MAX_BLOCKS_PER_REQUEST = 50;
const MAX_ATTEMPTS = 3;
const MAX_STALE_CREATED_BLOCK_ATTEMPTS = 5;

class FeishuApiError extends Error {
  readonly code: number;
  readonly status: number;

  constructor(code: number, status: number, message: string) {
    super(`Feishu API request failed: ${code || status} ${message}`);
    this.name = "FeishuApiError";
    this.code = code;
    this.status = status;
  }
}

function discardFeishuResponse(): undefined {
  return undefined;
}

const feishuApiResponseSchema = z.object({
  code: z.number(),
  data: z.unknown().optional(),
  msg: z.string().optional(),
});

const createDocumentResponseSchema = z.object({
  document: z.object({ document_id: z.string().min(1).optional() }).optional(),
});

const createBlocksResponseSchema = z.object({
  children: z
    .array(
      z.object({
        block_id: z.string().min(1).optional(),
        children: z.array(z.string().min(1)).optional(),
      }),
    )
    .optional(),
});

const existingTextContentSchema = z
  .object({
    elements: z.array(z.unknown()).optional(),
  })
  .passthrough();

const existingDocumentBlockSchema = z
  .object({
    block_id: z.string().min(1),
    block_type: z.number().int(),
    bullet: existingTextContentSchema.optional(),
    children: z.array(z.string().min(1)).optional(),
    heading2: existingTextContentSchema.optional(),
    heading3: existingTextContentSchema.optional(),
    ordered: existingTextContentSchema.optional(),
    parent_id: z.string().optional(),
    text: existingTextContentSchema.optional(),
  })
  .passthrough();

const listDocumentBlocksResponseSchema = z.object({
  has_more: z.boolean().optional(),
  items: z.array(existingDocumentBlockSchema).optional(),
  page_token: z.string().min(1).optional(),
});

const existingTextRunSchema = z
  .object({ text_run: z.object({ content: z.string() }).passthrough() })
  .passthrough();

const uploadMediaResponseSchema = z.object({ file_token: z.string().min(1).optional() });

const emptyFeishuResponseSchema = z
  .object({})
  .passthrough()
  .optional()
  .transform(discardFeishuResponse);

interface FeishuDocxAttachment {
  bytes: Uint8Array;
  fileName: string;
}

interface FeishuRequestBody {
  children?: FeishuDocumentBlock[];
  end_index?: number;
  folder_token?: string;
  index?: number;
  member_id?: string;
  member_type?: "openid";
  perm?: "edit";
  replace_file?: { token: string };
  start_index?: number;
  title?: string;
  type?: "docx" | "user";
  update_text_elements?: {
    elements: NonNullable<FeishuDocumentBlock["text"]>["elements"];
  };
}

interface CreateFeishuDocxOptions {
  accessToken: string;
  attachment?: FeishuDocxAttachment;
  blocks: FeishuDocumentBlock[];
  folderToken?: string;
  recipientOpenId: string;
  title: string;
}

interface GrantFeishuDocxAccessOptions {
  accessToken: string;
  documentId: string;
  recipientOpenId: string;
}

interface MoveFeishuDocxOptions {
  accessToken: string;
  documentId: string;
  folderToken: string;
}

interface FeishuDocxDependencies {
  fetcher: typeof fetch;
  sleep: (milliseconds: number) => Promise<void>;
}

type ExistingDocumentBlock = z.infer<typeof existingDocumentBlockSchema>;

export type InterviewEvaluationStructureSection = "recommendedQuestions" | "resumeEvaluation";

interface UpdateInterviewEvaluationStructureOptions {
  accessToken: string;
  documentId: string;
  recommendedQuestionsBlock?: FeishuDocumentBlock;
  resumeEvaluationBlock?: FeishuDocumentBlock;
}

const defaultDependencies: FeishuDocxDependencies = {
  fetcher: fetch,
  sleep: delay,
};

function withoutChildren(block: FeishuDocumentBlock): FeishuDocumentBlock {
  const { children: _, ...flatBlock } = block;
  return flatBlock;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export function resolveFeishuDocxDocumentId(
  documentId: string | null,
  documentUrl: string,
): string | undefined {
  const storedDocumentId = documentId?.trim();
  if (storedDocumentId) {
    return storedDocumentId;
  }

  try {
    const pathSegments = new URL(documentUrl).pathname.split("/").filter(Boolean);
    return pathSegments[0] === "docx" ? pathSegments[1] : undefined;
  } catch {
    return undefined;
  }
}

async function requestFeishu<T extends z.ZodType>(
  path: string,
  accessToken: string,
  body: FeishuRequestBody | undefined,
  responseDataSchema: T,
  dependencies: FeishuDocxDependencies,
  method: "DELETE" | "GET" | "PATCH" | "POST" = "POST",
): Promise<z.output<T>> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const headers = new Headers({ authorization: `Bearer ${accessToken}` });
    if (body) {
      headers.set("content-type", "application/json; charset=utf-8");
    }
    const response = await dependencies.fetcher(`${FEISHU_API_ROOT}${path}`, {
      body: body ? JSON.stringify(body) : undefined,
      headers,
      method,
    });
    const parsedResponse = feishuApiResponseSchema.safeParse(await response.json());
    if (!parsedResponse.success) {
      throw new Error("Feishu API returned an invalid JSON response");
    }
    const result = parsedResponse.data;
    if (response.ok && result.code === 0) {
      const parsedData = responseDataSchema.safeParse(result.data);
      if (parsedData.success) {
        return parsedData.data;
      }
      throw new Error("Feishu API returned an invalid success payload");
    }

    const error = new FeishuApiError(result.code, response.status, result.msg ?? "");
    const rateLimited = response.status === 429 || result.code === 99_991_400;
    if (!rateLimited || attempt === MAX_ATTEMPTS) {
      throw error;
    }
    await dependencies.sleep(500 * 2 ** (attempt - 1));
  }

  throw new Error("Feishu API request failed after retries");
}

async function appendBlocks(
  documentId: string,
  parentBlockId: string,
  blocks: FeishuDocumentBlock[],
  accessToken: string,
  dependencies: FeishuDocxDependencies,
  index?: number,
  clientTokenSeed?: string,
): Promise<{ block_id?: string; children?: string[] }[]> {
  const created: { block_id?: string; children?: string[] }[] = [];
  let nextIndex = index;
  let chunkIndex = 0;
  for (const blockChunk of chunks(blocks, MAX_BLOCKS_PER_REQUEST)) {
    const requestBody: FeishuRequestBody = {
      children: blockChunk.map(withoutChildren),
    };
    if (nextIndex !== undefined) {
      requestBody.index = nextIndex;
    }
    const clientToken = clientTokenSeed
      ? createHash("sha256").update(`${clientTokenSeed}:${chunkIndex}`).digest("hex")
      : undefined;
    const path = `/docx/v1/documents/${encodeURIComponent(documentId)}/blocks/${encodeURIComponent(parentBlockId)}/children${clientToken ? `?client_token=${clientToken}` : ""}`;
    const response = await requestFeishu(
      path,
      accessToken,
      requestBody,
      createBlocksResponseSchema,
      dependencies,
    );
    created.push(...(response.children ?? []));
    if (nextIndex !== undefined) {
      nextIndex += blockChunk.length;
    }
    chunkIndex += 1;
    await dependencies.sleep(EDIT_THROTTLE_MS);
  }
  return created;
}

async function listDocumentBlocks(
  documentId: string,
  accessToken: string,
  dependencies: FeishuDocxDependencies,
): Promise<ExistingDocumentBlock[]> {
  const blocks: ExistingDocumentBlock[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ page_size: "500" });
    if (pageToken) {
      query.set("page_token", pageToken);
    }
    const page = await requestFeishu(
      `/docx/v1/documents/${encodeURIComponent(documentId)}/blocks?${query.toString()}`,
      accessToken,
      undefined,
      listDocumentBlocksResponseSchema,
      dependencies,
      "GET",
    );
    blocks.push(...(page.items ?? []));
    pageToken = page.has_more ? page.page_token : undefined;
    if (page.has_more && !pageToken) {
      throw new Error("Feishu document blocks response did not include page_token");
    }
  } while (pageToken);
  return blocks;
}

function plainText(block: ExistingDocumentBlock | undefined): string {
  const content =
    block?.bullet ?? block?.heading2 ?? block?.heading3 ?? block?.ordered ?? block?.text;
  return (content?.elements ?? [])
    .flatMap((element) => {
      const parsed = existingTextRunSchema.safeParse(element);
      return parsed.success ? [parsed.data.text_run.content] : [];
    })
    .join("")
    .trim();
}

function desiredBlockText(block: FeishuDocumentBlock): string {
  const content = block.bullet ?? block.ordered ?? block.text;
  return (content?.elements ?? [])
    .map((element) => element.text_run.content)
    .join("")
    .trim();
}

function calloutBodyMatches(
  existingCallout: ExistingDocumentBlock,
  desiredCallout: FeishuDocumentBlock,
  blocksById: Map<string, ExistingDocumentBlock>,
): boolean {
  const existingBody = (existingCallout.children ?? []).slice(1).map((blockId) => {
    const block = blocksById.get(blockId);
    return block ? { blockType: block.block_type, content: plainText(block) } : null;
  });
  const desiredBody = (desiredCallout.children ?? []).slice(1).map((block) => ({
    blockType: block.block_type,
    content: desiredBlockText(block),
  }));
  return JSON.stringify(existingBody) === JSON.stringify(desiredBody);
}

function calloutTitleMatches(
  existingCallout: ExistingDocumentBlock,
  desiredCallout: FeishuDocumentBlock,
  blocksById: Map<string, ExistingDocumentBlock>,
): boolean {
  const existingTitleId = existingCallout.children?.[0];
  const desiredTitle = desiredCallout.children?.[0];
  return Boolean(
    existingTitleId &&
    desiredTitle &&
    plainText(blocksById.get(existingTitleId)) === desiredBlockText(desiredTitle),
  );
}

function calloutMatches(
  existingCallout: ExistingDocumentBlock,
  desiredCallout: FeishuDocumentBlock,
  blocksById: Map<string, ExistingDocumentBlock>,
): boolean {
  return (
    calloutTitleMatches(existingCallout, desiredCallout, blocksById) &&
    calloutBodyMatches(existingCallout, desiredCallout, blocksById)
  );
}

function syncTransitionFingerprint(
  existingCallout: ExistingDocumentBlock,
  desiredBody: FeishuDocumentBlock[],
  blocksById: Map<string, ExistingDocumentBlock>,
): string {
  const existingBody = (existingCallout.children ?? []).slice(1).map((blockId) => {
    const block = blocksById.get(blockId);
    return {
      blockId,
      blockType: block?.block_type ?? null,
      content: plainText(block),
    };
  });
  return createHash("sha256").update(JSON.stringify({ desiredBody, existingBody })).digest("hex");
}

async function deleteBlockChildren(
  documentId: string,
  parentBlockId: string,
  startIndex: number,
  endIndex: number,
  accessToken: string,
  dependencies: FeishuDocxDependencies,
  clientTokenSeed: string,
): Promise<void> {
  const clientToken = createHash("sha256").update(clientTokenSeed).digest("hex");
  await requestFeishu(
    `/docx/v1/documents/${encodeURIComponent(documentId)}/blocks/${encodeURIComponent(parentBlockId)}/children/batch_delete?client_token=${clientToken}`,
    accessToken,
    { end_index: endIndex, start_index: startIndex },
    emptyFeishuResponseSchema,
    dependencies,
    "DELETE",
  );
  await dependencies.sleep(EDIT_THROTTLE_MS);
}

async function updateCalloutTitle(
  documentId: string,
  titleBlockId: string,
  titleBlock: FeishuDocumentBlock,
  accessToken: string,
  dependencies: FeishuDocxDependencies,
): Promise<void> {
  const elements = titleBlock.text?.elements ?? titleBlock.heading3?.elements;
  if (!elements) {
    throw new Error("Feishu callout title must be a text block");
  }
  await requestFeishu(
    `/docx/v1/documents/${encodeURIComponent(documentId)}/blocks/${encodeURIComponent(titleBlockId)}`,
    accessToken,
    { update_text_elements: { elements } },
    emptyFeishuResponseSchema,
    dependencies,
    "PATCH",
  );
}

async function syncCalloutContent(
  options: {
    accessToken: string;
    blocksById: Map<string, ExistingDocumentBlock>;
    desiredCallout: FeishuDocumentBlock;
    documentId: string;
    existingCallout: ExistingDocumentBlock;
    section: InterviewEvaluationStructureSection;
  },
  dependencies: FeishuDocxDependencies,
): Promise<void> {
  const existingTitleId = options.existingCallout.children?.[0];
  const desiredTitle = options.desiredCallout.children?.[0];
  if (
    existingTitleId &&
    desiredTitle &&
    !calloutTitleMatches(options.existingCallout, options.desiredCallout, options.blocksById)
  ) {
    await updateCalloutTitle(
      options.documentId,
      existingTitleId,
      desiredTitle,
      options.accessToken,
      dependencies,
    );
    await dependencies.sleep(EDIT_THROTTLE_MS);
  }
  if (calloutBodyMatches(options.existingCallout, options.desiredCallout, options.blocksById)) {
    return;
  }
  const desiredBody = (options.desiredCallout.children ?? []).slice(1);
  const fingerprint = syncTransitionFingerprint(
    options.existingCallout,
    desiredBody,
    options.blocksById,
  );
  const existingChildCount = options.existingCallout.children?.length ?? 0;
  if (existingChildCount > 1) {
    await deleteBlockChildren(
      options.documentId,
      options.existingCallout.block_id,
      1,
      existingChildCount,
      options.accessToken,
      dependencies,
      `interview-evaluation:${options.documentId}:${options.section}:${fingerprint}:delete`,
    );
  }
  if (desiredBody.length > 0) {
    await appendBlocks(
      options.documentId,
      options.existingCallout.block_id,
      desiredBody,
      options.accessToken,
      dependencies,
      undefined,
      `interview-evaluation:${options.documentId}:${options.section}:${fingerprint}:body`,
    );
  }
}

function topLevelBlockTitle(
  block: ExistingDocumentBlock | undefined,
  blocksById: Map<string, ExistingDocumentBlock>,
): string {
  const directContent = plainText(block);
  if (directContent) {
    return directContent;
  }
  for (const childId of block?.children ?? []) {
    const content = plainText(blocksById.get(childId));
    if (content) {
      return content;
    }
  }
  return "";
}

async function populateNestedBlocks(
  documentId: string,
  documentBlocks: FeishuDocumentBlock[],
  topLevelBlocks: { block_id?: string; children?: string[] }[],
  accessToken: string,
  dependencies: FeishuDocxDependencies,
  options?: { clientTokenSeed?: string; updateCalloutTitleAfterChildren?: boolean },
): Promise<void> {
  for (const [index, block] of documentBlocks.entries()) {
    if (!block.children || block.children.length === 0) {
      continue;
    }
    const parentBlockId = topLevelBlocks[index]?.block_id;
    if (!parentBlockId) {
      throw new Error(`Feishu did not return block_id for top-level block ${index}`);
    }
    const generatedTitleBlockId = topLevelBlocks[index]?.children?.[0];
    if (block.block_type === 19 && generatedTitleBlockId) {
      if (!options?.updateCalloutTitleAfterChildren) {
        await updateCalloutTitle(
          documentId,
          generatedTitleBlockId,
          block.children[0],
          accessToken,
          dependencies,
        );
        await dependencies.sleep(EDIT_THROTTLE_MS);
      }
      await appendBlocks(
        documentId,
        parentBlockId,
        block.children.slice(1),
        accessToken,
        dependencies,
        undefined,
        options?.clientTokenSeed ? `${options.clientTokenSeed}:${index}:children` : undefined,
      );
      if (options?.updateCalloutTitleAfterChildren) {
        await updateCalloutTitle(
          documentId,
          generatedTitleBlockId,
          block.children[0],
          accessToken,
          dependencies,
        );
        await dependencies.sleep(EDIT_THROTTLE_MS);
      }
      continue;
    }
    await appendBlocks(
      documentId,
      parentBlockId,
      block.children,
      accessToken,
      dependencies,
      undefined,
      options?.clientTokenSeed ? `${options.clientTokenSeed}:${index}:children` : undefined,
    );
  }
}

async function insertTopLevelBlock(
  options: {
    accessToken: string;
    block: FeishuDocumentBlock;
    documentId: string;
    idempotencyKey: string;
    index: number;
  },
  dependencies: FeishuDocxDependencies,
): Promise<void> {
  const baseClientTokenSeed = `interview-evaluation:${options.documentId}:${options.idempotencyKey}`;
  let clientTokenSeed = baseClientTokenSeed;
  for (
    let recoveryAttempt = 0;
    recoveryAttempt < MAX_STALE_CREATED_BLOCK_ATTEMPTS;
    recoveryAttempt += 1
  ) {
    const created = await appendBlocks(
      options.documentId,
      options.documentId,
      [options.block],
      options.accessToken,
      dependencies,
      options.index,
      `${clientTokenSeed}:top-level`,
    );
    try {
      await populateNestedBlocks(
        options.documentId,
        [options.block],
        created,
        options.accessToken,
        dependencies,
        {
          clientTokenSeed,
          updateCalloutTitleAfterChildren: true,
        },
      );
      return;
    } catch (error) {
      const createdBlockId = created[0]?.block_id;
      const isNotFound = error instanceof FeishuApiError && error.code === 1_770_002;
      if (
        !isNotFound ||
        !createdBlockId ||
        recoveryAttempt === MAX_STALE_CREATED_BLOCK_ATTEMPTS - 1
      ) {
        throw error;
      }
      const currentBlocks = await listDocumentBlocks(
        options.documentId,
        options.accessToken,
        dependencies,
      );
      if (currentBlocks.some((block) => block.block_id === createdBlockId)) {
        throw error;
      }
      clientTokenSeed = `${baseClientTokenSeed}:recover:${recoveryAttempt}:${createdBlockId}`;
    }
  }
}

async function uploadFeishuDocxAttachment(
  documentId: string,
  blockId: string,
  attachment: FeishuDocxAttachment,
  accessToken: string,
  dependencies: FeishuDocxDependencies,
): Promise<string> {
  const body = new FormData();
  body.append("file_name", attachment.fileName);
  body.append("parent_type", "docx_file");
  body.append("parent_node", blockId);
  body.append("size", String(attachment.bytes.byteLength));
  body.append("extra", JSON.stringify({ drive_route_token: documentId }));
  const pdfBytes = new Uint8Array(attachment.bytes.byteLength);
  pdfBytes.set(attachment.bytes);
  body.append(
    "file",
    new Blob([pdfBytes.buffer], { type: "application/pdf" }),
    attachment.fileName,
  );

  const response = await dependencies.fetcher(`${FEISHU_API_ROOT}/drive/v1/medias/upload_all`, {
    body,
    headers: { authorization: `Bearer ${accessToken}` },
    method: "POST",
  });
  const parsedResponse = feishuApiResponseSchema.safeParse(await response.json());
  if (!parsedResponse.success) {
    throw new Error("Feishu API returned an invalid JSON response");
  }
  const result = parsedResponse.data;
  if (!response.ok || result.code !== 0) {
    throw new Error(
      `Feishu API request failed: ${result.code || response.status} ${result.msg ?? ""}`,
    );
  }
  const parsedData = uploadMediaResponseSchema.safeParse(result.data);
  if (!parsedData.success) {
    throw new Error("Feishu media upload response had an invalid success payload");
  }
  const fileToken = parsedData.data.file_token;
  if (!fileToken) {
    throw new Error("Feishu media upload response did not include file_token");
  }
  return fileToken;
}

async function replaceFeishuDocxFile(
  documentId: string,
  blockId: string,
  fileToken: string,
  accessToken: string,
  dependencies: FeishuDocxDependencies,
): Promise<void> {
  await requestFeishu(
    `/docx/v1/documents/${encodeURIComponent(documentId)}/blocks/${encodeURIComponent(blockId)}`,
    accessToken,
    { replace_file: { token: fileToken } },
    emptyFeishuResponseSchema,
    dependencies,
    "PATCH",
  );
}

export async function grantFeishuDocxAccess(
  options: GrantFeishuDocxAccessOptions,
  dependencies: FeishuDocxDependencies = defaultDependencies,
): Promise<void> {
  await requestFeishu(
    `/drive/v1/permissions/${encodeURIComponent(options.documentId)}/members?type=docx`,
    options.accessToken,
    {
      member_id: options.recipientOpenId,
      member_type: "openid",
      perm: "edit",
      type: "user",
    },
    emptyFeishuResponseSchema,
    dependencies,
  );
}

export async function moveFeishuDocx(
  options: MoveFeishuDocxOptions,
  dependencies: FeishuDocxDependencies = defaultDependencies,
): Promise<void> {
  await requestFeishu(
    `/drive/v1/files/${encodeURIComponent(options.documentId)}/move`,
    options.accessToken,
    {
      folder_token: options.folderToken,
      type: "docx",
    },
    emptyFeishuResponseSchema,
    dependencies,
  );
}

export async function createFeishuDocx(
  options: CreateFeishuDocxOptions,
  dependencies: FeishuDocxDependencies = defaultDependencies,
): Promise<{ documentId: string; documentUrl: string }> {
  const created = await requestFeishu(
    "/docx/v1/documents",
    options.accessToken,
    { title: options.title },
    createDocumentResponseSchema,
    dependencies,
  );
  const documentId = created.document?.document_id;
  if (!documentId) {
    throw new Error("Feishu create document response did not include document_id");
  }
  await dependencies.sleep(EDIT_THROTTLE_MS);

  const documentBlocks = options.attachment
    ? [
        { block_type: 23, file: { token: "", view_type: 2 } } satisfies FeishuDocumentBlock,
        ...options.blocks,
      ]
    : options.blocks;

  const topLevelBlocks = await appendBlocks(
    documentId,
    documentId,
    documentBlocks,
    options.accessToken,
    dependencies,
  );

  if (options.attachment) {
    const attachmentBlockId = topLevelBlocks[0]?.children?.[0];
    if (!attachmentBlockId) {
      throw new Error("Feishu did not return block_id for the resume attachment block");
    }
    const fileToken = await uploadFeishuDocxAttachment(
      documentId,
      attachmentBlockId,
      options.attachment,
      options.accessToken,
      dependencies,
    );
    await dependencies.sleep(EDIT_THROTTLE_MS);
    await replaceFeishuDocxFile(
      documentId,
      attachmentBlockId,
      fileToken,
      options.accessToken,
      dependencies,
    );
    await dependencies.sleep(EDIT_THROTTLE_MS);
  }

  await populateNestedBlocks(
    documentId,
    documentBlocks,
    topLevelBlocks,
    options.accessToken,
    dependencies,
  );

  await grantFeishuDocxAccess(
    {
      accessToken: options.accessToken,
      documentId,
      recipientOpenId: options.recipientOpenId,
    },
    dependencies,
  ).catch(() => {
    // A removed or inaccessible recipient must not block document delivery.
  });

  if (options.folderToken) {
    await moveFeishuDocx(
      {
        accessToken: options.accessToken,
        documentId,
        folderToken: options.folderToken,
      },
      dependencies,
    );
  }

  return {
    documentId,
    documentUrl: `https://feishu.cn/docx/${documentId}`,
  };
}

const documentStructureUpdateTails = new Map<string, Promise<unknown>>();

async function serializeDocumentStructureUpdate<T>(
  documentId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = documentStructureUpdateTails.get(documentId) ?? Promise.resolve();
  const { promise: current, resolve: releaseCurrent } = Promise.withResolvers<boolean>();
  documentStructureUpdateTails.set(documentId, current);
  await previous;
  try {
    return await operation();
  } finally {
    releaseCurrent(true);
    if (documentStructureUpdateTails.get(documentId) === current) {
      documentStructureUpdateTails.delete(documentId);
    }
  }
}

interface RecommendedQuestionsPlacementPlan {
  currentIndex: number;
  insertIndex: number;
  shouldInsert: boolean;
  shouldRelocate: boolean;
}

function isHrEvaluationTitle(title: string): boolean {
  const normalized = title
    .normalize("NFKC")
    .trim()
    .replace(/^(?:\p{Extended_Pictographic}\uFE0F?\s*)+/u, "");
  return /^HR面试评价(?:$|[(:])/u.test(normalized);
}

function planRecommendedQuestionsPlacement(
  titles: string[],
  hasDesiredBlock: boolean,
): RecommendedQuestionsPlacementPlan {
  const currentIndex = titles.indexOf("推荐面试题");
  const hrIndex = titles.findIndex(isHrEvaluationTitle);
  const ratingIndex = titles.indexOf("评级等级确定");
  const hasExistingBlock = currentIndex !== -1;
  const isCorrectlyPlaced =
    hasExistingBlock &&
    hrIndex !== -1 &&
    currentIndex > hrIndex &&
    (ratingIndex === -1 || currentIndex < ratingIndex);
  const shouldInsert = hasDesiredBlock && !hasExistingBlock;
  const shouldRelocate = hasDesiredBlock && hasExistingBlock && !isCorrectlyPlaced;
  const hrIndexAfterRemoval = hrIndex - (shouldRelocate && currentIndex < hrIndex ? 1 : 0);
  const ratingIndexAfterRemoval =
    ratingIndex - (shouldRelocate && currentIndex < ratingIndex ? 1 : 0);

  if ((shouldInsert || shouldRelocate) && hrIndexAfterRemoval === -1) {
    throw new Error("飞书文档缺少“HR面试评价”板块，无法插入推荐面试题");
  }
  if (
    (shouldInsert || shouldRelocate) &&
    ratingIndexAfterRemoval !== -1 &&
    ratingIndexAfterRemoval < hrIndexAfterRemoval
  ) {
    throw new Error("飞书文档的“评级等级确定”板块位于“HR面试评价”之前，无法安全插入推荐面试题");
  }

  return {
    currentIndex,
    insertIndex: ratingIndexAfterRemoval === -1 ? hrIndexAfterRemoval + 1 : ratingIndexAfterRemoval,
    shouldInsert,
    shouldRelocate,
  };
}

// oxlint-disable-next-line complexity -- one maintenance command validates all anchors before coordinating two insert-or-sync section plans.
async function updateFeishuDocxInterviewEvaluationStructureUnlocked(
  options: UpdateInterviewEvaluationStructureOptions,
  dependencies: FeishuDocxDependencies,
): Promise<{
  insertedSections: InterviewEvaluationStructureSection[];
  updatedSections: InterviewEvaluationStructureSection[];
}> {
  const blocks = await listDocumentBlocks(options.documentId, options.accessToken, dependencies);
  const blocksById = new Map(blocks.map((block) => [block.block_id, block]));
  const root = blocksById.get(options.documentId);
  if (!root) {
    throw new Error("飞书文档缺少根节点，无法更新结构");
  }
  const topLevelBlocks = (root.children ?? []).map((blockId) => blocksById.get(blockId));
  const titles = topLevelBlocks.map((block) => topLevelBlockTitle(block, blocksById));
  const resumeEvaluationIndex = titles.findIndex(
    (title) => title === "简历AI简历评价" || title === "简历评价",
  );
  const hasResumeEvaluation = resumeEvaluationIndex !== -1;
  const recommendedQuestionsPlacement = planRecommendedQuestionsPlacement(
    titles,
    Boolean(options.recommendedQuestionsBlock),
  );
  const existingResumeEvaluation = hasResumeEvaluation
    ? topLevelBlocks[resumeEvaluationIndex]
    : undefined;
  const existingRecommendedQuestions = topLevelBlocks[recommendedQuestionsPlacement.currentIndex];
  const shouldInsertResumeEvaluation = Boolean(
    options.resumeEvaluationBlock && !hasResumeEvaluation,
  );
  const shouldUpdateResumeEvaluation = Boolean(
    options.resumeEvaluationBlock &&
    existingResumeEvaluation &&
    !calloutMatches(existingResumeEvaluation, options.resumeEvaluationBlock, blocksById),
  );
  const shouldUpdateRecommendedQuestions = Boolean(
    options.recommendedQuestionsBlock &&
    existingRecommendedQuestions &&
    !calloutMatches(existingRecommendedQuestions, options.recommendedQuestionsBlock, blocksById),
  );

  const hrEvaluationIndex = shouldInsertResumeEvaluation
    ? titles.findIndex(isHrEvaluationTitle)
    : -1;
  if (shouldInsertResumeEvaluation && hrEvaluationIndex === -1) {
    throw new Error("飞书文档缺少“HR面试评价”板块，无法插入简历评价");
  }

  if (
    shouldUpdateRecommendedQuestions &&
    !recommendedQuestionsPlacement.shouldRelocate &&
    options.recommendedQuestionsBlock &&
    existingRecommendedQuestions
  ) {
    await syncCalloutContent(
      {
        accessToken: options.accessToken,
        blocksById,
        desiredCallout: options.recommendedQuestionsBlock,
        documentId: options.documentId,
        existingCallout: existingRecommendedQuestions,
        section: "recommendedQuestions",
      },
      dependencies,
    );
  }

  if (
    recommendedQuestionsPlacement.shouldRelocate &&
    options.recommendedQuestionsBlock &&
    existingRecommendedQuestions
  ) {
    await deleteBlockChildren(
      options.documentId,
      options.documentId,
      recommendedQuestionsPlacement.currentIndex,
      recommendedQuestionsPlacement.currentIndex + 1,
      options.accessToken,
      dependencies,
      `interview-evaluation:${options.documentId}:recommendedQuestions:${existingRecommendedQuestions.block_id}:relocate-delete`,
    );
    await insertTopLevelBlock(
      {
        accessToken: options.accessToken,
        block: options.recommendedQuestionsBlock,
        documentId: options.documentId,
        idempotencyKey: "recommendedQuestions:after-hr:v1",
        index: recommendedQuestionsPlacement.insertIndex,
      },
      dependencies,
    );
  }

  if (shouldUpdateResumeEvaluation && options.resumeEvaluationBlock && existingResumeEvaluation) {
    await syncCalloutContent(
      {
        accessToken: options.accessToken,
        blocksById,
        desiredCallout: options.resumeEvaluationBlock,
        documentId: options.documentId,
        existingCallout: existingResumeEvaluation,
        section: "resumeEvaluation",
      },
      dependencies,
    );
  }

  if (recommendedQuestionsPlacement.shouldInsert && options.recommendedQuestionsBlock) {
    await insertTopLevelBlock(
      {
        accessToken: options.accessToken,
        block: options.recommendedQuestionsBlock,
        documentId: options.documentId,
        idempotencyKey: "recommendedQuestions:after-hr:v1",
        index: recommendedQuestionsPlacement.insertIndex,
      },
      dependencies,
    );
  }

  if (shouldInsertResumeEvaluation && options.resumeEvaluationBlock) {
    const resumeEvaluationInsertIndex =
      hrEvaluationIndex -
      (recommendedQuestionsPlacement.shouldRelocate &&
      recommendedQuestionsPlacement.currentIndex < hrEvaluationIndex
        ? 1
        : 0);
    await insertTopLevelBlock(
      {
        accessToken: options.accessToken,
        block: options.resumeEvaluationBlock,
        documentId: options.documentId,
        idempotencyKey: "resumeEvaluation",
        index: resumeEvaluationInsertIndex,
      },
      dependencies,
    );
  }

  return {
    insertedSections: [
      ...(shouldInsertResumeEvaluation ? (["resumeEvaluation"] as const) : []),
      ...(recommendedQuestionsPlacement.shouldInsert ? (["recommendedQuestions"] as const) : []),
    ],
    updatedSections: [
      ...(shouldUpdateResumeEvaluation ? (["resumeEvaluation"] as const) : []),
      ...(shouldUpdateRecommendedQuestions || recommendedQuestionsPlacement.shouldRelocate
        ? (["recommendedQuestions"] as const)
        : []),
    ],
  };
}

export async function updateFeishuDocxInterviewEvaluationStructure(
  options: UpdateInterviewEvaluationStructureOptions,
  dependencies: FeishuDocxDependencies = defaultDependencies,
): Promise<{
  insertedSections: InterviewEvaluationStructureSection[];
  updatedSections: InterviewEvaluationStructureSection[];
}> {
  return await serializeDocumentStructureUpdate(options.documentId, () =>
    updateFeishuDocxInterviewEvaluationStructureUnlocked(options, dependencies),
  );
}

export async function createFeishuInterviewEvaluationDocx(
  providerId: FeishuProviderId,
  options: Omit<CreateFeishuDocxOptions, "accessToken">,
): Promise<{ documentId: string; documentUrl: string }> {
  const { appId, appSecret } = getFeishuAppCredentials(providerId);
  const accessToken = await getFeishuTenantAccessToken(appId, appSecret);
  const folderToken = getFeishuEvaluationFolderToken(providerId);
  return await createFeishuDocx({ ...options, accessToken, folderToken });
}

export async function moveFeishuInterviewEvaluationDocx(
  providerId: FeishuProviderId,
  documentId: string,
): Promise<void> {
  const folderToken = getFeishuEvaluationFolderToken(providerId);
  if (!folderToken) {
    return;
  }

  const { appId, appSecret } = getFeishuAppCredentials(providerId);
  const accessToken = await getFeishuTenantAccessToken(appId, appSecret);
  await moveFeishuDocx({ accessToken, documentId, folderToken });
}

export async function updateFeishuInterviewEvaluationDocxStructure(
  providerId: FeishuProviderId,
  options: Omit<UpdateInterviewEvaluationStructureOptions, "accessToken">,
): Promise<{
  insertedSections: InterviewEvaluationStructureSection[];
  updatedSections: InterviewEvaluationStructureSection[];
}> {
  const { appId, appSecret } = getFeishuAppCredentials(providerId);
  const accessToken = await getFeishuTenantAccessToken(appId, appSecret);
  return await updateFeishuDocxInterviewEvaluationStructure({
    ...options,
    accessToken,
  });
}

export async function grantFeishuInterviewEvaluationDocxAccess(
  providerId: FeishuProviderId,
  options: Omit<GrantFeishuDocxAccessOptions, "accessToken">,
): Promise<void> {
  const { appId, appSecret } = getFeishuAppCredentials(providerId);
  const accessToken = await getFeishuTenantAccessToken(appId, appSecret);
  await grantFeishuDocxAccess({ ...options, accessToken });
}
