# Tasks: Interview Resume Library

**Input**: Design documents from `/specs/001-interview-resume-library/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: No dedicated test tasks were generated because the specification did not require a TDD workflow; validate with `npm run lint`, `npm run typecheck`, and the manual scenarios in `specs/001-interview-resume-library/quickstart.md`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. `US1`, `US2`, `US3`)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Align the existing feature module and route structure with the implementation plan.

- [X] T001 Create the candidate interview route file in `app/interview/[id]/page.tsx`
- [X] T002 Create shared candidate interview data types and mappers in `lib/interview/interview-record.ts`
- [X] T003 Update feature documentation references in `specs/001-interview-resume-library/plan.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the shared data model, validation, and API plumbing required by all user stories.

**⚠️ CRITICAL**: No user story work should begin until this phase is complete.

- [X] T004 Extend the interview persistence schema for nullable resume data and schedule support in `lib/db/schema.ts`
- [X] T005 [P] Add Drizzle relations for interview schedule entries in `lib/db/relations.ts`
- [X] T006 Extend shared studio interview schemas and record types in `lib/studio-interviews.ts`
- [X] T007 Generate and review the database migration using `drizzle.config.ts`
- [X] T008 Refactor `server/routes/studio-interviews/route.ts` to support schedule entry parsing and unified record serialization
- [X] T009 [P] Refactor `server/routes/interview/route.ts` to prepare record-based candidate loading and per-record token generation
- [X] T010 Register any new interview API paths and access rules in `server/app.ts`

**Checkpoint**: Database, shared schemas, and route plumbing are ready for story implementation.

---

## Phase 3: User Story 1 - Create and maintain candidate records (Priority: P1) 🎯 MVP

**Goal**: Deliver a complete internal resume library page where admins can create, view, edit, search, and delete candidate interview records with process-stage and multi-round schedule management.

**Independent Test**: Create a candidate record manually, add one or more interview rounds, edit the record, find it through search/filter, view its details, and delete it from the studio page.

### Implementation for User Story 1

- [X] T011 [P] [US1] Update the studio list page loader in `app/studio/(auth)/interviews/page.tsx`
- [X] T012 [P] [US1] Expand the create dialog form for candidate details and schedule entries in `app/studio/interviews/_components/create-interview-dialog.tsx`
- [X] T013 [P] [US1] Expand the edit dialog form for candidate details and schedule entries in `app/studio/interviews/_components/edit-interview-dialog.tsx`
- [X] T014 [P] [US1] Update record detail rendering to show process stage, interview link, and schedule entries in `app/studio/interviews/_components/interview-detail-dialog.tsx`
- [X] T015 [US1] Update list columns, search behavior, and summary cards in `app/studio/interviews/_components/interview-management-page.tsx`
- [X] T016 [US1] Finalize create, read, update, and delete behavior for manual resume-library records in `server/routes/studio-interviews/route.ts`

**Checkpoint**: User Story 1 is fully functional and independently testable from the studio admin area.

---

## Phase 4: User Story 2 - Create records from resume PDFs (Priority: P2)

**Goal**: Allow admins to upload or replace a resume PDF during create and edit so resume analysis prefills candidate data without losing manual scheduling or notes.

**Independent Test**: Upload a valid PDF during create and edit, confirm fields are prefilled from analysis, confirm validation messages for invalid files, and verify manual schedule and notes data are preserved after replacement.

### Implementation for User Story 2

- [X] T017 [US2] Add resume-analysis-aware create form defaults and upload error handling in `app/studio/interviews/_components/create-interview-dialog.tsx`
- [X] T018 [US2] Add resume replacement flow and merge behavior in `app/studio/interviews/_components/edit-interview-dialog.tsx`
- [X] T019 [US2] Implement resume-analysis merge rules and partial-data preservation in `server/routes/studio-interviews/route.ts`
- [X] T020 [US2] Update shared resume-library validation and form-data parsing helpers in `lib/studio-interviews.ts`

**Checkpoint**: User Story 2 works independently on top of the studio CRUD flow.

---

## Phase 5: User Story 3 - Generate interview access links (Priority: P3)

**Goal**: Generate and expose a unique candidate interview link, then load the candidate-facing interview page from stored record data without resume upload.

**Independent Test**: Copy a link from the studio page, open `/interview/{id}` in a fresh session, verify candidate-specific data is shown, verify the upload UI is gone, and confirm unavailable records show a clear empty state.

### Implementation for User Story 3

