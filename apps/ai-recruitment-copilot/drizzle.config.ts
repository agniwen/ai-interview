import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { Config } from "drizzle-kit";

// 中文：drizzle-kit 不会自动加载 .env，且 turbo 调度时 cwd 可能不在本目录，显式指向同级 .env。
// English: drizzle-kit doesn't auto-load .env, and turbo may run from the repo root —
// resolve the co-located .env explicitly so cwd doesn't matter.
loadEnv({ path: path.resolve(import.meta.dirname, ".env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set.");
}

export default {
  dbCredentials: {
    url: databaseUrl,
  },
  dialect: "postgresql",
  migrations: {
    // 1.0 RC 默认就是 "drizzle"，库里现有的 __drizzle_migrations 也在这里；
    // 显式写出避免未来误改。
    // 1.0 RC defaults to "drizzle"; pin it so the table location is explicit.
    schema: "drizzle",
    table: "__drizzle_migrations",
  },
  out: "./drizzle",
  schema: "./src/lib/shared/db/schema.ts",
  // 仅扫描 public schema：库里另有 drizzle.__drizzle_migrations 与历史的
  // graphile_worker / workflow（已删除）等外部 schema，不归 drizzle 管。
  // 跳过它们避免误判 drift。
  // Restrict drizzle-kit to "public" so the migrations bookkeeping schema
  // and any external schemas we don't model here aren't seen as drift.
  schemaFilter: ["public"],
} satisfies Config;
