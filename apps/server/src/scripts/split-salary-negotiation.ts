import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import type { JsonValue } from "@app/db-schema/json";

interface Client {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, JsonValue>[] }>;
}
const migrationName = "20260908144432_split_salary_negotiation";
const { values } = parseArgs({
  options: {
    apply: { default: false, type: "boolean" },
    backup: { type: "string" },
    database: { type: "string" },
    "rollback-test": { default: false, type: "boolean" },
  },
});
if (values.apply && values["rollback-test"]) {
  throw new Error("Choose either --apply or --rollback-test");
}
if (!values.database || !values.backup) {
  throw new Error(
    "Required: --database <database> --backup <private-json-path> [--apply | --rollback-test]",
  );
}
const configUrl = new URL("../../../web/drizzle.config.ts", import.meta.url);
const { default: config } = z
  .object({ default: z.object({ dbCredentials: z.object({ url: z.string().url() }) }) })
  .parse(await import(configUrl.href));
if (decodeURIComponent(new URL(config.dbCredentials.url).pathname.slice(1)) !== values.database) {
  throw new Error("Configured database does not match --database");
}
// SAFETY: Resolve the project's declared PostgreSQL driver with its stable Client API.
const pg = createRequire(new URL("../../../web/package.json", import.meta.url))("pg") as {
  Client: new (options: { connectionString: string; connectionTimeoutMillis: number }) => Client;
};
const client = new pg.Client({
  connectionString: config.dbCredentials.url,
  connectionTimeoutMillis: 10_000,
});
const migration = await readFile(
  new URL(`../../../web/drizzle/${migrationName}/migration.sql`, import.meta.url),
  "utf-8",
);
const hash = createHash("sha256").update(migration).digest("hex");
await client.connect();
try {
  const applied = await client.query(
    "SELECT hash FROM drizzle.__drizzle_migrations WHERE name=$1",
    [migrationName],
  );
  if (applied.rows.length) {
    if (applied.rows[0]?.hash !== hash) {
      throw new Error("Applied migration hash differs");
    }
    console.log("Migration already applied with matching hash.");
  } else {
    await client.query(
      values.apply || values["rollback-test"]
        ? "BEGIN"
        : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    try {
      if (values.apply || values["rollback-test"]) {
        await client.query("SET LOCAL lock_timeout='10s'");
        await client.query(
          "LOCK TABLE recruiting_record, recruiting_node_state, recruiting_offer, recruiting_fulfillment, recruiting_material, recruiting_event IN SHARE ROW EXCLUSIVE MODE",
        );
      }
      const constraints = await client.query(
        "SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN ('recruiting_record'::regclass, 'recruiting_node_state'::regclass) ORDER BY conrelid, conname",
      );
      const backup = await client.query(
        "SELECT (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM recruiting_record r) AS records, (SELECT jsonb_agg(to_jsonb(n) ORDER BY recruiting_record_id,node) FROM recruiting_node_state n) AS nodes",
      );
      await writeFile(
        values.backup,
        JSON.stringify({
          constraints: constraints.rows,
          createdAt: new Date().toISOString(),
          database: values.database,
          hash,
          migrationName,
          ...backup.rows[0],
        }),
        { flag: "wx", mode: 0o600 },
      );
      const integritySql = `SELECT
        (SELECT md5(COALESCE(string_agg((to_jsonb(r)-'current_stage'-'closed_from_node'-'version')::text, '' ORDER BY id),'')) FROM recruiting_record r) AS record_data,
        (SELECT md5(COALESCE(string_agg(to_jsonb(o)::text, '' ORDER BY id),'')) FROM recruiting_offer o) AS offers,
        (SELECT md5(COALESCE(string_agg(to_jsonb(f)::text, '' ORDER BY recruiting_record_id),'')) FROM recruiting_fulfillment f) AS fulfillment,
        (SELECT md5(COALESCE(string_agg(to_jsonb(m)::text, '' ORDER BY id),'')) FROM recruiting_material m) AS materials,
        (SELECT md5(COALESCE(string_agg(to_jsonb(e)::text, '' ORDER BY id),'')) FROM recruiting_event e) AS events,
        (SELECT md5(COALESCE(string_agg(to_jsonb(n)::text, '' ORDER BY recruiting_record_id,node),'')) FROM recruiting_node_state n WHERE node NOT IN ('offer','salary_negotiation')) AS other_nodes`;
      const beforeResult = await client.query(integritySql);
      const [before] = beforeResult.rows;
      if (values.apply || values["rollback-test"]) {
        for (const statement of migration
          .split("--> statement-breakpoint")
          .filter((part) => part.trim())) {
          await client.query(statement);
        }
        const afterResult = await client.query(integritySql);
        const [after] = afterResult.rows;
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          throw new Error("Unrelated data integrity verification failed");
        }
        const invalid = await client.query(
          "SELECT r.id FROM recruiting_record r LEFT JOIN recruiting_node_state n ON n.recruiting_record_id=r.id AND n.node='salary_negotiation' WHERE n.node IS NULL UNION ALL SELECT r.id FROM recruiting_record r JOIN salary_split_mapping m ON m.id=r.id WHERE m.move_to_salary AND r.current_stage<>'salary_negotiation' AND r.closed_from_node IS DISTINCT FROM 'salary_negotiation'",
        );
        if (invalid.rows.length) {
          throw new Error("Backfill coverage or stage verification failed");
        }
        const counts = await client.query(
          "SELECT move_to_salary,count(*)::int AS count FROM salary_split_mapping GROUP BY 1 ORDER BY 1",
        );
        if (values.apply) {
          await client.query(
            "INSERT INTO drizzle.__drizzle_migrations(hash,created_at,name,applied_at) VALUES ($1,$2,$3,now())",
            [hash, Date.UTC(2026, 8, 8, 14, 44, 32), migrationName],
          );
        }
        await client.query(values.apply ? "COMMIT" : "ROLLBACK");
        console.log(
          JSON.stringify({
            backup: values.backup,
            counts: counts.rows,
            database: values.database,
            integrity: after,
            mode: values.apply ? "applied" : "rollback-test",
          }),
        );
      } else {
        await client.query("ROLLBACK");
        console.log(
          JSON.stringify({
            backup: values.backup,
            database: values.database,
            integrity: before,
            mode: "read-only",
          }),
        );
      }
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.end();
}
