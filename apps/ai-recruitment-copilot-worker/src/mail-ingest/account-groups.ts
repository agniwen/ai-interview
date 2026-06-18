import type { WorkerMailIngestAccount } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/mail-ingest/dao";

export interface MailIngestAccountGroup {
  accounts: WorkerMailIngestAccount[];
  key: string;
}

function getConnectionKey(account: WorkerMailIngestAccount): string {
  return JSON.stringify({
    host: account.imapHost,
    mailbox: account.mailbox,
    password: account.password,
    port: account.imapPort,
    secure: account.imapSecure,
    username: account.username,
  });
}

export function groupMailIngestAccounts(
  accounts: WorkerMailIngestAccount[],
): MailIngestAccountGroup[] {
  const groups = new Map<string, WorkerMailIngestAccount[]>();
  for (const account of accounts) {
    const key = getConnectionKey(account);
    const group = groups.get(key);
    if (group) {
      group.push(account);
      continue;
    }
    groups.set(key, [account]);
  }
  return Array.from(groups, ([key, groupAccounts]) => ({ accounts: groupAccounts, key }));
}

export function getMailIngestGroupListenStart(accounts: WorkerMailIngestAccount[]): Date | null {
  if (accounts.some((account) => account.listenStartAt === null)) {
    return null;
  }
  const timestamps = accounts
    .map((account) => account.listenStartAt?.getTime())
    .filter((value): value is number => typeof value === "number");
  if (timestamps.length === 0) {
    return null;
  }
  return new Date(Math.min(...timestamps));
}
