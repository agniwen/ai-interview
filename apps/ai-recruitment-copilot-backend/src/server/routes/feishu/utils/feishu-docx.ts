import { setTimeout as delay } from "node:timers/promises";
import { getFeishuTenantAccessToken } from "@arc/ai-recruitment-copilot-backend/lib/server/feishu-access-token";
import type { FeishuProviderId } from "@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/provider";
import {
  getFeishuAppCredentials,
  getFeishuEvaluationFolderToken,
} from "@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/provider";
import type { FeishuDocumentBlock } from "./interview-evaluation-doc";

const FEISHU_API_ROOT = "https://open.feishu.cn/open-apis";
const EDIT_THROTTLE_MS = 350;
const MAX_BLOCKS_PER_REQUEST = 50;
const MAX_ATTEMPTS = 3;

interface FeishuApiResponse<T> {
  code: number;
  data?: T;
  msg: string;
}

interface CreateDocumentResponse {
  document?: { document_id?: string };
}

interface CreateBlocksResponse {
  children?: { block_id?: string; children?: string[] }[];
}

interface UploadMediaResponse {
  file_token?: string;
}

interface FeishuDocxAttachment {
  bytes: Uint8Array;
  fileName: string;
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

async function requestFeishu<T>(
  path: string,
  accessToken: string,
  body: unknown,
  dependencies: FeishuDocxDependencies,
  method: "DELETE" | "PATCH" | "POST" = "POST",
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await dependencies.fetcher(`${FEISHU_API_ROOT}${path}`, {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json; charset=utf-8",
      },
      method,
    });
    const result = (await response.json()) as FeishuApiResponse<T>;
    if (response.ok && result.code === 0) {
      return result.data as T;
    }

    const error = new Error(
      `Feishu API request failed: ${result.code || response.status} ${result.msg || ""}`,
    );
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
): Promise<{ block_id?: string; children?: string[] }[]> {
  const created: { block_id?: string; children?: string[] }[] = [];
  for (const blockChunk of chunks(blocks, MAX_BLOCKS_PER_REQUEST)) {
    const response = await requestFeishu<CreateBlocksResponse>(
      `/docx/v1/documents/${encodeURIComponent(documentId)}/blocks/${encodeURIComponent(parentBlockId)}/children`,
      accessToken,
      { children: blockChunk.map(withoutChildren) },
      dependencies,
    );
    created.push(...(response.children ?? []));
    await dependencies.sleep(EDIT_THROTTLE_MS);
  }
  return created;
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
    dependencies,
    "PATCH",
  );
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
  const result = (await response.json()) as FeishuApiResponse<UploadMediaResponse>;
  if (!response.ok || result.code !== 0) {
    throw new Error(
      `Feishu API request failed: ${result.code || response.status} ${result.msg || ""}`,
    );
  }
  const fileToken = result.data?.file_token;
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
    dependencies,
  );
}

export async function createFeishuDocx(
  options: CreateFeishuDocxOptions,
  dependencies: FeishuDocxDependencies = defaultDependencies,
): Promise<{ documentId: string; documentUrl: string }> {
  const created = await requestFeishu<CreateDocumentResponse>(
    "/docx/v1/documents",
    options.accessToken,
    { title: options.title },
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
      await updateCalloutTitle(
        documentId,
        generatedTitleBlockId,
        block.children[0],
        options.accessToken,
        dependencies,
      );
      await dependencies.sleep(EDIT_THROTTLE_MS);
      await appendBlocks(
        documentId,
        parentBlockId,
        block.children.slice(1),
        options.accessToken,
        dependencies,
      );
      continue;
    }
    await appendBlocks(
      documentId,
      parentBlockId,
      block.children,
      options.accessToken,
      dependencies,
    );
  }

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

export async function grantFeishuInterviewEvaluationDocxAccess(
  providerId: FeishuProviderId,
  options: Omit<GrantFeishuDocxAccessOptions, "accessToken">,
): Promise<void> {
  const { appId, appSecret } = getFeishuAppCredentials(providerId);
  const accessToken = await getFeishuTenantAccessToken(appId, appSecret);
  await grantFeishuDocxAccess({ ...options, accessToken });
}