- [X] T021 [P] [US3] Add interview link display and copy actions to the studio management UI in `app/studio/interviews/_components/interview-management-page.tsx`
- [X] T022 [P] [US3] Add interview link and current round details to the record detail dialog in `app/studio/interviews/_components/interview-detail-dialog.tsx`
- [X] T023 [US3] Implement candidate-facing record lookup and unavailable-state responses in `server/routes/interview/route.ts`
- [X] T024 [P] [US3] Create the dynamic interview page entry in `app/interview/[id]/page.tsx`
- [X] T025 [US3] Refactor the candidate interview experience to load record data by id and remove resume upload in `app/interview/_components/interview-page-client.tsx`
- [X] T026 [US3] Remove the old authenticated static interview entry page in `app/(auth)/interview/page.tsx`

**Checkpoint**: All user stories are independently functional, including public candidate access by unique interview link.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finish consistency, validation, and release-readiness work across the feature.

- [X] T027 [P] Refresh studio page copy and empty states for the resume-library terminology in `app/studio/interviews/_components/interview-management-page.tsx`
- [X] T028 [P] Align candidate interview metadata and page messaging in `app/interview/[id]/page.tsx`
- [X] T029 Run lint and fix any resulting issues via `package.json`
- [X] T030 Run typecheck and fix any resulting issues via `package.json`
- [ ] T031 Execute the manual validation scenarios in `specs/001-interview-resume-library/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1: Setup**: No dependencies; can start immediately.
- **Phase 2: Foundational**: Depends on Phase 1; blocks all user stories.
- **Phase 3: US1**: Depends on Phase 2; forms the MVP.
- **Phase 4: US2**: Depends on Phase 3 because resume upload extends the create/edit flows.
- **Phase 5: US3**: Depends on Phase 2 and benefits from Phase 3 record shape; candidate route can start after shared serialization is stable.
- **Phase 6: Polish**: Depends on completion of the desired user stories.

### User Story Dependencies

- **US1 (P1)**: Starts after foundational work; no dependency on later stories.
- **US2 (P2)**: Builds on US1 create/edit forms and shared route parsing.
- **US3 (P3)**: Builds on foundational record serialization and should land after the record shape used by US1 is finalized.

### Within Each User Story

- Shared types and server serialization before UI wiring that consumes them.
- Form components before list/detail integration.
- Candidate route entry before full candidate page refactor.
- Finish manual validation before calling the feature complete.

### Parallel Opportunities

- `T005` and `T009` can run in parallel after `T004`.
- `T011`, `T012`, `T013`, and `T014` can be split across contributors once foundational work is complete.
- `T021`, `T022`, and `T024` can run in parallel before `T025` integrates the full candidate experience.
- `T027` and `T028` can run in parallel during polish.

---

## Parallel Example: User Story 1

```bash
# Parallel UI tasks for User Story 1
Task: "Update the studio list page loader in app/studio/(auth)/interviews/page.tsx"
Task: "Expand the create dialog form in app/studio/interviews/_components/create-interview-dialog.tsx"
Task: "Expand the edit dialog form in app/studio/interviews/_components/edit-interview-dialog.tsx"
Task: "Update record detail rendering in app/studio/interviews/_components/interview-detail-dialog.tsx"
```

## Parallel Example: User Story 3

```bash
# Parallel tasks for link-based interview access
Task: "Add interview link display and copy actions in app/studio/interviews/_components/interview-management-page.tsx"
Task: "Add interview link details in app/studio/interviews/_components/interview-detail-dialog.tsx"
Task: "Create the dynamic interview page entry in app/interview/[id]/page.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 for internal resume-library CRUD with scheduling.
3. Validate the studio admin flow independently.
4. Demo the MVP before extending resume analysis and public links.

### Incremental Delivery

1. Deliver US1 for internal CRUD and schedule management.
2. Add US2 to improve efficiency with resume PDF analysis and edit-time replacement.
3. Add US3 to unlock shareable interview links and the new candidate-facing experience.
4. Finish polish, validation, and release checks.

### Parallel Team Strategy

1. One contributor handles schema and server route foundation.
2. One contributor handles studio admin UI forms and list/detail views.
3. One contributor handles the candidate-facing route and interview page refactor once the shared payload shape is ready.

---

## Notes

- All tasks follow the required checklist format.
- User story labels map directly to the stories in `specs/001-interview-resume-library/spec.md`.
- No dedicated automated test tasks were added because the specification did not request them.
- Use `specs/001-interview-resume-library/contracts/interview-resume-library.yaml` as the contract reference during implementation.
