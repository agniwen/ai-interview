import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { createRecruitingRecords } from "@app/database/recruiting-records";
import { organization, recruitingNotificationDelivery } from "@app/db-schema/schema";
import { db } from "../../lib/server/db/index";

const org = `document-migration-${crypto.randomUUID()}`;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}
const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
beforeAll(async () => {
  await db
    .insert(organization)
    .values({ createdAt: new Date(), id: org, name: "migration test", slug: org });
  await createRecruitingRecords(db, {
    candidateName: "迁移测试",
    id: org,
    interviewQuestions: [],
    organizationId: org,
  });
});
afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, org));
  await client.end();
});

it("canonicalizes legacy deliveries without changing status, identity, timestamps or links, and replays safely", async () => {
  await db.insert(recruitingNotificationDelivery).values(
    ["sent", "failed"].map((status) => ({
      error: status === "failed" ? "historical error" : null,
      feishuDocumentId: "retained",
      feishuDocumentUrl: "https://feishu.cn/docx/retained",
      feishuMessageId: "retained-message",
      id: `${org}-${status}`,
      organizationId: org,
      providerId: "feishu",
      recipientOpenId: "test",
      recruitingRecordId: org,
      status: status === "sent" ? ("sent" as const) : ("failed" as const),
      type: "summary_ready" as const,
    })),
  );
  const before =
    await client`select * from recruiting_notification_delivery where organization_id=${org} order by id`;
  const sql = await readFile(new URL("canonicalize-notifications.sql", import.meta.url), "utf-8");
  await client.begin((tx) => tx.unsafe(sql));
  const once =
    await client`select * from recruiting_notification_delivery where organization_id=${org} order by id`;
  expect([...once]).toEqual(before.map((row) => ({ ...row, type: "ai_report_ready" })));
  await client.begin((tx) => tx.unsafe(sql));
  const twice =
    await client`select * from recruiting_notification_delivery where organization_id=${org} order by id`;
  expect([...twice]).toEqual([...once]);
  const schemaSql = await readFile(
    new URL(
      "../../../../web/drizzle/20260907160000_record_evaluation_document/migration.sql",
      import.meta.url,
    ),
    "utf-8",
  );
  await client.begin((tx) => tx.unsafe(schemaSql));
  const [linked] =
    await client`select document_id, document_url from recruiting_evaluation_document where recruiting_record_id=${org}`;
  expect(linked).toEqual({
    document_id: "retained",
    document_url: "https://feishu.cn/docx/retained",
  });
  const [index] =
    await client`select indexdef from pg_indexes where schemaname='public' and indexname='recruiting_notification_delivery_once_uq'`;
  expect(index?.indexdef).toContain("WHERE (event_id IS NULL)");
});
