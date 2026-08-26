import { and, sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import { listTextFiltersSchema, parseListTextFilters } from "@arc/shared/list-text-filters";
import type { ListTextResource, listTextFields } from "@arc/shared/list-text-filters";

export function literalTextContains(column: SQLWrapper, value: string) {
  return sql`${column} ILIKE ${`%${value.replaceAll(/[!%_]/g, "!$&")}%`} ESCAPE '!'`;
}

/** The caller owns the column whitelist; client strings can never become SQL identifiers. */
export function buildListTextFilterWhere<R extends ListTextResource>(
  resource: R,
  value: string | null | undefined,
  columns: Record<keyof (typeof listTextFields)[R], SQLWrapper>,
) {
  const parsed = listTextFiltersSchema(resource).parse(value ?? undefined);
  const fields: Record<string, SQLWrapper> = columns;
  return and(
    ...Object.entries(parseListTextFilters(parsed))
      .filter(([, text]) => text)
      .map(([key, text]) => literalTextContains(fields[key], text)),
  );
}
