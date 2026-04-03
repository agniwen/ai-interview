# Data Model: Interview Resume Library

## 1. CandidateInterviewRecord

- Purpose: Primary resume-library record managed by internal studio users and used as the source for the candidate-facing interview page.

### Fields

- `id`: unique identifier; also used in the shareable interview URL `/interview/{id}`
- `candidateName`: required display name
- `candidateEmail`: optional contact email
- `targetRole`: optional primary target role
- `status`: current overall interview process stage
- `resumeFileName`: optional latest uploaded resume file name
- `resumeProfile`: structured resume-analysis result used to prefill and display candidate information
- `interviewQuestions`: structured interview questions associated with the candidate record
- `notes`: optional internal-only notes
- `createdBy`: internal user who created the record
- `createdAt`: creation timestamp
- `updatedAt`: last update timestamp

### Validation Rules

- `candidateName` is required before save.
- `candidateEmail`, if present, must be a valid email format.
- `status` must be one of the allowed workflow stages.
- `resumeProfile` may be absent for manual creation until a resume is uploaded or fields are entered manually.
- `interviewQuestions` may be empty until resume analysis or manual question preparation is completed.

### Relationships

- Has many `InterviewScheduleEntry` records.
- Exposes one derived `InterviewAccessLink`.

### State Transitions

- `draft` -> `ready`
- `ready` -> `in_progress`
- `in_progress` -> `completed`
- `completed` -> `archived`
- `ready` -> `archived`
- `in_progress` -> `ready` (allowed when the process is restarted)

## 2. InterviewScheduleEntry

- Purpose: Represents one interview round planned under a candidate record.

### Fields

- `id`: unique identifier
- `interviewRecordId`: parent candidate interview record identifier
- `roundLabel`: human-readable round label such as `一面`, `二面`, `三面`
- `scheduledAt`: planned date and time for the round; may be empty for a round stub not yet scheduled
- `notes`: optional internal notes for the round
- `sortOrder`: numeric ordering so rounds display in a stable sequence
- `createdAt`: creation timestamp
- `updatedAt`: last update timestamp

### Validation Rules

- `roundLabel` is required.
- `scheduledAt` must be a valid date-time when provided.
- `sortOrder` must be unique within a single parent record.

### Relationships

- Belongs to one `CandidateInterviewRecord`.

## 3. InterviewAccessLink

- Purpose: Candidate-facing entry point for opening the interview page.

### Representation

- Derived from `CandidateInterviewRecord.id` as `/interview/{id}`.
- Not stored as a separate entity in v1.

### Rules

- Must resolve to exactly one candidate interview record.
- Becomes unavailable when the parent record is deleted or archived out of public use.

## 4. CandidateInterviewView

- Purpose: Public projection returned to the candidate-facing page.

### Fields

- `id`
- `candidateName`
- `targetRole`
- `status`
- `resumeProfile`
- `interviewQuestions`
- `currentRoundLabel`
- `currentRoundTime`

### Rules

- Must exclude internal-only fields such as recruiter notes and admin metadata.
- Must be derivable from `CandidateInterviewRecord` plus its ordered `InterviewScheduleEntry` records.
