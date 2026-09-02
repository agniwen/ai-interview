import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { z } from "zod";
import type { JsonObject } from "@app/db-schema/json";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildResumeKeywordSearch, buildResumeAtomicSearch } from "./keyword-search";
import {
  backfillResumeSearchBatch,
  checkResumeSearch,
} from "../../../../../../scripts/resume-search-maintenance";

// Explicit opt-in: creates an isolated schema; never uses DATABASE_URL.
const testUrl = process.env.RESUME_SEARCH_TEST_DATABASE_URL;
const dialect = new PgDialect();
const tables = ["resume_pool_item", "studio_interview"] as const;

describe.skipIf(!testUrl)("resume keyword search lifecycle (PostgreSQL)", () => {
  const client = postgres(testUrl ?? "postgres://localhost/unused", { max: 1 });
  const schema = `resume_search_${randomUUID().replaceAll("-", "")}`;

  beforeAll(async () => {
    await client.unsafe(`CREATE SCHEMA "${schema}"`);
    await client.unsafe(`SET search_path TO "${schema}", public`);
    for (const table of tables) {
      await client.unsafe(
        `CREATE TABLE "${table}" (` +
          `id text PRIMARY KEY, candidate_name text, candidate_email text, candidate_phone text, ` +
          `resume_file_name text, target_role text, resume_profile jsonb, ` +
          `organization_id text DEFAULT 'org-a', created_by text DEFAULT 'owner', ` +
          `status text DEFAULT 'active', updated_at timestamptz DEFAULT '2026-08-26T00:00:00Z')`,
      );
    }
    const migration = await readFile(
      new URL(
        "../../../../../../../../web/drizzle/20260826120000_resume_keyword_search/migration.sql",
        import.meta.url,
      ),
      "utf-8",
    );
    await client.unsafe(migration);
  });

  afterAll(async () => {
    await client.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  });

  beforeEach(async () => {
    for (const table of tables) {
      await client.unsafe(`DELETE FROM "${table}"`);
    }
  });

  async function insert(table: string, id: string, profile: JsonObject | null = null) {
    await client.unsafe(
      `INSERT INTO "${table}" (id, candidate_name, resume_profile) VALUES ($1, '张三', $2::text::jsonb)`,
      [id, JSON.stringify(profile)],
    );
  }

  async function search(table: string, query: string) {
    const condition = buildResumeKeywordSearch(
      {
        searchCjkBigrams: sql.identifier("search_cjk_bigrams"),
        searchText: sql.identifier("search_text"),
      },
      query,
    );
    const compiled = dialect.sqlToQuery(condition ?? sql.raw("true"));
    const rows = await client.unsafe<{ id: string }[]>(
      `SELECT id FROM "${table}" WHERE organization_id = 'org-a' ` +
        `AND created_by = 'owner' AND status = 'active' AND (${compiled.sql}) ORDER BY id`,
      z.array(z.string()).parse(compiled.params),
    );
    return rows.map((row) => row.id);
  }

  async function atomicSearch(table: string, values: Record<string, string>) {
    const condition = buildResumeAtomicSearch(
      {
        candidateEmail: sql.identifier("candidate_email"),
        candidateName: sql.identifier("candidate_name"),
        candidatePhone: sql.identifier("candidate_phone"),
        resumeFileName: sql.identifier("resume_file_name"),
        resumeProfile: sql.identifier("resume_profile"),
        searchCjkBigrams: sql.identifier("search_cjk_bigrams"),
        searchText: sql.identifier("search_text"),
        targetRole: sql.identifier("target_role"),
      },
      JSON.stringify(values),
    );
    const compiled = dialect.sqlToQuery(condition ?? sql.raw("true"));
    const rows = await client.unsafe<{ id: string }[]>(
      `SELECT id FROM "${table}" WHERE organization_id = 'org-a' AND (${compiled.sql}) ORDER BY id`,
      z.array(z.string()).parse(compiled.params),
    );
    return rows.map((row) => row.id);
  }

  for (const table of tables) {
    it(`${table}: combines company and school without cross-field matches`, async () => {
      await insert(table, "both", {
        educationExperiences: [{ school: "清华大学" }],
        schools: ["旧学校"],
        workExperiences: [{ company: "腾讯" }],
      });
      await insert(table, "company-only", {
        schools: ["北京大学"],
        workExperiences: [{ company: "腾讯清华" }],
      });
      await insert(table, "school-only", {
        schools: ["清华大学"],
        workExperiences: [{ company: "网易" }],
      });
      expect(await atomicSearch(table, { company: "腾讯", school: "清华" })).toEqual(["both"]);
      expect(await atomicSearch(table, { company: "清华大学" })).toEqual([]);
      expect(await atomicSearch(table, { school: "腾讯" })).toEqual([]);
      expect(await atomicSearch(table, { school: "旧学校" })).toEqual([]);
      expect(await atomicSearch(table, { school: "北京" })).toEqual(["company-only"]);
      expect(await atomicSearch(table, { candidateName: "腾讯" })).toEqual([]);
    });

    it(`${table}: treats wildcard characters literally in atomic filters`, async () => {
      await insert(table, "literal", { workExperiences: [{ company: "100%_真诚" }] });
      await insert(table, "other", { workExperiences: [{ company: "100X真诚" }] });
      expect(await atomicSearch(table, { company: "%_" })).toEqual(["literal"]);
    });

    it(`${table}: searches all employers and education schools`, async () => {
      await client.unsafe(
        `INSERT INTO "${
          table
        }" (id, candidate_name, resume_profile) VALUES ($1, $2, $3::text::jsonb)`,
        [
          "candidate",
          "张三",
          JSON.stringify({
            educationExperiences: [{ school: "清华大学" }, { school: "浙江大学" }],
            schools: ["旧学校"],
            workExperiences: [{ company: "字节跳动" }, { company: "Tencent" }],
          }),
        ],
      );
      expect(await search(table, "字节")).toEqual(["candidate"]);
      expect(await search(table, "tencent")).toEqual(["candidate"]);
      expect(await search(table, "清华")).toEqual(["candidate"]);
      expect(await search(table, "浙江大学")).toEqual(["candidate"]);
      expect(await search(table, "旧学校")).toEqual([]);
    });

    it(`${table}: searches legacy schools and all original metadata`, async () => {
      await insert(table, "legacy", { educationExperiences: [], schools: ["北京大学"] });
      await client.unsafe(
        `UPDATE "${table}" SET candidate_email = 'HELLO@example.com', candidate_phone = '13800138000',
          resume_file_name = 'portfolio.pdf', target_role = '前端工程师' WHERE id = 'legacy'`,
      );
      for (const query of ["北京", "张三", "hello@", "1380013", "portfolio", "前端"]) {
        expect(await search(table, query)).toEqual(["legacy"]);
      }
      expect(await search(table, "北大")).toEqual([]);
    });

    it(`${table}: replaces old companies and schools on reparse`, async () => {
      await insert(table, "updated", {
        schools: ["清华大学"],
        workExperiences: [{ company: "腾讯" }],
      });
      await client.unsafe(
        `UPDATE "${table}" SET resume_profile = $1::text::jsonb WHERE id = 'updated'`,
        [JSON.stringify({ schools: ["复旦大学"], workExperiences: [{ company: "网易" }] })],
      );
      expect(await search(table, "腾讯")).toEqual([]);
      expect(await search(table, "清华")).toEqual([]);
      expect(await search(table, "网易")).toEqual(["updated"]);
      expect(await search(table, "复旦")).toEqual(["updated"]);
      await client.unsafe(`UPDATE "${table}" SET resume_profile = NULL WHERE id = 'updated'`);
      expect(await search(table, "网易")).toEqual([]);
      expect(await search(table, "张三")).toEqual(["updated"]);
    });

    it(`${table}: handles absent or malformed historical profiles and placeholders`, async () => {
      await insert(table, "empty", {
        educationExperiences: {},
        schools: ["未发现信息", null, 7],
        workExperiences: null,
      });
      await insert(table, "placeholder", { workExperiences: [{ company: "未发现信息" }] });
      expect(await search(table, "未发现")).toEqual([]);
      expect(await search(table, "张三")).toEqual(["empty", "placeholder"]);
      expect(await search(table, "   ")).toEqual(["empty", "placeholder"]);
    });

    it(`${table}: treats wildcard characters literally and never matches across fields`, async () => {
      await insert(table, "literal", { workExperiences: [{ company: "100%_! Labs" }] });
      await insert(table, "other", { workExperiences: [{ company: "100XX Labs" }] });
      expect(await search(table, "%_!")).toEqual(["literal"]);
      expect(await search(table, "  100%_!   labs  ")).toEqual(["literal"]);
      expect(await search(table, "张三 100")).toEqual([]);
      expect(await search(table, "100' OR true --")).toEqual([]);
    });

    it(`${table}: preserves visibility and ordering with keyword matches`, async () => {
      for (const id of ["a", "b", "private", "other-org", "archived"]) {
        await insert(table, id, { schools: ["清华大学"] });
      }
      await client.unsafe(
        `UPDATE "${table}" SET created_by = 'another-owner' WHERE id = 'private'`,
      );
      await client.unsafe(`UPDATE "${table}" SET organization_id = 'org-b' WHERE id = 'other-org'`);
      await client.unsafe(`UPDATE "${table}" SET status = 'archived' WHERE id = 'archived'`);
      expect(await search(table, "清华")).toEqual(["a", "b"]);
      await client.unsafe(`UPDATE "${table}" SET status = 'active' WHERE id = 'archived'`);
      expect(await search(table, "清华")).toEqual(["a", "archived", "b"]);
    });

    it(`${table}: normalizes Unicode whitespace consistently with the search input`, async () => {
      await insert(table, "unicode-spaces", {
        educationExperiences: [{ school: "\u3000未发现信息\u00A0" }],
        schools: ["北京\u3000大学"],
        workExperiences: [{ company: "Acme\u00A0\uFEFFCo" }],
      });
      expect(await search(table, "acme co")).toEqual(["unicode-spaces"]);
      expect(await search(table, "北京 大学")).toEqual(["unicode-spaces"]);
      expect(await search(table, "北京\u3000大学")).toEqual(["unicode-spaces"]);
    });

    it(`${table}: deletion removes search hits and late updates do not resurrect records`, async () => {
      await insert(table, "deleted", { schools: ["清华大学"] });
      await client.unsafe(`DELETE FROM "${table}" WHERE id = 'deleted'`);
      await client.unsafe(`UPDATE "${table}" SET candidate_name = '迟到回调' WHERE id = 'deleted'`);
      expect(await search(table, "清华")).toEqual([]);
      expect(await search(table, "迟到")).toEqual([]);
    });

    it(`${table}: backfills in resumable batches without changing business timestamps`, async () => {
      // Simulate pre-migration rows in this test-owned schema only.
      await client.unsafe(`ALTER TABLE "${table}" DISABLE TRIGGER ${table}_sync_search`);
      try {
        await insert(table, "old-a", { schools: ["清华大学"] });
        await insert(table, "old-b", { workExperiences: [{ company: "腾讯" }] });
      } finally {
        await client.unsafe(`ALTER TABLE "${table}" ENABLE TRIGGER ${table}_sync_search`);
      }
      const beforeBackfill = await checkResumeSearch(client, table);
      expect(beforeBackfill.pending).toBe(2);
      expect(await backfillResumeSearchBatch(client, table, null, 1)).toEqual({
        count: 1,
        last_id: "old-a",
      });
      expect(await search(table, "清华")).toEqual(["old-a"]);
      expect(await backfillResumeSearchBatch(client, table, "old-a", 1)).toEqual({
        count: 1,
        last_id: "old-b",
      });
      expect(await search(table, "腾讯")).toEqual(["old-b"]);
      expect(await backfillResumeSearchBatch(client, table, null, 1)).toEqual({
        count: 0,
        last_id: null,
      });
      const dates = await client.unsafe<{ updated_at: Date }[]>(
        `SELECT updated_at FROM "${table}"`,
      );
      expect(dates.map((row) => row.updated_at.toISOString())).toEqual([
        "2026-08-26T00:00:00.000Z",
        "2026-08-26T00:00:00.000Z",
      ]);
    });

    it(`${table}: falls back when structured schools contain only whitespace or placeholders`, async () => {
      await insert(table, "legacy-whitespace", {
        educationExperiences: [{ school: "\t" }, { school: "\n未发现信息\n" }],
        schools: ["清华大学"],
      });
      expect(await search(table, "清华")).toEqual(["legacy-whitespace"]);
    });

    it(`${table}: keeps projections database-owned even if directly overwritten`, async () => {
      await insert(table, "owned", { schools: ["清华大学"] });
      await client.unsafe(
        `UPDATE "${table}" SET search_text = 'stale', search_cjk_bigrams = '{}' WHERE id = 'owned'`,
      );
      expect(await search(table, "清华")).toEqual(["owned"]);
      expect(await search(table, "stale")).toEqual([]);
    });

    it(`${table}: concurrent backfill and updates/deletes preserve current data`, async () => {
      const writer = postgres(testUrl ?? "postgres://localhost/unused", { max: 1 });
      await writer.unsafe(`SET search_path TO "${schema}", public`);
      try {
        await client.unsafe(`ALTER TABLE "${table}" DISABLE TRIGGER ${table}_sync_search`);
        try {
          await insert(table, "race-update", { schools: ["旧学校"] });
          await insert(table, "race-delete", { schools: ["清华大学"] });
        } finally {
          await client.unsafe(`ALTER TABLE "${table}" ENABLE TRIGGER ${table}_sync_search`);
        }
        await Promise.all([
          backfillResumeSearchBatch(client, table, null, 10),
          writer.begin(async (tx) => {
            await tx.unsafe(
              `UPDATE "${table}" SET resume_profile = '{"schools":["新学校"]}'::jsonb WHERE id = 'race-update'`,
            );
          }),
        ]);
        expect(await search(table, "旧学校")).toEqual([]);
        expect(await search(table, "新学校")).toEqual(["race-update"]);
        // Reset a derived field through disabled triggers only to model pre-migration data.
        await client.unsafe(`ALTER TABLE "${table}" DISABLE TRIGGER ${table}_sync_search`);
        await client.unsafe(`UPDATE "${table}" SET search_text = NULL WHERE id = 'race-delete'`);
        await client.unsafe(`ALTER TABLE "${table}" ENABLE TRIGGER ${table}_sync_search`);
        await Promise.all([
          backfillResumeSearchBatch(client, table, null, 10),
          writer.unsafe(`DELETE FROM "${table}" WHERE id = 'race-delete'`),
        ]);
        expect(await search(table, "清华")).toEqual([]);
      } finally {
        await writer.end();
      }
    });
  }
});
