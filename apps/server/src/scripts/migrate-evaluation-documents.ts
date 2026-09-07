import { readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}
const client = postgres(databaseUrl, {
  max: 1,
  onnotice: () => {
    /* DDL replay notices are expected. */
  },
});
const apply = process.argv.includes("--apply");
try {
  const counts =
    await client`select type, status, count(*)::int as count from recruiting_notification_delivery where type in ('summary_ready', 'ai_report_ready') group by type,status order by type,status`;
  console.log(JSON.stringify({ deliveries: counts, mode: apply ? "apply" : "read-only" }));
  if (apply) {
    const dataSql = await readFile(
      new URL("recruiting-evaluation-document/canonicalize-notifications.sql", import.meta.url),
      "utf-8",
    );
    await client.begin(async (tx) => {
      // Only run after old producers/consumers and schedulers have stopped.
      await tx`LOCK TABLE recruiting_notification_delivery IN SHARE ROW EXCLUSIVE MODE`;
      const [ready] =
        await tx`select to_regclass('public.recruiting_evaluation_document') is not null as ready`;
      if (!ready?.ready) {
        throw new Error("Apply the additive record-evaluation-document schema migration first");
      }
      await tx.unsafe(dataSql);
      const [check] =
        await tx`select count(*)::int as mismatches from recruiting_maintenance.evaluation_document_notification_backup b join recruiting_notification_delivery d on d.id=b.delivery_id where (to_jsonb(d) - 'type') is distinct from (b.original_row - 'type') or d.type <> 'ai_report_ready'`;
      if (check?.mismatches) {
        throw new Error("Migration changed data other than notification type; rolling back");
      }
      const remaining =
        await tx`select count(*)::int as remaining from recruiting_notification_delivery where type='summary_ready'`;
      console.log(JSON.stringify({ preservedFields: true, remaining }));
    });
  }
} finally {
  await client.end();
}
