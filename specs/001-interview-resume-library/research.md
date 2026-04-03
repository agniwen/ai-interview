# Research: Interview Resume Library

## Decision 1: Extend the existing studio interview module as the resume library source of truth

- Decision: Expand the current `studio_interview` capability instead of creating a separate parallel module for resume-library management.
- Rationale: The repository already has an internal studio interview list page, CRUD APIs, shared form schemas, and a persisted table carrying resume-derived data. Extending that slice keeps admin workflows in one place and minimizes duplicated UI and API surface.
- Alternatives considered:
  - Create a brand-new resume library module beside `studio_interview`: rejected because it would duplicate nearly the same CRUD and listing concerns.
  - Keep the current module unchanged and add a thin link generator only: rejected because it would not support multiple interview rounds or richer record editing.

## Decision 2: Use a public dynamic candidate route at `/interview/[id]`

- Decision: Move the candidate-facing interview entry to a dynamic public route using the record identifier in the URL.
- Rationale: The feature requires one unique interview link per resume and the user explicitly specified `/interview/$id`. The current protected static `/interview` page conflicts with link-based access and the existing upload-first journey.
- Alternatives considered:
  - Keep the authenticated static `/interview` page: rejected because shared candidate links would require login.
  - Introduce a second opaque token in addition to the record id: rejected for v1 because the existing record id is already unique and sufficient for shareable links.

## Decision 3: Remove candidate-side resume upload and hydrate the interview page from stored record data

- Decision: The candidate-facing page should load persisted resume profile and interview question data from the resume library record instead of accepting a new PDF upload.
- Rationale: The resume already exists in the back-office library, and the user explicitly asked to remove upload from the interview page. This also ensures the interview runs against the recruiter-reviewed record.
- Alternatives considered:
  - Keep upload as an optional fallback: rejected because it creates two competing sources of truth.
  - Re-run analysis on page load from stored file content: rejected because the repository currently stores the analysis result, not the original file body.

## Decision 4: Normalize interview schedule entries as child records

- Decision: Model interview times as one-to-many schedule entries under a single candidate interview record.
- Rationale: The feature requires multiple interview rounds such as first, second, and third interviews. A child collection supports variable round counts, separate times, and round-specific notes without bloating the parent record.
- Alternatives considered:
  - Store fixed columns like `firstInterviewAt`, `secondInterviewAt`, `thirdInterviewAt`: rejected because it caps the number of rounds and complicates edits.
  - Store all rounds in one JSON blob: rejected because filtering, validation, and ordered updates become less clear.

## Decision 5: Reuse the existing stack and repo conventions for implementation

- Decision: Keep using Next.js App Router for pages, Hono for API routing, Drizzle ORM for persistence, Zod for validation, and client-side `fetch` for mutations.
- Rationale: These patterns are already used consistently across the repository for studio pages and interview APIs, which lowers integration risk and keeps the feature aligned with current conventions.
- Alternatives considered:
  - Introduce server actions or a new data-fetching layer: rejected because there is no existing usage pattern for this in the repo.
  - Introduce a separate service package: rejected because the feature fits the current monolithic app layout.

## Decision 6: Keep candidate interview report persistence out of the initial feature scope

- Decision: The planning scope focuses on resume-library CRUD, shareable interview links, and candidate-page hydration; durable interview report persistence is not required for this feature increment.
- Rationale: Existing report storage is in-memory only, but the feature request does not ask to redesign reporting. Avoiding that expansion keeps scope aligned to the requested workflow.
- Alternatives considered:
  - Add durable transcript/report persistence now: rejected because it materially expands the feature beyond resume library and link delivery.
  - Block the feature until reporting is persistent: rejected because link-based interview entry can still work independently.
