import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "../../../../../../lib/server/db/index";
import { organization, studioInterview, user } from "@app/db-schema/schema";
import { queryPaginatedResumeRecords } from "../dao/resumes";
import { PROFILE_WITH_HIGHLIGHTS } from "../../resume-pool/__tests__/fixtures";

const ORGS = ["keyword_search_org_a", "keyword_search_org_b"];
const USERS = ["keyword_search_owner", "keyword_search_other"];

async function cleanup() {
  await db.delete(studioInterview).where(inArray(studioInterview.organizationId, ORGS));
  await db.delete(organization).where(inArray(organization.id, ORGS));
  await db.delete(user).where(inArray(user.id, USERS));
}

beforeAll(async () => {
  await cleanup();
  const now = new Date();
  await db.insert(user).values(
    USERS.map((id) => ({
      createdAt: now,
      email: `${id}@example.com`,
      emailVerified: false,
      id,
      name: id,
      updatedAt: now,
    })),
  );
  await db.insert(organization).values(
    ORGS.map((id) => ({
      createdAt: now,
      id,
      name: id,
      slug: id,
    })),
  );
  await db.insert(studioInterview).values([
    {
      candidateName: "甲",
      createdBy: USERS[0],
      id: "keyword_search_a",
      organizationId: ORGS[0],
      resumeProfile: PROFILE_WITH_HIGHLIGHTS,
    },
    {
      candidateName: "乙",
      createdBy: USERS[1],
      id: "keyword_search_b",
      organizationId: ORGS[0],
      resumeProfile: PROFILE_WITH_HIGHLIGHTS,
    },
    {
      candidateName: "丙",
      createdBy: USERS[0],
      id: "keyword_search_c",
      organizationId: ORGS[1],
      resumeProfile: PROFILE_WITH_HIGHLIGHTS,
    },
  ]);
});

afterAll(cleanup);

it("searches company and school names with consistent totals, pages and creator visibility", async () => {
  const first = await queryPaginatedResumeRecords(
    ORGS[0],
    { search: "极光" },
    { page: 1, pageSize: 1 },
  );
  const second = await queryPaginatedResumeRecords(
    ORGS[0],
    { search: "极光" },
    { page: 2, pageSize: 1 },
  );
  const school = await queryPaginatedResumeRecords(ORGS[0], { search: "华南农业" }, undefined, {
    kind: "restricted",
    userIds: [USERS[0]],
  });
  expect(first.total).toBe(2);
  expect(second.total).toBe(2);
  expect(first.records).toHaveLength(1);
  expect(second.records).toHaveLength(1);
  expect(first.records[0]?.id).not.toBe(second.records[0]?.id);
  expect(school.total).toBe(1);
  expect(school.records[0]?.id).toBe("keyword_search_a");
  expect(first.records[0]).not.toHaveProperty("searchText");
  expect(first.records[0]).not.toHaveProperty("searchCjkBigrams");
});
