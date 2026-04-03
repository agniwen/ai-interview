# Quickstart: Interview Resume Library

## Prerequisites

- Start the app in local development mode.
- Ensure database connectivity is available.
- Ensure resume-analysis environment variables are configured so PDF parsing can run.

## Scenario 1: Create a resume library record with PDF analysis

1. Sign in as a studio admin user.
2. Open the studio interview management page.
3. Create a new record and upload a valid PDF resume.
4. Confirm candidate fields are prefilled from analysis.
5. Add at least one interview round and save.
6. Verify the new record appears in the list with candidate name, role, status, and generated interview link.

## Scenario 2: Edit an existing record and preserve scheduling data

1. Open an existing record from the studio list.
2. Update candidate details and the current process stage.
3. Add or edit multiple interview rounds such as `一面` and `二面`.
4. Replace the resume PDF.
5. Save the record.
6. Verify recruiter notes and interview rounds remain intact unless explicitly changed.

## Scenario 3: Search and delete from the resume library

1. Search by candidate name, email, target role, or resume file name.
2. Filter by process stage.
3. Open a record from filtered results and confirm details match the list entry.
4. Delete a record.
5. Verify the deleted record no longer appears in the default list.

## Scenario 4: Open a unique interview link from the candidate-facing page

1. Copy the generated interview link from a studio record.
2. Open `/interview/{id}` in a fresh browser session without using the studio area.
3. Verify the page shows candidate-specific interview information loaded from stored data.
4. Verify there is no resume-upload control on the page.
5. Start the interview and confirm token creation succeeds for that record.

## Scenario 5: Invalid or unavailable interview link

1. Open `/interview/{missing-or-deleted-id}`.
2. Verify the page shows a clear unavailable state.
3. Verify the interview cannot be started from that state.
