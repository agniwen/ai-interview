import { and, sql } from "drizzle-orm";
import type { SQL, SQLWrapper } from "drizzle-orm";

interface ResumeSearchColumns {
  searchText: SQLWrapper;
  searchCjkBigrams: SQLWrapper;
}

// Must match resume_search_bigrams() in the database migration.
const COMMON_HAN_PAIR = /^[㐀-䶿一-鿿豈-﫿]{2}$/u;

export function buildResumeKeywordSearch(
  columns: ResumeSearchColumns,
  search: string | null | undefined,
): SQL | undefined {
  const query = search?.replaceAll(/\s+/gu, " ").trim();
  if (!query) {
    return undefined;
  }
  const pattern = `%${query.replaceAll(/[!%_]/g, "!$&")}%`;
  const contains = sql`${columns.searchText} ILIKE ${pattern} ESCAPE '!'`;
  const characters = [...query];
  const bigrams = new Set<string>();
  for (let index = 0; index < characters.length - 1; index += 1) {
    const pair = characters.slice(index, index + 2).join("");
    if (COMMON_HAN_PAIR.test(pair)) {
      bigrams.add(pair);
    }
  }
  if (bigrams.size === 0) {
    return contains;
  }
  // Necessary prefilter, not fuzzy matching: ILIKE still checks the entire literal.
  const words = sql.join(
    [...bigrams].map((word) => sql`${word}`),
    sql`, `,
  );
  return and(sql`${columns.searchCjkBigrams} @> ARRAY[${words}]::text[]`, contains);
}
