import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  deferredColumns,
  required,
  digest,
  key,
  object,
  sourceNames,
  sqlName,
  table,
  tables,
  targetNames,
} from "./model";
import type { CopyItem, MigrationMapping, Row } from "./model";
import { buildMigrationPlan } from "./transform";
import type { SourceData } from "./transform";

export type Query = (text: string, values?: string[]) => Promise<Row[]>;
export interface MigrationReport {
  database: string;
  mode: "preflight" | "apply";
  sources: Record<string, { count: number; sha256: string }>;
  targets: Record<string, { planned: number; inserted: number; verifiedExisting: number }>;
  decisions: ReturnType<typeof buildMigrationPlan>["decisions"];
  warnings: string[];
}
const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;
const qualified = (name: string) => `public.${quote(sqlName(name))}`;

export async function loadSources(query: Query): Promise<SourceData> {
  const data: SourceData = new Map();
  for (const name of [...sourceNames, "mailIngestAccount"]) {
    const result = await query(`SELECT to_jsonb(t) AS row FROM ${qualified(name)} AS t`);
    data.set(
      name,
      result.map((r) => object(r.row)),
    );
  }
  return data;
}
export function sourceBaseline(data: SourceData): MigrationReport["sources"] {
  return Object.fromEntries(
    [...data].map(([name, rows]) => [
      sqlName(name),
      {
        count: rows.length,
        sha256: digest(rows.toSorted((a, b) => key(name, a).localeCompare(key(name, b)))),
      },
    ]),
  );
}
async function databaseBaseline(query: Query): Promise<MigrationReport["sources"]> {
  const output: MigrationReport["sources"] = {};
  for (const name of [...sourceNames, "mailIngestAccount"]) {
    const [row] = await query(
      `SELECT count(*)::int AS count, encode(sha256(convert_to(coalesce(string_agg(row_hash, '' ORDER BY row_hash), ''), 'UTF8')), 'hex') AS sha256 FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text, 'UTF8')), 'hex') AS row_hash FROM ${qualified(name)} AS t) hashes`,
    );
    output[sqlName(name)] = {
      count: Number(required(row).count),
      sha256: String(required(row).sha256),
    };
  }
  return output;
}
function insertionOrder(): string[] {
  const namesByTable = new Map([...tables].map(([name, value]) => [value, name]));
  const remaining = new Set(targetNames);
  const order: string[] = [];
  while (remaining.size > 0) {
    const next = [...remaining].find((name) =>
      getTableConfig(table(name)).foreignKeys.every((fk) => {
        const ref = fk.reference();
        if (ref.columns.some((c) => deferredColumns(name).includes(c.name))) {
          return true;
        }
        const parent = namesByTable.get(ref.foreignTable);
        return !parent || !remaining.has(parent);
      }),
    );
    if (!next) {
      throw new Error(`Unresolved migration FK cycle: ${[...remaining].join(", ")}`);
    }
    order.push(next);
    remaining.delete(next);
  }
  return order;
}
function sourceHash(item: CopyItem): string {
  // 映射及父行推导也参与校验；不允许用变更后的回填规则覆盖已经运行的新记录。
  return digest({ source: item.source, target: item.row });
}
function ledgerKey(
  sourceTable: Row[string],
  sourceKey: Row[string],
  targetTable: Row[string],
): string {
  return JSON.stringify([sourceTable, sourceKey, targetTable]);
}
export function verifyExisting(item: CopyItem, existing: Row | undefined, ledger?: Row): boolean {
  if (!existing && !ledger) {
    return false;
  }
  if (!existing || !ledger) {
    throw new Error(
      `Unmanaged or deleted migration target: ${item.targetName} ${key(item.targetName, item.row)}`,
    );
  }
  let hashes: Row;
  try {
    hashes = object(JSON.parse(String(ledger.source_hash)));
  } catch {
    throw new Error("Unsupported migration ledger hash format");
  }
  if (hashes.version !== 1 || hashes.source !== sourceHash(item)) {
    throw new Error(`Source or mapping changed after copy: ${item.sourceName} ${item.sourceKey}`);
  }
  if (hashes.target !== (existing.__migration_hash ?? digest(existing))) {
    throw new Error(
      `Target changed after copy; refusing overwrite: ${item.targetName} ${key(item.targetName, item.row)}`,
    );
  }
  if (ledger.target_key !== key(item.targetName, existing)) {
    throw new Error("Migration ledger target identity mismatch");
  }
  return true;
}
async function readTargets(query: Query): Promise<Map<string, Map<string, Row>>> {
  const target = new Map<string, Map<string, Row>>();
  for (const name of targetNames) {
    const config = getTableConfig(table(name));
    const primary = [
      ...config.columns.filter((c) => c.primary),
      ...config.primaryKeys.flatMap((p) => p.columns),
    ];
    const fields = primary
      .flatMap((column) => [`'${column.name}'`, `t.${quote(column.name)}`])
      .join(",");
    const rows = await query(
      `SELECT jsonb_build_object(${fields}, '__migration_hash', encode(sha256(convert_to(to_jsonb(t)::text, 'UTF8')), 'hex')) AS row FROM ${qualified(name)} AS t`,
    );
    target.set(
      name,
      new Map(
        rows.map((r) => {
          const row = object(r.row);
          return [key(name, row), row];
        }),
      ),
    );
  }
  return target;
}
const sourceFieldHashes = new WeakMap<Row, Map<string, string>>();
export function compactValues(item: CopyItem, defer: boolean): Row {
  let sourceFields = sourceFieldHashes.get(item.source);
  if (!sourceFields) {
    sourceFields = new Map(
      Object.entries(item.source).map(([name, value]) => [digest(value), name]),
    );
    sourceFieldHashes.set(item.source, sourceFields);
  }
  const fields: Record<string, string> = {};
  const literals: Row = {};
  let snapshot = false;
  for (const [name, original] of Object.entries(item.row)) {
    const value = defer && deferredColumns(item.targetName).includes(name) ? null : original;
    if (name === "detail" && object(value).legacySource === item.source) {
      snapshot = true;
      const { legacySource: _legacySource, ...detail } = object(value);
      literals.detail = detail;
      continue;
    }
    const sourceField = sourceFields.get(digest(value));
    if (sourceField) {
      fields[name] = sourceField;
    } else {
      literals[name] = value;
    }
  }
  return {
    fields,
    literals,
    snapshot,
    sourceKey: object(JSON.parse(key(item.sourceName, item.source))),
  };
}
export function expectedRowsSql(item: CopyItem, columns: string[]): string {
  const source = qualified(item.sourceName);
  const target = qualified(item.targetName);
  const primary = Object.keys(object(JSON.parse(key(item.sourceName, item.source))));
  return `WITH source_rows AS MATERIALIZED (
    SELECT input, to_jsonb(s) AS source_row
    FROM jsonb_array_elements($1::text::jsonb) input
    CROSS JOIN LATERAL jsonb_populate_record(NULL::${source}, input->'sourceKey') identity
    JOIN ${source} s ON ${primary.map((c) => `s.${quote(c)} = identity.${quote(c)}`).join(" AND ")}
  ) SELECT ${columns.map((c) => `expected.${quote(c)}`).join(",")}
  FROM source_rows
  CROSS JOIN LATERAL (SELECT coalesce(jsonb_object_agg(f.key, source_row->f.value), '{}'::jsonb) || (input->'literals') AS value FROM jsonb_each_text(input->'fields') f) projection
  CROSS JOIN LATERAL jsonb_populate_record(NULL::${target}, CASE WHEN (input->>'snapshot')::boolean THEN jsonb_set(projection.value, '{detail,legacySource}', source_row) ELSE projection.value END) expected`;
}
export function jsonBatches(values: Row[]): Row[][] {
  const batches: Row[][] = [];
  let batch: Row[] = [];
  let bytes = 2;
  for (const row of values) {
    const size = Buffer.byteLength(JSON.stringify(row), "utf-8") + 1;
    if (batch.length > 0 && (batch.length >= 100 || bytes + size > 128 * 1024)) {
      batches.push(batch);
      batch = [];
      bytes = 2;
    }
    batch.push(row);
    bytes += size;
  }
  if (batch.length > 0) {
    batches.push(batch);
  }
  return batches;
}
function fieldGroups(items: CopyItem[]): Map<string, CopyItem[]> {
  return Map.groupBy(
    items,
    (item) => `${item.targetName}:${item.sourceName}:${Object.keys(item.row).toSorted().join(",")}`,
  );
}

