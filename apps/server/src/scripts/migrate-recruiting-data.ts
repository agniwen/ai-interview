import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import { z } from "zod";
import { recruitingNodeValues } from "@app/db-schema";
import { runMigration } from "./recruiting-migration/runner";
import type { MigrationReport } from "./recruiting-migration/runner";
import type { MigrationMapping, Row } from "./recruiting-migration/model";

interface MigrationClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(text: string, values?: string[]): Promise<{ rows: Row[] }>;
}
interface MigrationPgModule {
  Client: new (options: {
    connectionString: string;
    connectionTimeoutMillis: number;
  }) => MigrationClient;
}

async function main() {
  const { values } = parseArgs({
    options: {
      apply: { default: false, type: "boolean" },
      database: { type: "string" },
      "infer-legacy-nodes": { default: false, type: "boolean" },
      mapping: { type: "string" },
      report: { type: "string" },
      "rollback-test": { default: false, type: "boolean" },
      "source-cache": { type: "string" },
    },
  });
  if (!values.database || !values.report) {
    throw new Error(
      "Required: --database ainterview-dev --report <private-report-path> [--apply] [--infer-legacy-nodes]",
    );
  }
  // 运维入口允许动态读取 Web 的 Drizzle 配置，保持本次明确指定的开发库目标。
  // 运行时代码不依赖 Web；动态 URL 避免把其他应用的源码纳入 Server 编译范围。
  const configUrl = new URL("../../../web/drizzle.config.ts", import.meta.url);
  const { default: config } = z
    .object({ default: z.object({ dbCredentials: z.object({ url: z.string().url() }) }) })
    .parse(await import(configUrl.href));
  const parsed = new URL(config.dbCredentials.url);
  if (decodeURIComponent(parsed.pathname.slice(1)) !== values.database) {
    throw new Error("Configured database name does not match --database");
  }
  const mappingSchema = z.object({
    humanRoundKinds: z
      .record(z.string(), z.enum(["second_interview", "final_interview"]))
      .optional(),
    inferLegacyNodes: z.boolean().optional(),
    recordNodes: z.record(z.string(), z.enum(recruitingNodeValues)).optional(),
  });
  const mapping: MigrationMapping = mappingSchema.parse(
    values.mapping ? JSON.parse(await readFile(resolve(values.mapping), "utf-8")) : {},
  );
  const databaseName = values.database;
  if (values["infer-legacy-nodes"]) {
    mapping.inferLegacyNodes = true;
  }
  // 使用 Web 维护环境已声明的 pg 驱动；大字段在库内复制，避免跨网络重新序列化整个产物。
  // SAFETY: 从项目 apps/web/package.json 的已安装依赖解析 pg，使用其稳定 Client API。
  const pg = createRequire(new URL("../../../web/package.json", import.meta.url))(
    "pg",
  ) as MigrationPgModule;
  const client = new pg.Client({
    connectionString: config.dbCredentials.url,
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    await client.query(values.apply ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    let report: MigrationReport;
    try {
      report = await runMigration(
        async (text, params = []) => {
          try {
            const result = await client.query(text, params);
            return result.rows;
          } catch (error) {
            throw new Error(
              `Migration SQL ${text.slice(0, 120)}: ${error instanceof Error ? error.message : "query failed"}`,
              { cause: error },
            );
          }
        },
        {
          apply: values.apply,
          expectedDatabase: databaseName,
          mapping,
          sourceCachePath: values["source-cache"],
        },
      );
      await client.query(values["rollback-test"] ? "ROLLBACK" : "COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    await writeFile(
      resolve(values.report),
      JSON.stringify({ ...report, rolledBack: values["rollback-test"] }, null, 2),
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify(
        {
          applied: values.apply && !values["rollback-test"],
          database: values.database,
          report: resolve(values.report),
          targets: report?.targets,
          warnings: report?.warnings,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Migration failed");
    process.exitCode = 1;
  }
}
