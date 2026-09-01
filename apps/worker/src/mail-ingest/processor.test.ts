import { describe, expect, it } from "vitest";
import type { WorkerMailIngestAccount } from "@app/server/worker/mail-ingest";
import { getMailIngestGroupListenStart, groupMailIngestAccounts } from "./account-groups";

function account(input: Partial<WorkerMailIngestAccount>): WorkerMailIngestAccount {
  return {
    dedupPolicy: "skip",
    emailAddress: input.emailAddress ?? "hr@example.com",
    failedMailbox: "ARC-Failed",
    id: input.id ?? crypto.randomUUID(),
    imapHost: input.imapHost ?? "imap.example.com",
    imapPort: input.imapPort ?? 993,
    imapSecure: input.imapSecure ?? true,
    jdMode: "none",
    jobDescriptionId: null,
    listenStartAt: Object.hasOwn(input, "listenStartAt")
      ? (input.listenStartAt ?? null)
      : new Date("2026-06-18T10:00:00.000Z"),
    mailbox: input.mailbox ?? "INBOX",
    organizationId: input.organizationId ?? "org_a",
    password: input.password ?? "secret",
    processedMailbox: "ARC-Processed",
    resumePoolScope: "private",
    subjectKeyword: input.subjectKeyword ?? "boss直聘",
    target: "resume_pool",
    userId: input.userId ?? "user_a",
    username: input.username ?? "hr@example.com",
  };
}

describe("mail ingest account grouping", () => {
  it("groups accounts with the same IMAP login so one mailbox poll can fan out to multiple workspaces", () => {
    const groups = groupMailIngestAccounts([
      account({ id: "a", organizationId: "org_a" }),
      account({ id: "b", organizationId: "org_b" }),
      account({ id: "c", organizationId: "org_c", username: "other@example.com" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.accounts.map((item) => item.id)).toEqual(["a", "b"]);
    expect(groups[1]?.accounts.map((item) => item.id)).toEqual(["c"]);
  });

  it("uses the earliest listen start for the grouped IMAP search", () => {
    const groups = groupMailIngestAccounts([
      account({ id: "newer", listenStartAt: new Date("2026-06-18T10:00:00.000Z") }),
      account({ id: "older", listenStartAt: new Date("2026-06-17T10:00:00.000Z") }),
    ]);

    expect(getMailIngestGroupListenStart(groups[0]?.accounts ?? [])?.toISOString()).toBe(
      "2026-06-17T10:00:00.000Z",
    );
  });

  it("searches all messages for a grouped mailbox if any account has no listen start", () => {
    const groups = groupMailIngestAccounts([
      account({ id: "bounded", listenStartAt: new Date("2026-06-18T10:00:00.000Z") }),
      account({ id: "all", listenStartAt: null }),
    ]);

    expect(getMailIngestGroupListenStart(groups[0]?.accounts ?? [])).toBeNull();
  });
});
