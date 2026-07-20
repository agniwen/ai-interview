import { setTimeout as delay } from "node:timers/promises";
import { getFeishuTenantAccessToken } from "@arc/ai-recruitment-copilot-backend/lib/server/feishu-access-token";
import type { FeishuProviderId } from "@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/provider";
import { getFeishuAppCredentials } from "@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/provider";
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
  children?: { block_id?: string }[];
}

interface CreateFeishuDocxOptions {
  accessToken: string;
  blocks: FeishuDocumentBlock[];
  recipientOpenId: string;
  title: string;
}

interface GrantFeishuDocxAccessOptions {
  accessToken: string;
  documentId: string;
  recipientOpenId: string;
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

async function postFeishu<T>(
  path: string,
  accessToken: string,
  body: unknown,
  dependencies: FeishuDocxDependencies,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await dependencies.fetcher(`${FEISHU_API_ROOT}${path}`, {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json; charset=utf-8",
      },
      method: "POST",
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
): Promise<{ block_id?: string }[]> {
  const created: { block_id?: string }[] = [];
  for (const blockChunk of chunks(blocks, MAX_BLOCKS_PER_REQUEST)) {
    const response = await postFeishu<CreateBlocksResponse>(
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

export async function grantFeishuDocxAccess(
  options: GrantFeishuDocxAccessOptions,
  dependencies: FeishuDocxDependencies = defaultDependencies,
): Promise<void> {
  await postFeishu(
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

export async function createFeishuDocx(
  options: CreateFeishuDocxOptions,
  dependencies: FeishuDocxDependencies = defaultDependencies,
): Promise<{ documentId: string; documentUrl: string }> {
  const created = await postFeishu<CreateDocumentResponse>(
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

  const topLevelBlocks = await appendBlocks(
    documentId,
    documentId,
    options.blocks,
    options.accessToken,
    dependencies,
  );

  for (const [index, block] of options.blocks.entries()) {
    if (!block.children || block.children.length === 0) {
      continue;
    }
    const parentBlockId = topLevelBlocks[index]?.block_id;
    if (!parentBlockId) {
      throw new Error(`Feishu did not return block_id for top-level block ${index}`);
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
  );

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
  return await createFeishuDocx({ ...options, accessToken });
}

export async function grantFeishuInterviewEvaluationDocxAccess(
  providerId: FeishuProviderId,
  options: Omit<GrantFeishuDocxAccessOptions, "accessToken">,
): Promise<void> {
  const { appId, appSecret } = getFeishuAppCredentials(providerId);
  const accessToken = await getFeishuTenantAccessToken(appId, appSecret);
  await grantFeishuDocxAccess({ ...options, accessToken });
}
