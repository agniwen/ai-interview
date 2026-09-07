/** Isolated, schema-only database clone. Never executes application tests on the source DB. */
import postgres from "postgres";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { once } from "node:events";

async function exited(child: ChildProcess): Promise<number> {
  await once(child, "exit");
  return child.exitCode ?? 1;
}

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) {
  throw new Error("DATABASE_URL is required (source is read-only)");
}
const source = new URL(sourceUrl);
const databaseName = `codex_evaluation_test_${crypto.randomUUID().replaceAll("-", "")}`;
const admin = postgres(sourceUrl, {
  max: 1,
  onnotice: () => {
    /* DDL replay notices are expected. */
  },
});
const target = new URL(sourceUrl);
target.pathname = `/${databaseName}`;
const pgBin = process.env.PG_BIN ?? "/opt/homebrew/opt/libpq/bin";
const root = path.resolve(import.meta.dirname, "../../../..");
const pgEnv = {
  ...process.env,
  PGDATABASE: source.pathname.slice(1),
  PGHOST: source.hostname,
  PGPASSWORD: decodeURIComponent(source.password),
  PGPORT: source.port || "5432",
  PGUSER: decodeURIComponent(source.username),
};
let createdDatabase = false;
try {
  await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
  createdDatabase = true;
  const dump = spawn(`${pgBin}/pg_dump`, ["--schema-only", "--no-owner", "--no-privileges"], {
    env: pgEnv,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const restore = spawn(`${pgBin}/psql`, ["-X", "-q", "-v", "ON_ERROR_STOP=1"], {
    env: { ...pgEnv, PGDATABASE: databaseName },
    stdio: ["pipe", "ignore", "inherit"],
  });
  dump.stdout.pipe(restore.stdin);
  const statuses = await Promise.all([exited(dump), exited(restore)]);
  if (statuses.some(Boolean)) {
    throw new Error("schema-only clone failed");
  }
  const isolated = postgres(target.toString(), {
    max: 1,
    onnotice: () => {
      /* DDL replay notices are expected. */
    },
  });
  try {
    const migration = await readFile(
      path.join(root, "apps/web/drizzle/20260907160000_record_evaluation_document/migration.sql"),
      "utf-8",
    );
    await isolated.begin((tx) => tx.unsafe(migration));
  } finally {
    await isolated.end();
  }
  const tests = spawn("bun", ["run", "test", ...process.argv.slice(2)], {
    cwd: path.join(root, "apps/server"),
    env: { ...process.env, DATABASE_URL: target.toString() },
    stdio: "inherit",
  });
  const result = await exited(tests);
  if (result) {
    process.exitCode = result;
  }
} finally {
  // Only the uniquely named database created above is removed.
  if (createdDatabase) {
    await admin.unsafe(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  }
  await admin.end();
}
