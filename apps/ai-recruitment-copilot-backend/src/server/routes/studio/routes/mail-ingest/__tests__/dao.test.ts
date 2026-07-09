import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { encryptMailIngestSecret } from "@arc/ai-recruitment-copilot-backend/lib/server/mail-ingest-crypto";
import { mailIngestAccount, member, organization, user } from "@arc/db-schema/schema";
import { createFixtureNamespace } from "../../../../../../test-utils/fixture-id";
import {
  createMailIngestAccount,
  finishMailIngestAccountRun,
  listWorkspaceMailIngestAccounts,
  queryPaginatedPlatformMailIngestAccounts,
  queryPaginatedWorkspaceMailIngestAccounts,
} from "../dao";

// Worker-scoped unique suffix — required for fileParallelism across Vitest forks.
const RUN = createFixtureNamespace("mi");
const ORG = `${RUN}_org`;
const OTHER_ORG = `${RUN}_other_org`;
const OWNER = `${RUN}_owner`;
const MEMBER = `${RUN}_member`;
const OUTSIDER = `${RUN}_outsider`;
const OWNER_ACCOUNT = `${RUN}_owner_account`;
const OUTSIDER_ACCOUNT = `${RUN}_outsider_account`;
const OWNER_MEMBER = `${RUN}_m_owner`;
const MEMBER_MEMBER = `${RUN}_m_member`;
const OUTSIDER_MEMBER = `${RUN}_m_outsider`;
const NOW = new Date("2026-06-18T10:00:00.000Z");

process.env.MAIL_INGEST_SECRET_KEY ??= "mail-ingest-test-secret";

async function cleanup() {
  await db.delete(mailIngestAccount).where(eq(mailIngestAccount.organizationId, ORG));
  await db.delete(mailIngestAccount).where(eq(mailIngestAccount.organizationId, OTHER_ORG));
  await db.delete(member).where(eq(member.organizationId, ORG));
  await db.delete(member).where(eq(member.organizationId, OTHER_ORG));
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(organization).where(eq(organization.id, OTHER_ORG));
  await db.delete(user).where(eq(user.id, OWNER));
  await db.delete(user).where(eq(user.id, MEMBER));
  await db.delete(user).where(eq(user.id, OUTSIDER));
}

