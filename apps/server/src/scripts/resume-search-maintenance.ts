import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { loadStandaloneEnv } from "../standalone/env";

const TABLES = ["resume_pool_item", "studio_interview"] as const;
type SearchTable = (typeof TABLES)[number];
type Client = ReturnType<typeof postgres>;

export async function backfillResumeSearchBatch(
  client: Client,
  table: SearchTable,
  afterId: string | null,
  batchSize: number,
) {
  // Identifiers come only from TABLES. Row locks + the trigger calculate from current
  // values, never a JSON snapshot read by this process. Business timestamps stay intact.
  const [result] = await client.unsafe<{ count: number; last_id: string | null }[]>(
    `WITH batch AS (
       SELECT id FROM "${table}"
       WHERE ($1::text IS NULL OR id > $1)
         AND (search_text IS NULL OR search_cjk_bigrams IS NULL)
       ORDER BY id LIMIT $2 FOR UPDATE
     ), updated AS (
       UPDATE "${table}" SET search_text = NULL
       WHERE id IN (SELECT id FROM batch) RETURNING id
     ) SELECT count(*)::int AS count, max(id) AS last_id FROM updated`,
    [afterId, batchSize],
  );
  return result;
}

export async function checkResumeSearch(client: Client, table: SearchTable) {
  const [counts] = await client.unsafe<{ total: number; pending: number }[]>(
    `SELECT count(*)::int AS total,
       count(*) FILTER (WHERE search_text IS NULL OR search_cjk_bigrams IS NULL)::int AS pending
     FROM "${table}"`,
  );
  const indexes = await client<
    { name: string; valid: boolean; method: string; column: string; opclass: string }[]
  >`
    SELECT idx.relname AS name, i.indisvalid AS valid, am.amname AS method,
      a.attname AS column, op.opcname AS opclass
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_am am ON am.oid = idx.relam
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
    JOIN pg_opclass op ON op.oid = i.indclass[0]
    WHERE t.relname = ${table} AND n.nspname = current_schema()
      AND i.indnatts = 1 AND i.indpred IS NULL
  `;
  const textReady = indexes.some(
    (index) =>
      index.name === `${table}_search_text_trgm_idx` &&
      index.valid &&
      index.method === "gin" &&
      index.column === "search_text" &&
      index.opclass === "gin_trgm_ops",
  );
  const bigramsReady = indexes.some(
    (index) =>
      index.name === `${table}_search_cjk_bigrams_idx` &&
      index.valid &&
      index.method === "gin" &&
      index.column === "search_cjk_bigrams" &&
      index.opclass === "array_ops",
  );
  return { ...counts, indexesReady: textReady && bigramsReady };
}

function parseOptions() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "after-id": { type: "string" },
      apply: { default: false, type: "boolean" },
      "batch-size": { default: "500", type: "string" },
      table: { default: "all", type: "string" },
    },
  });
  const [command] = positionals;
  if (positionals.length !== 1 || !["backfill", "indexes", "check"].includes(command ?? "")) {
    throw new Error(
      "Usage: resume-search-maintenance.ts backfill|indexes|check [--apply] [--table=all|resume_pool_item|studio_interview] [--batch-size=500] [--after-id=ID]",
    );
  }
  if (values.table !== "all" && !TABLES.some((table) => table === values.table)) {
    throw new Error("Unknown table");
  }
  if (values["after-id"] && values.table === "all") {
    throw new Error("--after-id requires one explicit --table");
  }
  const batchSize = Number(values["batch-size"]);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000) {
    throw new Error("--batch-size must be an integer between 1 and 5000");
  }
  return { batchSize, command, values };
}

async function main() {
  const { batchSize, command, values } = parseOptions();
  loadStandaloneEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  const client = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    for (const table of TABLES.filter((item) => values.table === "all" || item === values.table)) {
      console.log({
        apply: values.apply,
        command,
        table,
        ...(await checkResumeSearch(client, table)),
      });
      if (command === "backfill" && values.apply) {
        let cursor = values["after-id"] ?? null;
        while (true) {
          const batch = await backfillResumeSearchBatch(client, table, cursor, batchSize);
          console.log({ table, ...batch });
          if (batch.count === 0) {
            break;
          }
          cursor = batch.last_id;
        }
      }
      if (command === "indexes" && values.apply) {
        const beforeIndexes = await checkResumeSearch(client, table);
        if (beforeIndexes.pending !== 0) {
          throw new Error(`${table}: finish backfill before creating indexes`);
        }
        await client`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
        // Deliberately outside a transaction: ordinary migrations may be transactional.
        await client.unsafe(
          `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${table}_search_text_trgm_idx" ON "${table}" USING gin (search_text gin_trgm_ops)`,
        );
        await client.unsafe(
          `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${table}_search_cjk_bigrams_idx" ON "${table}" USING gin (search_cjk_bigrams)`,
        );
        await client.unsafe(`ANALYZE "${table}"`);
      }
      if (command === "check" || (command === "indexes" && values.apply)) {
        const result = await checkResumeSearch(client, table);
        if (result.pending !== 0 || !result.indexesReady) {
          throw new Error(
            `${table}: not ready (${JSON.stringify(result)}). Inspect invalid/mismatched indexes before retrying; nothing is dropped automatically.`,
          );
        }
      }
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
