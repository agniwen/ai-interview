import path from "node:path";
import { config as loadEnvFile } from "dotenv";
import postgres from "postgres";
import { z } from "zod";
import { getPostgresConnectionOptions } from "../lib/server/db/connection-options";
import { loadStandaloneEnv } from "../standalone/env";

const DEFAULT_RECRUITING_GROUP_NAME = "默认招聘组";

interface RepairMutationStats {
  insertedDefaultGroupCount: string | number;
  insertedMembershipCount: string | number;
  markedExistingGroupCount: string | number;
  organizationCount: string | number;
  targetMembershipCount: string | number;
  updatedMembershipCount: string | number;
  workspaceMemberCount: string | number;
}

interface RepairFinalStats {
  defaultGroupCount: string | number;
  defaultGroupMembershipCount: string | number;
}

type RepairStats = RepairMutationStats & RepairFinalStats;

function toNumber(value: string | number): number {
  return z.coerce.number().parse(value);
}

function printStats(stats: RepairStats): void {
  const rows = [
    ["workspaces", stats.organizationCount],
    ["workspace members", stats.workspaceMemberCount],
    ["default groups inserted", stats.insertedDefaultGroupCount],
    ["existing named groups marked default", stats.markedExistingGroupCount],
    ["target default-group memberships", stats.targetMembershipCount],
    ["memberships inserted", stats.insertedMembershipCount],
    ["memberships role-updated", stats.updatedMembershipCount],
    ["current default groups", stats.defaultGroupCount],
    ["current default-group memberships", stats.defaultGroupMembershipCount],
  ] as const;

  console.log("Default recruiting group repair complete.");
  for (const [label, value] of rows) {
    console.log(`- ${label}: ${toNumber(value)}`);
  }
}