describe("mail ingest workspace administration dao", () => {
  beforeEach(async () => {
    await cleanup();
    await db.insert(user).values([
      {
        createdAt: NOW,
        email: `owner@${RUN}.test`,
        emailVerified: true,
        id: OWNER,
        name: "Owner",
        updatedAt: NOW,
      },
      {
        createdAt: NOW,
        email: `member@${RUN}.test`,
        emailVerified: true,
        id: MEMBER,
        name: "Member",
        updatedAt: NOW,
      },
      {
        createdAt: NOW,
        email: `outsider@${RUN}.test`,
        emailVerified: true,
        id: OUTSIDER,
        name: "Outsider",
        updatedAt: NOW,
      },
    ]);
    // Insert orgs one row at a time — multi-row inserts through a contended pool
    // have produced intermittent Postgres "invalid UTF8" wire-protocol errors.
    await db.insert(organization).values({
      createdAt: NOW,
      id: ORG,
      name: "Mail Ingest Org",
      slug: `${RUN}-org`,
    });
    await db.insert(organization).values({
      createdAt: NOW,
      id: OTHER_ORG,
      name: "Other Mail Ingest Org",
      slug: `${RUN}-other-org`,
    });
    await db.insert(member).values([
      {
        createdAt: NOW,
        id: OWNER_MEMBER,
        organizationId: ORG,
        role: "owner",
        userId: OWNER,
      },
      {
        createdAt: NOW,
        id: MEMBER_MEMBER,
        organizationId: ORG,
        role: "member",
        userId: MEMBER,
      },
      {
        createdAt: NOW,
        id: OUTSIDER_MEMBER,
        organizationId: OTHER_ORG,
        role: "owner",
        userId: OUTSIDER,
      },
    ]);
    await db.insert(mailIngestAccount).values([
      {
        createdAt: NOW,
        emailAddress: `owner-listener@${RUN}.test`,
        enabled: true,
        encryptedPassword: encryptMailIngestSecret("owner-password"),
        failedMailbox: "ARC-Failed",
        id: OWNER_ACCOUNT,
        imapHost: "imap.mail-ingest.test",
        imapPort: 993,
        imapSecure: true,
        mailbox: "INBOX",
        organizationId: ORG,
        processedMailbox: "ARC-Processed",
        // Keep fixture keywords ASCII so encoding issues are easier to diagnose.
        subjectKeyword: "boss-zhipin",
        updatedAt: NOW,
        userId: OWNER,
        username: `owner-listener@${RUN}.test`,
      },
      {
        createdAt: NOW,
        emailAddress: `outsider-listener@${RUN}.test`,
        enabled: true,
        encryptedPassword: encryptMailIngestSecret("outsider-password"),
        failedMailbox: "ARC-Failed",
        id: OUTSIDER_ACCOUNT,
        imapHost: "imap.mail-ingest.test",
        imapPort: 993,
        imapSecure: true,
        mailbox: "INBOX",
        organizationId: OTHER_ORG,
        processedMailbox: "ARC-Processed",
        subjectKeyword: "boss-zhipin",
        updatedAt: NOW,
        userId: OUTSIDER,
        username: `outsider-listener@${RUN}.test`,
      },
    ]);
  });

  afterEach(async () => {
    await cleanup();
  });

  it("lists every workspace member with their mail ingest account state", async () => {
    const rows = await listWorkspaceMailIngestAccounts(ORG);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.user.email)).toEqual([`owner@${RUN}.test`, `member@${RUN}.test`]);
    expect(rows[0]?.account).toMatchObject({
      emailAddress: `owner-listener@${RUN}.test`,
      enabled: true,
      hasPassword: true,
      listenStartAt: null,
      username: `owner-listener@${RUN}.test`,
    });
    expect(rows[1]?.account).toBeNull();
    expect(rows.some((row) => row.user.id === OUTSIDER)).toBe(false);
  });

  it("can scope the workspace mail ingest list to one member", async () => {
    const rows = await listWorkspaceMailIngestAccounts(ORG, { userId: MEMBER });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.user.id).toBe(MEMBER);
    expect(rows[0]?.account).toBeNull();
  });

  it("paginates workspace mail ingest rows", async () => {
    const result = await queryPaginatedWorkspaceMailIngestAccounts(
      ORG,
      {},
      { page: "2", pageSize: "1" },
    );

    expect(result).toMatchObject({
      page: 2,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.user.email).toBe(`member@${RUN}.test`);
    expect(result.records[0]?.account).toBeNull();
  });

  it("searches workspace mail ingest account fields", async () => {
    const result = await queryPaginatedWorkspaceMailIngestAccounts(ORG, {
      search: "owner-listener",
    });

    expect(result.total).toBe(1);
    expect(result.records[0]?.user.id).toBe(OWNER);
    expect(result.records[0]?.account?.emailAddress).toBe(`owner-listener@${RUN}.test`);
  });

  it("searches workspace member fields for unconfigured accounts", async () => {
    const result = await queryPaginatedWorkspaceMailIngestAccounts(ORG, {
      search: `member@${RUN}.test`,
    });

    expect(result.total).toBe(1);
    expect(result.records[0]?.user.id).toBe(MEMBER);
    expect(result.records[0]?.account).toBeNull();
  });

  it("lists mail ingest rows across all organizations for platform administration", async () => {
    const result = await queryPaginatedPlatformMailIngestAccounts(
      { search: `${RUN}.test` },
      { page: "1", pageSize: "10" },
    );

    expect(result.total).toBe(3);
    expect(result.records.map((row) => row.organization.id)).toEqual([ORG, OTHER_ORG, ORG]);
    expect(result.records.map((row) => row.user.id)).toEqual([OWNER, OUTSIDER, MEMBER]);
    expect(result.records[0]?.account?.emailAddress).toBe(`owner-listener@${RUN}.test`);
    expect(result.records[1]?.account?.emailAddress).toBe(`outsider-listener@${RUN}.test`);
    expect(result.records[2]?.account).toBeNull();
  });

  it("searches platform mail ingest rows by organization fields", async () => {
    const result = await queryPaginatedPlatformMailIngestAccounts({
      search: `${RUN}-other-org`,
    });

    expect(result.total).toBe(1);
    expect(result.records[0]?.organization.id).toBe(OTHER_ORG);
    expect(result.records[0]?.user.id).toBe(OUTSIDER);
  });

  it("defaults new mail ingest accounts to listen from creation time", async () => {
    const before = new Date();
    const account = await createMailIngestAccount({
      input: {
        emailAddress: `member-listener@${RUN}.test`,
        enabled: true,
        failedMailbox: "ARC-Failed",
        imapHost: "imap.mail-ingest.test",
        imapPort: 993,
        imapSecure: true,
        mailbox: "INBOX",
        password: "member-password",
        processedMailbox: "ARC-Processed",
        subjectKeyword: "boss-zhipin",
        username: `member-listener@${RUN}.test`,
      },
      organizationId: ORG,
      userId: MEMBER,
    });
    const after = new Date();

    expect(account.listenStartAt).not.toBeNull();
    const listenStartAt = new Date(account.listenStartAt ?? "");
    expect(listenStartAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(listenStartAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("stores IMAP command response details in account errors", async () => {
    const error = new Error("Command failed") as Error & {
      responseStatus?: string;
      responseText?: string;
    };
    error.responseStatus = "NO";
    error.responseText = "Too many simultaneous connections";

    await finishMailIngestAccountRun(OWNER_ACCOUNT, error);

    const [row] = await db
      .select({ lastError: mailIngestAccount.lastError })
      .from(mailIngestAccount)
      .where(eq(mailIngestAccount.id, OWNER_ACCOUNT))
      .limit(1);

    expect(row?.lastError).toContain("Command failed");
    expect(row?.lastError).toContain("NO");
    expect(row?.lastError).toContain("Too many simultaneous connections");
  });
});
