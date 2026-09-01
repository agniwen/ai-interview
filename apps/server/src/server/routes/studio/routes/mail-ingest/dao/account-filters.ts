import { buildListTextFilterWhere } from "../../../../../../lib/server/db/list-text-filters";
import { and, eq, ilike, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { mailIngestAccount, member, organization, user as userTable } from "@arc/db-schema/schema";

export function buildWorkspaceMailIngestFilters({
  organizationId,
  textFilters,
  search,
  userId,
}: {
  organizationId: string;
  textFilters?: string;
  search?: string;
  userId?: string;
}) {
  const filters: SQL[] = [eq(member.organizationId, organizationId)];
  if (userId) {
    filters.push(eq(member.userId, userId));
  }
  if (search) {
    const pattern = `%${search}%`;
    const searchCondition = or(
      ilike(userTable.name, pattern),
      ilike(userTable.email, pattern),
      ilike(mailIngestAccount.emailAddress, pattern),
      ilike(mailIngestAccount.username, pattern),
      ilike(mailIngestAccount.imapHost, pattern),
      ilike(mailIngestAccount.subjectKeyword, pattern),
    );
    if (searchCondition) {
      filters.push(searchCondition);
    }
  }
  return and(
    ...filters,
    buildListTextFilterWhere("mailAccounts", textFilters, {
      emailAddress: mailIngestAccount.emailAddress,
      imapHost: mailIngestAccount.imapHost,
      memberEmail: userTable.email,
      memberName: userTable.name,
      subjectKeyword: mailIngestAccount.subjectKeyword,
      username: mailIngestAccount.username,
    }),
  );
}

export function buildPlatformMailIngestFilters({
  textFilters,
  search,
}: {
  textFilters?: string;
  search?: string;
}) {
  const atomic = buildListTextFilterWhere("platformMailAccounts", textFilters, {
    emailAddress: mailIngestAccount.emailAddress,
    imapHost: mailIngestAccount.imapHost,
    memberEmail: userTable.email,
    memberName: userTable.name,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    subjectKeyword: mailIngestAccount.subjectKeyword,
    username: mailIngestAccount.username,
  });
  if (search) {
    const pattern = `%${search}%`;
    return and(
      atomic,
      or(
        ilike(organization.name, pattern),
        ilike(organization.slug, pattern),
        ilike(userTable.name, pattern),
        ilike(userTable.email, pattern),
        ilike(mailIngestAccount.emailAddress, pattern),
        ilike(mailIngestAccount.username, pattern),
        ilike(mailIngestAccount.imapHost, pattern),
        ilike(mailIngestAccount.subjectKeyword, pattern),
      ),
    );
  }
  return atomic;
}
