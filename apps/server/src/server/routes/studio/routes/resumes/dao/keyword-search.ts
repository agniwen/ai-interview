import { listTextFiltersSchema, parseListTextFilters } from "@arc/shared/list-text-filters";
import { literalTextContains } from "../../../../../../lib/server/db/list-text-filters";
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
type ResumeAtomicSources = Record<
  "candidateName" | "email" | "phone" | "resumeFileName" | "targetRole" | "company" | "school",
  SQLWrapper
>;

interface ResumeAtomicSearchColumns extends ResumeSearchColumns {
  candidateName: SQLWrapper;
  candidateEmail: SQLWrapper;
  candidatePhone: SQLWrapper;
  resumeFileName: SQLWrapper;
  targetRole: SQLWrapper;
  resumeProfile: SQLWrapper;
}

/** Reuse the indexed search document as a necessary prefilter, then verify the specific field. */
export function buildResumeAtomicSearch(columns: ResumeAtomicSearchColumns, raw?: string | null) {
  const values = parseListTextFilters(listTextFiltersSchema("resumes").parse(raw ?? undefined));
  const profile = columns.resumeProfile;
  const sources = {
    candidateName: columns.candidateName,
    company: sql`resume_search_text(NULL, NULL, NULL, NULL, NULL, jsonb_build_object(\'workExperiences\', ${profile}->\'workExperiences\'))`,
    email: columns.candidateEmail,
    phone: columns.candidatePhone,
    resumeFileName: columns.resumeFileName,
    school: sql`resume_search_text(NULL, NULL, NULL, NULL, NULL, jsonb_build_object(\'educationExperiences\', ${profile}->\'educationExperiences\', \'schools\', ${profile}->\'schools\'))`,
    targetRole: columns.targetRole,
  } satisfies ResumeAtomicSources;
  return and(
    ...Object.entries(sources)
      .filter(([key]) => values[key])
      .map(([key, rawSource]) => {
        const value = values[key];
        const normalized = value.replaceAll(/\s+/gu, " ").trim();
        const source =
          key === "company" || key === "school"
            ? rawSource
            : sql`resume_search_text(${rawSource}, NULL, NULL, NULL, NULL, NULL)`;
        return and(
          buildResumeKeywordSearch(columns, normalized),
          literalTextContains(source, normalized),
        );
      }),
  );
}