function validateRequiredColumns(items: CopyItem[]): void {
  for (const item of items) {
    for (const column of getTableConfig(table(item.targetName)).columns) {
      if (
        column.notNull &&
        (item.row[column.name] === null ||
          (item.row[column.name] === undefined && !column.hasDefault))
      ) {
        throw new Error(`Missing required ${item.targetName}.${column.name}: ${item.sourceKey}`);
      }
    }
  }
}

/** 新模型更强的归属约束在写入前检查，避免复制大 JSON 后才发现历史悬空引用。 */
export function validatePlanReferences(items: CopyItem[]): void {
  const byTable = Map.groupBy(items, (item) => item.targetName);
  const evaluationRuns = new Set<string>();
  for (const { row } of byTable.get("recruitingResumeEvaluation") ?? []) {
    if (row.run_id === null || row.run_id === undefined) {
      continue;
    }
    const identity = digest([row.recruiting_record_id, row.kind, row.contract_version, row.run_id]);
    if (evaluationRuns.has(identity)) {
      throw new Error(`Conflicting historical evaluation run on ${row.recruiting_record_id}`);
    }
    evaluationRuns.add(identity);
  }

  const namesByTable = new Map([...tables].map(([name, value]) => [value, name]));
  for (const [name, group] of byTable) {
    for (const fk of getTableConfig(table(name)).foreignKeys) {
      const ref = fk.reference();
      const parentName = namesByTable.get(ref.foreignTable);
      if (!parentName || !targetNames.includes(parentName)) {
        continue;
      }
      const parents = new Set(
        (byTable.get(parentName) ?? []).map((item) =>
          digest(ref.foreignColumns.map((column) => item.row[column.name] ?? null)),
        ),
      );
      for (const item of group) {
        const values = ref.columns.map((column) => item.row[column.name] ?? null);
        if (values.some((value) => value === null)) {
          continue;
        }
        if (!parents.has(digest(values))) {
          throw new Error(
            `Invalid migrated reference ${fk.getName()}: ${item.sourceName} ${item.sourceKey}`,
          );
        }
      }
    }
  }
}

