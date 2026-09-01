import type { Config } from "drizzle-kit";
import { loadWebProcessEnv } from "./src/env/load";

// Keep database commands on the same mode-aware current/legacy lookup used by
// the web runtime. drizzle-kit can preload a lower-priority `.env`, so merge the
// complete file chain before applying the mode-specific values over that preload.
loadWebProcessEnv("development");

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
  schema: "../../packages/db-schema/src/schema.ts",
  // 仅扫描 public schema：库里另有 drizzle.__drizzle_migrations 与历史的
  // graphile_worker / workflow（已删除）等外部 schema，不归 drizzle 管。
  // 跳过它们避免误判 drift。
  // Restrict drizzle-kit to "public" so the migrations bookkeeping schema
  // and any external schemas we don't model here aren't seen as drift.
  schemaFilter: ["public"],
} satisfies Config;
