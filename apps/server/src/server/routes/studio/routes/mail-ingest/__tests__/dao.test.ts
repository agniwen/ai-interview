import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../../../../lib/server/db/index";
import { encryptMailIngestSecret } from "../../../../../../lib/server/mail-ingest-crypto";
import {
  mailIngestAccount,
  mailIngestMessage,
  member,
  organization,
  user,
} from "@arc/db-schema/schema";
import {
  claimMailIngestMessageForProcessing,
  createMailIngestAccount,
  finishMailIngestAccountRun,
  getMailIngestAccountLoginConfig,
  listEnabledMailIngestAccounts,
  listWorkspaceMailIngestAccounts,
  mailIngestAccountExistsInOrg,
  markMailIngestMessageSkipped,
  queryPaginatedPlatformMailIngestAccounts,
  queryPaginatedWorkspaceMailIngestAccounts,
  updateMailIngestMessageResult,
  updateMailIngestAccount,
} from "../dao";

const ORG = "test_mail_ingest_org";
const OTHER_ORG = "test_mail_ingest_other_org";
const OWNER = "test_mail_ingest_owner";
const MEMBER = "test_mail_ingest_member";
const OUTSIDER = "test_mail_ingest_outsider";
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
        email: "owner@mail-ingest.test",
        emailVerified: true,
        id: OWNER,
        name: "Owner",
        updatedAt: NOW,
      },
      {
        createdAt: NOW,
        email: "member@mail-ingest.test",
        emailVerified: true,
        id: MEMBER,
        name: "Member",
        updatedAt: NOW,
      },
      {
        createdAt: NOW,
        email: "outsider@mail-ingest.test",
        emailVerified: true,
        id: OUTSIDER,
        name: "Outsider",
        updatedAt: NOW,
      },
    ]);
    await db.insert(organization).values([
      { createdAt: NOW, id: ORG, name: "Mail Ingest Org", slug: "mail-ingest-org" },
      {
        createdAt: NOW,
        id: OTHER_ORG,
        name: "Other Mail Ingest Org",
        slug: "other-mail-ingest-org",
      },
    ]);
    await db.insert(member).values([
      {
        createdAt: NOW,
        id: "m_mail_ingest_owner",
        organizationId: ORG,
        role: "owner",
        userId: OWNER,
      },
      {
        createdAt: NOW,
        id: "m_mail_ingest_member",
        organizationId: ORG,
        role: "member",
        userId: MEMBER,
      },
      {
        createdAt: NOW,
        id: "m_mail_ingest_outsider",
        organizationId: OTHER_ORG,
        role: "owner",
        userId: OUTSIDER,
      },
    ]);
    await db.insert(mailIngestAccount).values([
      {
        createdAt: NOW,
        emailAddress: "owner-listener@mail-ingest.test",
        enabled: true,
        encryptedPassword: encryptMailIngestSecret("owner-password"),
        failedMailbox: "ARC-Failed",
        id: "mail_ingest_owner_account",
        imapHost: "imap.mail-ingest.test",
        imapPort: 993,
        imapSecure: true,
        mailbox: "INBOX",
        organizationId: ORG,
        processedMailbox: "ARC-Processed",
        subjectKeyword: "boss直聘",
        updatedAt: NOW,
        userId: OWNER,
        username: "owner-listener@mail-ingest.test",
      },
      {
        createdAt: NOW,
        emailAddress: "outsider-listener@mail-ingest.test",
        enabled: true,
        encryptedPassword: encryptMailIngestSecret("outsider-password"),
        failedMailbox: "ARC-Failed",
        id: "mail_ingest_outsider_account",
        imapHost: "imap.mail-ingest.test",
        imapPort: 993,
        imapSecure: true,
        mailbox: "INBOX",
        organizationId: OTHER_ORG,
        processedMailbox: "ARC-Processed",
        subjectKeyword: "boss直聘",
        updatedAt: NOW,
        userId: OUTSIDER,
        username: "outsider-listener@mail-ingest.test",
      },
    ]);
  }, 30_000);

  afterEach(cleanup, 30_000);

  it("lists every workspace member with their mail ingest account state", async () => {
    const rows = await listWorkspaceMailIngestAccounts(ORG);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.user.email)).toEqual([
      "owner@mail-ingest.test",
      "member@mail-ingest.test",
    ]);
    expect(rows[0]?.account).toMatchObject({
      emailAddress: "owner-listener@mail-ingest.test",
      enabled: true,
      hasPassword: true,
      listenStartAt: null,
      username: "owner-listener@mail-ingest.test",
    });
    expect(rows[1]?.account).toBeNull();
    expect(rows.some((row) => row.user.id === OUTSIDER)).toBe(false);
  }, 30_000);

  it("can scope the workspace mail ingest list to one member", async () => {
    const rows = await listWorkspaceMailIngestAccounts(ORG, { userId: MEMBER });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.user.id).toBe(MEMBER);
    expect(rows[0]?.account).toBeNull();
  }, 30_000);

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
    expect(result.records[0]?.user.email).toBe("member@mail-ingest.test");
    expect(result.records[0]?.account).toBeNull();
  }, 30_000);

  it("searches workspace mail ingest account fields", async () => {
    const result = await queryPaginatedWorkspaceMailIngestAccounts(ORG, {
      search: "owner-listener",
    });

    expect(result.total).toBe(1);
    expect(result.records[0]?.user.id).toBe(OWNER);
    expect(result.records[0]?.account?.emailAddress).toBe("owner-listener@mail-ingest.test");
  }, 30_000);

  it("searches workspace member fields for unconfigured accounts", async () => {
    const result = await queryPaginatedWorkspaceMailIngestAccounts(ORG, {
      search: "member@mail-ingest.test",
    });

    expect(result.total).toBe(1);
    expect(result.records[0]?.user.id).toBe(MEMBER);
    expect(result.records[0]?.account).toBeNull();
  }, 30_000);

  it("lists mail ingest rows across all organizations for platform administration", async () => {
    const result = await queryPaginatedPlatformMailIngestAccounts(
      { search: "Mail Ingest Org" },
      { page: "1", pageSize: "10" },
    );

    expect(result.total).toBe(3);
    expect(result.records.map((row) => row.organization.id)).toEqual([ORG, OTHER_ORG, ORG]);
    expect(result.records.map((row) => row.user.id)).toEqual([OWNER, OUTSIDER, MEMBER]);
    expect(result.records[0]?.account?.emailAddress).toBe("owner-listener@mail-ingest.test");
    expect(result.records[1]?.account?.emailAddress).toBe("outsider-listener@mail-ingest.test");
    expect(result.records[2]?.account).toBeNull();
  }, 30_000);

  it("searches platform mail ingest rows by organization fields", async () => {
    const result = await queryPaginatedPlatformMailIngestAccounts({
      search: "other-mail-ingest-org",
    });

    expect(result.total).toBe(1);
    expect(result.records[0]?.organization.id).toBe(OTHER_ORG);
    expect(result.records[0]?.user.id).toBe(OUTSIDER);
  }, 30_000);

  it("defaults new mail ingest accounts to listen from creation time", async () => {
    const before = new Date();
    const account = await createMailIngestAccount({
      input: {
        emailAddress: "member-listener@mail-ingest.test",
        enabled: true,
        failedMailbox: "ARC-Failed",
        imapHost: "imap.mail-ingest.test",
        imapPort: 993,
        imapSecure: true,
        mailbox: "INBOX",
        password: "member-password",
        processedMailbox: "ARC-Processed",
        subjectKeyword: "boss直聘",
        username: "member-listener@mail-ingest.test",
      },
      organizationId: ORG,
      userId: MEMBER,
    });
    const after = new Date();

    expect(account.listenStartAt).not.toBeNull();
    const listenStartAt = new Date(account.listenStartAt ?? "");
    expect(listenStartAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(listenStartAt.getTime()).toBeLessThanOrEqual(after.getTime());
  }, 30_000);

  it("stores IMAP command response details in account errors", async () => {
    // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
    const error = new Error("Command failed") as Error & {
      responseStatus?: string;
      responseText?: string;
    };
    error.responseStatus = "NO";
    error.responseText = "Too many simultaneous connections";

    await finishMailIngestAccountRun("mail_ingest_owner_account", { error });

    const [row] = await db
      .select({ lastError: mailIngestAccount.lastError })
      .from(mailIngestAccount)
      .where(eq(mailIngestAccount.id, "mail_ingest_owner_account"))
      .limit(1);

    expect(row?.lastError).toContain("Command failed");
    expect(row?.lastError).toContain("NO");
    expect(row?.lastError).toContain("Too many simultaneous connections");
  }, 30_000);

  it("limits immediate polling accounts to one workspace", async () => {
    const accounts = await listEnabledMailIngestAccounts(20, { organizationId: ORG });

    expect(accounts.map((account) => account.id)).toEqual(["mail_ingest_owner_account"]);
  });

  it("clears saved account errors and ignores a stale poll completion", async () => {
    const pollingStartedAt = new Date("2026-06-18T10:01:00.000Z");
    await db
      .update(mailIngestAccount)
      .set({ lastError: "old poll error", pollingStartedAt })
      .where(eq(mailIngestAccount.id, "mail_ingest_owner_account"));

    await updateMailIngestAccount({
      id: "mail_ingest_owner_account",
      input: { enabled: true },
      organizationId: ORG,
      userId: OWNER,
    });
    await finishMailIngestAccountRun("mail_ingest_owner_account", {
      error: new Error("stale LOGIN failed"),
      pollingStartedAt,
    });

    const [row] = await db
      .select({
        lastError: mailIngestAccount.lastError,
        pollingStartedAt: mailIngestAccount.pollingStartedAt,
      })
      .from(mailIngestAccount)
      .where(eq(mailIngestAccount.id, "mail_ingest_owner_account"))
      .limit(1);

    expect(row?.lastError).toBeNull();
    expect(row?.pollingStartedAt).toBeNull();
  }, 30_000);

  it("getMailIngestAccountLoginConfig rejects an account owned by a different user in the same org", async () => {
    const asDifferentUser = await getMailIngestAccountLoginConfig({
      id: "mail_ingest_owner_account",
      organizationId: ORG,
      userId: MEMBER,
    });
    expect(asDifferentUser).toBeNull();

    const asOwner = await getMailIngestAccountLoginConfig({
      id: "mail_ingest_owner_account",
      organizationId: ORG,
      userId: OWNER,
    });
    expect(asOwner).not.toBeNull();
    expect(asOwner?.username).toBe("owner-listener@mail-ingest.test");

    const wrongOrg = await getMailIngestAccountLoginConfig({
      id: "mail_ingest_owner_account",
      organizationId: OTHER_ORG,
      userId: OWNER,
    });
    expect(wrongOrg).toBeNull();
  }, 30_000);

  it("mailIngestAccountExistsInOrg: true same-org, false cross-org/missing", async () => {
    await expect(
      mailIngestAccountExistsInOrg({ id: "mail_ingest_owner_account", organizationId: ORG }),
    ).resolves.toBe(true);
    await expect(
      mailIngestAccountExistsInOrg({ id: "mail_ingest_owner_account", organizationId: OTHER_ORG }),
    ).resolves.toBe(false);
    await expect(
      mailIngestAccountExistsInOrg({ id: "does_not_exist", organizationId: ORG }),
    ).resolves.toBe(false);
  }, 30_000);
});

