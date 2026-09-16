import { recruitingOffer } from "@app/db-schema/schema";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { buildNonArchivedRecruitingRecordFilter } from "./dashboard-metric-scope";

const dialect = new PgDialect();

describe("dashboard metric record scope", () => {
  it("links an event to its recruiting record and excludes archived records", () => {
    const query = dialect.sqlToQuery(buildNonArchivedRecruitingRecordFilter(recruitingOffer));

    expect(query.sql).toContain(
      '"recruiting_record"."id" = "recruiting_offer"."recruiting_record_id"',
    );
    expect(query.sql).toContain(
      '"recruiting_record"."organization_id" = "recruiting_offer"."organization_id"',
    );
    expect(query.sql).toContain('"recruiting_record"."outcome" <> $1');
    expect(query.params).toEqual(["archived"]);
  });
});
