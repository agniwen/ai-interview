import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import { z } from "zod";
import { recruitingEvaluationDocument, recruitingRecord } from "@app/db-schema/schema";
import { db } from "../../../../../../lib/server/db/index";
import { createFeishuInterviewEvaluationDocx } from "../../../../../integrations/feishu/feishu-docx";
import type { FeishuDocumentBlock } from "../../../../../integrations/feishu/interview-evaluation-doc";
import {
  FEISHU_PROVIDER_IDS,
  getFeishuAppCredentials,
} from "../../../../../integrations/feishu/provider";
import type { FeishuProviderId } from "../../../../../integrations/feishu/provider";
import { ensureRecruitingEvaluationDocument } from "./ensure-recruiting-evaluation-document";

type CreateInput = Parameters<typeof createFeishuInterviewEvaluationDocx>[1];
const initializationSchema = z.object({
  attachment: z.object({ base64: z.string(), fileName: z.string() }).optional(),
  blocks: z.array(z.custom<FeishuDocumentBlock>()),
  recipientOpenId: z.string(),
  title: z.string(),
});

const defaultDependencies = {
  createDocument: createFeishuInterviewEvaluationDocx,
  validateProvider: getFeishuAppCredentials,
};

export function ensureRecordEvaluationDocument(
  input: {
    organizationId: string;
    recruitingRecordId: string;
    providerId: FeishuProviderId;
    build(): Promise<CreateInput>;
  },
  dependencies = defaultDependencies,
) {
  const table = recruitingEvaluationDocument;
  const scope = and(
    eq(table.recruitingRecordId, input.recruitingRecordId),
    eq(table.organizationId, input.organizationId),
  );
  const read = async () => {
    const [row] = await db.select().from(table).where(scope).limit(1);
    return row;
  };
  return ensureRecruitingEvaluationDocument({
    create: async () => {
      let row = await read();
      if (row && !row.documentId) {
        // Creating a document has no provider idempotency key. Never create a second
        // one automatically after a lost response or a crash before checkpointing.
        throw new Error("飞书评价表创建结果未知，请管理员核对外部文档并恢复关联后重试");
      }
      if (!row) {
        dependencies.validateProvider(input.providerId);
        const built = await input.build();
        // Freeze the actual JSON wire representation; optional Feishu style fields
        // may contain undefined, which is omitted by the provider serializer too.
        const initialization = z.record(z.string(), z.json()).parse(
          // oxlint-disable-next-line unicorn/prefer-structured-clone -- Wire serialization intentionally removes undefined fields; structuredClone preserves them.
          JSON.parse(
            JSON.stringify({
              blocks: built.blocks,
              recipientOpenId: built.recipientOpenId,
              title: built.title,
            }),
          ),
        );
        if (built.attachment) {
          initialization.attachment = {
            base64: Buffer.from(built.attachment.bytes).toString("base64"),
            fileName: built.attachment.fileName,
          };
        }
        [row] = await db
          .insert(table)
          .values({
            initialization,
            organizationId: input.organizationId,
            providerId: input.providerId,
            recruitingRecordId: input.recruitingRecordId,
          })
          .returning();
      }
      const payload = initializationSchema.parse(row.initialization);
      const providerId = z.enum(FEISHU_PROVIDER_IDS).parse(row.providerId);
      const created = await dependencies.createDocument(providerId, {
        ...payload,
        attachment: payload.attachment
          ? {
              bytes: Buffer.from(payload.attachment.base64, "base64"),
              fileName: payload.attachment.fileName,
            }
          : undefined,
        existingDocumentId: row.documentId ?? undefined,
        initializationKey: `recruiting-evaluation:${input.recruitingRecordId}`,
        onDocumentCreated: async (documentId) => {
          await db
            .update(table)
            .set({ documentId, documentUrl: `https://feishu.cn/docx/${documentId}` })
            .where(scope);
        },
      });
      return { ...created, providerId };
    },
    load: async () => {
      const row = await read();
      if (row?.status !== "ready" || !row.documentId || !row.documentUrl) {
        return null;
      }
      return {
        documentId: row.documentId,
        documentUrl: row.documentUrl,
        providerId: z.enum(FEISHU_PROVIDER_IDS).parse(row.providerId),
      };
    },
    save: async (document) => {
      await db
        .update(table)
        .set({ ...document, initialization: null, status: "ready" })
        .where(scope);
    },
    // A dedicated session mutex holds no transaction open during Feishu calls and
    // does not exhaust the application pool when multiple callers wait on one record.
    withLock: async (run) => {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error("DATABASE_URL is required");
      }
      const lock = postgres(databaseUrl, { max: 1 });
      const key = `recruiting-evaluation:${input.organizationId}:${input.recruitingRecordId}`;
      try {
        await lock`select pg_advisory_lock(hashtextextended(${key}, 0))`;
        const [record] = await db
          .select({ id: recruitingRecord.id })
          .from(recruitingRecord)
          .where(
            and(
              eq(recruitingRecord.id, input.recruitingRecordId),
              eq(recruitingRecord.organizationId, input.organizationId),
            ),
          )
          .limit(1);
        if (!record) {
          throw new Error("招聘记录不存在或不属于当前工作区");
        }
        return await run();
      } finally {
        // Closing the dedicated session also releases the lock after any failure.
        await lock.end();
      }
    },
  });
}
