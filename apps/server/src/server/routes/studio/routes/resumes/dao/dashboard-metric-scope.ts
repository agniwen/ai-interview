import { recruitingRecord } from "@app/db-schema/schema";
import { eq, ne, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

interface RecruitingRecordReference {
  organizationId: AnyPgColumn;
  recruitingRecordId: AnyPgColumn;
}

export function buildNonArchivedRecruitingRecordFilter(reference: RecruitingRecordReference) {
  return sql<boolean>`exists (
    select 1
    from ${recruitingRecord}
    where ${eq(recruitingRecord.id, reference.recruitingRecordId)}
      and ${eq(recruitingRecord.organizationId, reference.organizationId)}
      and ${ne(recruitingRecord.outcome, "archived")}
  )`;
}