async function main(): Promise<void> {
  loadStandaloneEnv();
  const appsRoot = path.resolve(import.meta.dirname, "../../..");
  loadEnvFile({ path: path.join(appsRoot, "ai-recruitment-copilot", ".env.local"), quiet: true });
  loadEnvFile({ path: path.join(appsRoot, "ai-recruitment-copilot", ".env"), quiet: true });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  const sql = postgres(databaseUrl, getPostgresConnectionOptions());

  try {
    const stats = await sql.begin(async (tx) => {
      await tx`LOCK TABLE "recruiting_group", "recruiting_group_member" IN SHARE ROW EXCLUSIVE MODE`;

      const [mutationStats] = await tx<RepairMutationStats[]>`
        WITH owner_member AS (
          SELECT DISTINCT ON (m."organization_id")
            m."organization_id",
            m."user_id"
          FROM "member" AS m
          WHERE m."role" = 'owner'
          ORDER BY m."organization_id", m."created_at" ASC, m."user_id" ASC
        ),
        workspaces AS (
          SELECT
            org."id" AS "organization_id",
            owner_member."user_id" AS "owner_user_id"
          FROM "organization" AS org
          LEFT JOIN owner_member
            ON owner_member."organization_id" = org."id"
        ),
        marked_named_default AS (
          UPDATE "recruiting_group" AS rg
          SET
            "created_by" = COALESCE(rg."created_by", workspaces."owner_user_id"),
            "is_default" = true,
            "updated_at" = now()
          FROM workspaces
          WHERE
            rg."organization_id" = workspaces."organization_id"
            AND rg."name" = ${DEFAULT_RECRUITING_GROUP_NAME}
            AND rg."is_default" = false
            AND NOT EXISTS (
              SELECT 1
              FROM "recruiting_group" AS existing_default
              WHERE
                existing_default."organization_id" = rg."organization_id"
                AND existing_default."is_default" = true
            )
          RETURNING rg."organization_id", rg."id"
        ),
        inserted_defaults AS (
          INSERT INTO "recruiting_group" (
            "created_at",
            "created_by",
            "id",
            "is_default",
            "name",
            "organization_id",
            "updated_at"
          )
          SELECT
            now(),
            workspaces."owner_user_id",
            'rg_' || md5(workspaces."organization_id" || ':default_recruiting_group'),
            true,
            ${DEFAULT_RECRUITING_GROUP_NAME},
            workspaces."organization_id",
            now()
          FROM workspaces
          WHERE
            NOT EXISTS (
              SELECT 1
              FROM "recruiting_group" AS existing_default
              WHERE
                existing_default."organization_id" = workspaces."organization_id"
                AND existing_default."is_default" = true
            )
            AND NOT EXISTS (
              SELECT 1
              FROM "recruiting_group" AS existing_named
              WHERE
                existing_named."organization_id" = workspaces."organization_id"
                AND existing_named."name" = ${DEFAULT_RECRUITING_GROUP_NAME}
            )
          ON CONFLICT DO NOTHING
          RETURNING "organization_id", "id"
        ),
        default_groups AS (
          SELECT DISTINCT ON (rg."organization_id")
            rg."organization_id",
            rg."id"
          FROM "recruiting_group" AS rg
          WHERE rg."is_default" = true
          ORDER BY rg."organization_id", rg."created_at" ASC, rg."id" ASC
        ),
        target_members AS (
          SELECT
            m."organization_id",
            default_groups."id" AS "group_id",
            m."user_id",
            CASE
              WHEN m."role" = 'owner' THEN 'recruitingSupervisor'
              ELSE 'hr'
            END AS "role",
            owner_member."user_id" AS "created_by"
          FROM "member" AS m
          INNER JOIN default_groups
            ON default_groups."organization_id" = m."organization_id"
          LEFT JOIN owner_member
            ON owner_member."organization_id" = m."organization_id"
        ),
        upserted_memberships AS (
          INSERT INTO "recruiting_group_member" (
            "created_at",
            "created_by",
            "group_id",
            "id",
            "organization_id",
            "role",
            "updated_at",
            "user_id"
          )
          SELECT
            now(),
            target_members."created_by",
            target_members."group_id",
            'rgm_' || md5(
              target_members."organization_id" || ':' ||
              target_members."group_id" || ':' ||
              target_members."user_id"
            ),
            target_members."organization_id",
            target_members."role",
            now(),
            target_members."user_id"
          FROM target_members
          ON CONFLICT ("organization_id", "group_id", "user_id") DO UPDATE
          SET
            "role" = EXCLUDED."role",
            "updated_at" = now()
          WHERE "recruiting_group_member"."role" IS DISTINCT FROM EXCLUDED."role"
          RETURNING (xmax = 0) AS "inserted"
        )
        SELECT
          (SELECT count(*) FROM "organization") AS "organizationCount",
          (SELECT count(*) FROM "member") AS "workspaceMemberCount",
          (SELECT count(*) FROM inserted_defaults) AS "insertedDefaultGroupCount",
          (SELECT count(*) FROM marked_named_default) AS "markedExistingGroupCount",
          (SELECT count(*) FROM target_members) AS "targetMembershipCount",
          (SELECT count(*) FROM upserted_memberships WHERE "inserted" = true) AS "insertedMembershipCount",
          (SELECT count(*) FROM upserted_memberships WHERE "inserted" = false) AS "updatedMembershipCount"
      `;

      if (!mutationStats) {
        throw new Error("Repair query did not return stats.");
      }

      const [finalStats] = await tx<RepairFinalStats[]>`
        WITH default_groups AS (
          SELECT DISTINCT ON (rg."organization_id")
            rg."organization_id",
            rg."id"
          FROM "recruiting_group" AS rg
          WHERE rg."is_default" = true
          ORDER BY rg."organization_id", rg."created_at" ASC, rg."id" ASC
        )
        SELECT
          (SELECT count(*) FROM "recruiting_group" WHERE "is_default" = true) AS "defaultGroupCount",
          (
            SELECT count(*)
            FROM "recruiting_group_member" AS rgm
            INNER JOIN default_groups
              ON default_groups."organization_id" = rgm."organization_id"
              AND default_groups."id" = rgm."group_id"
          ) AS "defaultGroupMembershipCount"
      `;

      if (!finalStats) {
        throw new Error("Final stats query did not return stats.");
      }
      return { ...mutationStats, ...finalStats };
    });

    printStats(stats);
  } finally {
    await sql.end();
  }
}

try {
  await main();
} catch (error) {
  console.error("Default recruiting group repair failed.");
  console.error(error);
  process.exitCode = 1;
}
