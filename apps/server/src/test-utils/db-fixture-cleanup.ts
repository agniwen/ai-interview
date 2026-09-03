/**
 * FK-safe cleanup helpers for backend integration tests that share real Postgres.
 *
 * Several resume-pool columns use ON DELETE SET NULL against organization/user:
 *   - resume_pool_item.organization_id / created_by / published_by / source_*
 *   - resume_pool_event.organization_id / actor_id
 *
 * If tests delete the parent org/user first (or only match pool rows by
 * organization_id after it was already nullified), the pool row becomes a
 * null-org orphan and still shows up in the public 人才库. Always delete pool
 * rows by every fixture ownership key *before* deleting orgs/users.
 */

import { eq, like, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "../lib/server/db/index";
import { resumePoolItem } from "@app/db-schema/schema";

export interface ResumePoolFixtureOwners {
  /** Organization ids used by this suite's fixtures. */
  organizationIds?: readonly string[];
  /**
   * Storage-key prefixes unique to this suite (e.g. `storage/test/bulk-dao/`).
   * Prefer suite-specific prefixes so parallel tests do not wipe each other.
   */
  storageKeyPrefixes?: readonly string[];
  /** User ids used by this suite's fixtures. */
  userIds?: readonly string[];
}

/**
 * Delete resume_pool_item rows owned by the given fixture orgs/users/storage
 * prefixes. Events cascade via pool_item_id ON DELETE CASCADE.
 */
export async function deleteFixtureResumePoolItems(owners: ResumePoolFixtureOwners): Promise<void> {
  const conditions: SQL[] = [];

  for (const organizationId of owners.organizationIds ?? []) {
    conditions.push(eq(resumePoolItem.organizationId, organizationId));
    conditions.push(eq(resumePoolItem.sourceOrganizationId, organizationId));
  }
  for (const userId of owners.userIds ?? []) {
    conditions.push(eq(resumePoolItem.createdBy, userId));
    conditions.push(eq(resumePoolItem.sourceUserId, userId));
    conditions.push(eq(resumePoolItem.publishedBy, userId));
  }
  for (const prefix of owners.storageKeyPrefixes ?? []) {
    conditions.push(like(resumePoolItem.resumeStorageKey, `${prefix}%`));
  }

  if (conditions.length === 0) {
    return;
  }

  await db.delete(resumePoolItem).where(or(...conditions));
}
