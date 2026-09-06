import { pathToFileURL } from "node:url";
import { asc, eq } from "drizzle-orm";
import { jobDescription, recruitingSearchIndex } from "@app/db-schema/schema";
import type { JsonValue } from "@app/db-schema/json";
import { loadStandaloneEnv } from "../standalone/env";
import { runJdSemanticBackfillRecords } from "./backfill-jd-semantic-index";

const CONFIRMATION_VALUE = "1";
const DEFAULT_CONCURRENCY = 6;

function loadScriptEnv(): void {
  loadStandaloneEnv();
}

function log(event: string, fields: Record<string, JsonValue | undefined> = {}): void {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...fields }));
}

export async function rebuildJdSemanticIndex(): Promise<void> {
  if (process.env.REBUILD_JD_SEMANTIC_INDEX_CONFIRM !== CONFIRMATION_VALUE) {
    throw new Error("Set REBUILD_JD_SEMANTIC_INDEX_CONFIRM=1 to rebuild all JD semantic vectors.");
  }
  loadScriptEnv();
  const [
    { QdrantClient },
    { closeDatabase, db },
    { getResumeSemanticIndexConfig },
    { prepareJdSemanticIndexJob, runJdSemanticIndexJob },
  ] = await Promise.all([
    import("@qdrant/js-client-rest"),
    import("../lib/server/db/index"),
    import("../lib/server/resume-semantic/indexer"),
    import("../lib/server/jd-semantic/indexer"),
  ]);
  const config = getResumeSemanticIndexConfig();
  if (!config.qdrantUrl) {
    throw new Error("QDRANT_URL is not configured.");
  }
  const client = new QdrantClient({
    apiKey: config.qdrantApiKey ?? undefined,
    checkCompatibility: false,
    url: config.qdrantUrl,
  });

  try {
    const records = await db
      .select({ organizationId: jobDescription.organizationId, sourceId: jobDescription.id })
      .from(jobDescription)
      .where(eq(jobDescription.lifecycleStatus, "published"))
      .orderBy(asc(jobDescription.createdAt));

    log("rebuild_started", { publishedJobCount: records.length });
    await client.delete(config.qdrantCollectionName, {
      filter: {
        must: [{ key: "sourceType", match: { value: "job_description" } }],
      },
      wait: true,
    });
    await db
      .delete(recruitingSearchIndex)
      .where(eq(recruitingSearchIndex.sourceType, "job_description"));

    const summary = await runJdSemanticBackfillRecords({
      concurrency: DEFAULT_CONCURRENCY,
      indexRecord: async (record) => {
        await prepareJdSemanticIndexJob(record);
        await runJdSemanticIndexJob(record);
      },
      log: (entry) => log(entry.event, entry),
      records: records.map((record) => ({ ...record, sourceType: "job_description" as const })),
    });
    log("rebuild_finished", { ...summary });
    if (summary.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await closeDatabase();
  }
}

async function runRebuildJdSemanticIndexCli(): Promise<void> {
  try {
    await rebuildJdSemanticIndex();
  } catch (error) {
    log("rebuild_crashed", { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await runRebuildJdSemanticIndexCli();
}