/** 调用者必须包在单个事务中。只允许 INSERT 新表及补齐本次新建行的循环引用。 */
// oxlint-disable-next-line complexity -- 迁移按源锁、预检、依赖顺序写入、循环引用补齐、逐字段核对在单事务内执行。
export async function runMigration(
  query: Query,
  options: {
    sourceCachePath?: string;
    apply: boolean;
    expectedDatabase: string;
    mapping?: MigrationMapping;
  },
): Promise<MigrationReport> {
  const [identity] = await query("SELECT current_database() AS database");
  if (identity?.database !== options.expectedDatabase) {
    throw new Error("Database identity differs from --database; refusing migration");
  }
  if (options.apply && options.expectedDatabase !== "ainterview-dev") {
    throw new Error("This migration command is restricted to ainterview-dev");
  }
  if (options.apply) {
    await query("SELECT pg_advisory_xact_lock(718401256)");
    await query("SET LOCAL lock_timeout = '15s'");
    // SHARE 允许读但阻止源表所有业务 DML；目标表同时阻止其他写入和并行迁移。
    await query(
      `LOCK TABLE ${[...sourceNames, "mailIngestAccount"].map(qualified).join(", ")} IN SHARE MODE`,
    );
    await query(
      `LOCK TABLE ${[...targetNames, "recruitingMigrationMap"].map(qualified).join(", ")} IN SHARE ROW EXCLUSIVE MODE`,
    );
  }
  const baseline = await databaseBaseline(query);
  let data: SourceData;
  const cachePath = options.sourceCachePath;
  if (cachePath && existsSync(cachePath)) {
    const cached = z
      .object({
        baselineHash: z.string(),
        data: z.array(z.tuple([z.string(), z.array(z.record(z.string(), z.unknown()))])),
        dataHash: z.string(),
      })
      .parse(JSON.parse(await readFile(cachePath, "utf-8")));
    if (cached.baselineHash !== digest(baseline) || cached.dataHash !== digest(cached.data)) {
      throw new Error("Source cache no longer matches database baseline");
    }
    data = new Map(cached.data);
  } else {
    data = await loadSources(query);
    if (cachePath) {
      await writeFile(
        cachePath,
        JSON.stringify({
          baselineHash: digest(baseline),
          data: [...data],
          dataHash: digest([...data]),
        }),
        { mode: 0o600 },
      );
    }
  }
  const plan = buildMigrationPlan(data, options.mapping);
  validateRequiredColumns(plan.items);
  validatePlanReferences(plan.items);
  const existing = await readTargets(query);
  const ledgers = await query(`SELECT * FROM ${qualified("recruitingMigrationMap")}`);
  const ledgerByKey = new Map(
    ledgers.map((r) => [ledgerKey(r.source_table, r.source_key, r.target_table), r]),
  );
  const inserted: CopyItem[] = [];
  const report: MigrationReport = {
    database: String(identity.database),
    decisions: plan.decisions,
    mode: options.apply ? "apply" : "preflight",
    sources: baseline,
    targets: Object.fromEntries(
      targetNames.map((name) => [sqlName(name), { inserted: 0, planned: 0, verifiedExisting: 0 }]),
    ),
    warnings: plan.warnings,
  };
  for (const item of plan.items) {
    const counts = required(report.targets[sqlName(item.targetName)]);
    counts.planned += 1;
    const prior = existing.get(item.targetName)?.get(key(item.targetName, item.row));
    const ledger = ledgerByKey.get(
      ledgerKey(sqlName(item.sourceName), item.sourceKey, sqlName(item.targetName)),
    );
    if (verifyExisting(item, prior, ledger)) {
      counts.verifiedExisting += 1;
    } else {
      inserted.push(item);
    }
  }
  if (!options.apply) {
    return report;
  }
  for (const name of insertionOrder()) {
    const items = inserted.filter((item) => item.targetName === name);
    // 按显式字段分组，避免 jsonb_populate_record 的 NULL 吞掉数据库默认值。
    for (const group of fieldGroups(items).values()) {
      const first = required(group[0]);
      const columns = Object.keys(first.row).toSorted();
      for (const values of jsonBatches(group.map((item) => compactValues(item, true)))) {
        const [written] = await query(
          `WITH copied AS (INSERT INTO ${qualified(name)} (${columns.map(quote).join(",")}) ${expectedRowsSql(first, columns)} RETURNING 1) SELECT count(*)::int AS count FROM copied`,
          [JSON.stringify(values)],
        );
        if (Number(written?.count) !== values.length) {
          throw new Error(`Copy count mismatch in ${name}`);
        }
      }
    }
    required(report.targets[sqlName(name)]).inserted = items.length;
  }
  for (const item of inserted) {
    const columns = deferredColumns(item.targetName).filter(
      (c) => item.row[c] !== null && item.row[c] !== undefined,
    );
    if (columns.length === 0) {
      continue;
    }
    const identityRow = object(JSON.parse(key(item.targetName, item.row)));
    await query(
      `UPDATE ${qualified(item.targetName)} AS t SET ${columns.map((c) => `${quote(c)} = incoming.${quote(c)}`).join(", ")} FROM jsonb_populate_record(NULL::${qualified(item.targetName)}, $1::text::jsonb) AS incoming WHERE ${Object.keys(
        identityRow,
      )
        .map((c) => `t.${quote(c)} = incoming.${quote(c)}`)
        .join(" AND ")}`,
      [
        JSON.stringify({
          ...identityRow,
          ...Object.fromEntries(columns.map((c) => [c, item.row[c]])),
        }),
      ],
    );
  }
  const after = await readTargets(query);
  const ledgerRows: Row[] = [];
  for (const item of inserted) {
    const actual = after.get(item.targetName)?.get(key(item.targetName, item.row));
    if (!actual) {
      throw new Error("Inserted row disappeared before verification");
    }
    ledgerRows.push({
      source_hash: JSON.stringify({
        source: sourceHash(item),
        target: actual.__migration_hash ?? digest(actual),
        version: 1,
      }),
      source_key: item.sourceKey,
      source_table: sqlName(item.sourceName),
      target_key: key(item.targetName, item.row),
      target_table: sqlName(item.targetName),
    });
  }
  for (const group of fieldGroups(inserted).values()) {
    const first = required(group[0]);
    const name = first.targetName;
    const columns = Object.keys(first.row).toSorted();
    const primaryColumns = Object.keys(object(JSON.parse(key(name, first.row))));
    for (const batch of jsonBatches(group.map((item) => compactValues(item, false)))) {
      const [comparison] = await query(
        `WITH incoming AS (${expectedRowsSql(first, columns)}) SELECT count(*)::int AS matches FROM incoming JOIN ${qualified(name)} t ON ${primaryColumns.map((c) => `t.${quote(c)} = incoming.${quote(c)}`).join(" AND ")} WHERE ${columns.map((c) => `t.${quote(c)} IS NOT DISTINCT FROM incoming.${quote(c)}`).join(" AND ")}`,
        [JSON.stringify(batch)],
      );
      if (Number(comparison?.matches) !== batch.length) {
        throw new Error(`Copied fields differ in table ${name}`);
      }
    }
  }
  for (const batch of jsonBatches(ledgerRows)) {
    await query(
      `INSERT INTO ${qualified("recruitingMigrationMap")} (source_table, source_key, target_table, target_key, source_hash) SELECT source_table, source_key, target_table, target_key, source_hash FROM jsonb_populate_recordset(NULL::${qualified("recruitingMigrationMap")}, $1::text::jsonb)`,
      [JSON.stringify(batch)],
    );
  }
  if (digest(await databaseBaseline(query)) !== digest(baseline)) {
    throw new Error("Source data changed during migration");
  }
  return report;
}
