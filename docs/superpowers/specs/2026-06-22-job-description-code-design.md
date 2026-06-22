# Job Description Code Design

## Goal

Add an optional system-generated code to active job descriptions. New job descriptions should receive a code by default. Existing job descriptions may keep `code = null`; no historical backfill is required.

## Current Context

The active-position entity is `job_description`. It is already scoped by `organization_id`, and all job-description routes operate through the active workspace. System settings live in `global_config`, which is also scoped by `organization_id` and lazily created per workspace.

## Data Model

Add nullable `job_description.code`.

- Type: `text`
- Nullable: yes, for backward compatibility
- Uniqueness: unique per workspace for non-null codes
- Index: partial unique index on `(organization_id, code)` where `code is not null`

Add `global_config.job_code_prefix`.

- Type: `text`
- Default: `AUR`
- Validation: trimmed, 1-12 uppercase letters or digits
- Empty input is normalized to `AUR`

The prefix belongs in `global_config` rather than an environment variable because each workspace can configure it independently.

## Code Format

Generated codes use:

```text
{prefix}{YYMMDDHHMM}{J}
```

`J` is a random digit from `0` to `9`. The timestamp comes from the backend creation time, not the browser.

Example:

```text
AUR26062215347
```

## Creation Flow

On `POST /w/:slug/studio/job-descriptions`:

1. Read the active workspace global config.
2. Resolve `jobCodePrefix`, falling back to `AUR`.
3. Generate `prefix + YYMMDDHHMM + randomDigit`.
4. Insert the job description with that code.
5. If the database unique index rejects the insert, retry with another random digit.
6. Retry at most 10 times.
7. If all 10 digits conflict, return a clear 409 error asking the user to retry later.

This keeps the format exactly as requested. The tradeoff is that a single workspace has only 10 code slots per minute for a given prefix.

## Update Flow

Job code is read-only in the job-description form. Editing a job description does not regenerate or change the code.

If a legacy record has `code = null`, editing that record keeps `code = null`.

## UI

Job-description list:

- Add a `编码` column near `岗位名称`.
- Show the code when present.
- Show a muted empty state such as `未生成` when null.

Job-description create/edit dialog:

- Create mode does not show an editable code field.
- Edit mode shows the code as read-only when present; legacy null records show `未生成`.

System settings:

- Add a `岗位编码前缀` input to the existing system settings page.
- Default value is `AUR`.
- Help text explains that new job descriptions use this prefix and old records are not changed.

## API and Shared Types

Extend the shared job-description record types with:

```ts
code: string | null;
```

Do not include `code` in create/update input schemas. The server owns generation.

Extend global-config shared schema and DTO with:

```ts
jobCodePrefix: string;
```

## Testing

Add focused tests for:

- Prefix validation and default normalization.
- Generated code format.
- New job-description creation includes a code.
- Duplicate-code retry respects workspace scoping.
- Legacy records with `code = null` serialize and render safely.