describe("mail ingest observability writers", () => {
  const OBS_ORG = "test_mail_ingest_obs_org";
  const OBS_USER = "test_mail_ingest_obs_user";

  async function obsCleanup() {
    await db.delete(mailIngestAccount).where(eq(mailIngestAccount.organizationId, OBS_ORG));
    await db.delete(member).where(eq(member.organizationId, OBS_ORG));
    await db.delete(organization).where(eq(organization.id, OBS_ORG));
    await db.delete(user).where(eq(user.id, OBS_USER));
    await db.delete(user).where(eq(user.id, "obs_noacct_user"));
  }

  beforeEach(obsCleanup, 30_000);
  afterEach(obsCleanup, 30_000);

  async function insertTestAccount(): Promise<string> {
    await db.insert(user).values({
      createdAt: NOW,
      email: "obs-user@mail-ingest.test",
      emailVerified: true,
      id: OBS_USER,
      name: "Obs User",
      updatedAt: NOW,
    });
    await db.insert(organization).values({
      createdAt: NOW,
      id: OBS_ORG,
      name: "Obs Org",
      slug: "obs-org",
    });
    await db.insert(member).values({
      createdAt: NOW,
      id: "m_mail_ingest_obs_member",
      organizationId: OBS_ORG,
      role: "owner",
      userId: OBS_USER,
    });
    const account = await createMailIngestAccount({
      input: {
        emailAddress: "obs-listener@mail-ingest.test",
        enabled: true,
        failedMailbox: "ARC-Failed",
        imapHost: "imap.mail-ingest.test",
        imapPort: 993,
        imapSecure: true,
        mailbox: "INBOX",
        password: "obs-password",
        processedMailbox: "ARC-Processed",
        subjectKeyword: "boss直聘",
        username: "obs-listener@mail-ingest.test",
      },
      organizationId: OBS_ORG,
      userId: OBS_USER,
    });
    return account.id;
  }

  it("updateMailIngestMessageResult persists observability fields", async () => {
    const accountId = await insertTestAccount();
    const claim = await claimMailIngestMessageForProcessing({
      accountId,
      fromAddress: null,
      mailbox: "INBOX",
      messageId: null,
      receivedAt: new Date(),
      subject: "s",
      uid: "1",
      uidValidity: "1",
    });
    await updateMailIngestMessageResult(claim.id, {
      attachmentCount: 2,
      batchId: null,
      boundJobDescriptionId: null,
      extractedJobCodes: ["AUR0001"],
      jdBindStatus: "bound",
      resumeAttachmentCount: 1,
      status: "queued",
    });
    const [row] = await db
      .select()
      .from(mailIngestMessage)
      .where(eq(mailIngestMessage.id, claim.id));
    expect(row.status).toBe("queued");
    expect(row.jdBindStatus).toBe("bound");
    expect(row.extractedJobCodes).toEqual(["AUR0001"]);
    expect(row.resumeAttachmentCount).toBe(1);
    expect(row.attachmentCount).toBe(2);
  }, 30_000);

  it("markMailIngestMessageSkipped writes skipped + reason", async () => {
    const accountId = await insertTestAccount();
    const claim = await claimMailIngestMessageForProcessing({
      accountId,
      fromAddress: null,
      mailbox: "INBOX",
      messageId: null,
      receivedAt: new Date(),
      subject: "s",
      uid: "2",
      uidValidity: "1",
    });
    await markMailIngestMessageSkipped(claim.id, "no_supported_attachment", {
      attachmentCount: 3,
      resumeAttachmentCount: 0,
    });
    const [row] = await db
      .select()
      .from(mailIngestMessage)
      .where(eq(mailIngestMessage.id, claim.id));
    expect(row.status).toBe("skipped");
    expect(row.skipReason).toBe("no_supported_attachment");
    expect(row.resumeAttachmentCount).toBe(0);
  }, 30_000);

  it("finishMailIngestAccountRun persists last-run counts", async () => {
    const accountId = await insertTestAccount();
    await finishMailIngestAccountRun(accountId, {
      counts: { failed: 1, matched: 3, queued: 2, received: 5, subjectSkipped: 2 },
    });
    const [row] = await db
      .select()
      .from(mailIngestAccount)
      .where(eq(mailIngestAccount.id, accountId));
    expect(row.lastRunReceived).toBe(5);
    expect(row.lastRunSubjectSkipped).toBe(2);
    expect(row.lastRunQueued).toBe(2);
  }, 30_000);

  it("projects messageCount/problemCount/lastRun* on workspace rows", async () => {
    const accountId = await insertTestAccount();
    await finishMailIngestAccountRun(accountId, {
      counts: { failed: 1, matched: 3, queued: 2, received: 5, subjectSkipped: 2 },
    });
    await db.insert(mailIngestMessage).values([
      { accountId, id: "m_ok_1", mailbox: "INBOX", status: "queued", uid: "1", uidValidity: "1" },
      { accountId, id: "m_ok_2", mailbox: "INBOX", status: "queued", uid: "2", uidValidity: "1" },
      { accountId, id: "m_fail", mailbox: "INBOX", status: "failed", uid: "3", uidValidity: "1" },
      { accountId, id: "m_skip", mailbox: "INBOX", status: "skipped", uid: "4", uidValidity: "1" },
    ]);

    const { records } = await queryPaginatedWorkspaceMailIngestAccounts(OBS_ORG);
    const row = records.find((r) => r.account?.id === accountId);

    expect(row?.messageCount).toBe(4);
    expect(row?.problemCount).toBe(2);
    expect(row?.lastRunReceived).toBe(5);
    expect(row?.lastRunFailed).toBe(1);
    expect(row?.lastRunMatched).toBe(3);
  }, 30_000);

  it("returns account===null member rows with messageCount 0", async () => {
    // insertTestAccount 建了 OBS_ORG + OBS_USER(owner)。再加一个无账号成员：
    await insertTestAccount();
    await db.insert(user).values({
      createdAt: NOW,
      email: "obs-noacct@mail-ingest.test",
      emailVerified: true,
      id: "obs_noacct_user",
      name: "No Account",
      updatedAt: NOW,
    });
    await db.insert(member).values({
      createdAt: NOW,
      id: "m_obs_noacct",
      organizationId: OBS_ORG,
      role: "member",
      userId: "obs_noacct_user",
    });

    const { records } = await queryPaginatedWorkspaceMailIngestAccounts(OBS_ORG);
    const noAcct = records.find((r) => r.user.id === "obs_noacct_user");

    expect(noAcct?.account).toBeNull();
    expect(noAcct?.messageCount).toBe(0);
  }, 30_000);

  it("platform rows also carry the new counts (mapper type parity)", async () => {
    const accountId = await insertTestAccount();
    await db.insert(mailIngestMessage).values([
      {
        accountId,
        id: "mp_fail",
        mailbox: "INBOX",
        status: "failed",
        uid: "9",
        uidValidity: "1",
      },
    ]);
    const { records } = await queryPaginatedPlatformMailIngestAccounts();
    const row = records.find((r) => r.account?.id === accountId);
    expect(row?.messageCount).toBe(1);
    expect(row?.problemCount).toBe(1);
  }, 30_000);
});
