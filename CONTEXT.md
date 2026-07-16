# AI Recruitment Copilot

AI Recruitment Copilot is a Chinese-first recruiting workspace for resume intake, candidate review, AI voice interviews, human interviews, and recruiting collaboration. Use this glossary when naming issues, tests, refactors, and product behavior.

## Frontend Module Boundary

`apps/ai-recruitment-copilot/src/routes/` contains only TanStack Router route modules and thin route composition. Feature components, page sections, hooks, state models, dialogs, and list renderers belong under `src/components/features/<feature>/`; shared client utilities belong under `src/lib/client/`. A `-` filename prefix is not a substitute for moving feature implementation out of `src/routes/`.

## Language

### Workspace and Access

**Application Release**:
A deployed web application build identified independently from the browser tab that is currently open.
_Avoid_: Page version, cache version

**Stale Client**:
An open browser tab whose loaded application release is older than the latest application release known to the system.
_Avoid_: Broken page, cached user

**Update Notice**:
A non-blocking prompt that tells a stale client a newer application release is available and offers an explicit refresh action.
_Avoid_: Forced upgrade, maintenance notice

**Workspace**:
The tenant boundary where a recruiting team manages candidates, job descriptions, interviews, members, and settings.
_Avoid_: Tenant, organization, company account

**Member**:
A user who belongs to a workspace with a workspace role.
_Avoid_: Account, teammate, staff

**Workspace Role**:
A member's permission profile inside one workspace, such as owner, admin, hr, or viewer.
_Avoid_: User type, permission level

**Platform Administrator**:
A platform-level operator who can inspect and support across workspaces without being a normal workspace member.
_Avoid_: Workspace admin, owner

**Workspace Invite Link**:
A reusable join link that lets people enter a workspace with the default role chosen by the product rules.
_Avoid_: Invitation token, share URL

**Email Invitation**:
A directed workspace invitation sent to a specific email address.
_Avoid_: Invite link

### Recruiting Setup

**Job Description**:
An active position definition used to evaluate resumes and drive interview questions.
_Avoid_: JD when writing user-facing copy, role posting

**Job Code**:
A workspace-scoped generated identifier for a job description.
_Avoid_: Manual code, external requisition id

**Department**:
A workspace grouping used to organize interviewers and positions.
_Avoid_: Team, business unit

**Interviewer**:
A workspace-managed interviewer profile used for AI or human interview configuration.
_Avoid_: Agent, recruiter

**Question Template**:
A reusable interview-question template that can be bound to job descriptions or interview flows.
_Avoid_: Prompt, question bank item

**Candidate Form**:
A reusable form shown to candidates to collect structured information outside the resume.
_Avoid_: Survey, questionnaire

**Global Config**:
Workspace-wide interview settings such as company context, opening instructions, closing instructions, and job-code prefix.
_Avoid_: System config, environment config

**Workspace Recruiting Copilot**:
A workspace-scoped chat assistant that answers recruiting questions by using the workspace's job descriptions, resume library, and related recruiting records as context.
_Avoid_: Chat page, resume upload chat, global recruiting bot

**Copilot Action Proposal**:
A recruiter-confirmed action suggested by the workspace recruiting copilot before it changes recruiting records.
_Avoid_: Agent write, auto action, tool result

**Copilot Citation**:
A visible reference to a workspace recruiting record that the workspace recruiting copilot used to produce an answer.
_Avoid_: Prompt context, raw retrieval chunk, footnote

**Candidate Summary Card**:
A compact candidate representation returned by copilot retrieval before loading the full resume record.
_Avoid_: Full resume, raw resume text, search row

**Copilot Retrieval Scope**:
The temporary recruiting-data boundary used by the workspace recruiting copilot for the current turn or short conversation segment.
_Avoid_: Saved filter, default workspace setting, permission scope

### Candidates and Resumes

**Candidate**:
A person being evaluated by a workspace for one or more job descriptions or interview rounds.
_Avoid_: Applicant when the record is already inside the workspace

**Resume Library**:
The workspace roster of resume records that have been accepted into the recruiting workflow.
_Avoid_: Candidate database, interview list

**Resume Record**:
One candidate/resume entry in the resume library.
_Avoid_: Interview record, application

**Recruiter Resume Detail**:
The workspace-internal view of one resume record where a member inspects the candidate and performs recruiting actions.
_Avoid_: Resume review link, public review page

**Resume Review Link**:
A member-facing review entry for viewing a resume record and submitting a resume evaluation, separate from recruiter management actions.
_Avoid_: Recruiter resume detail, internal resume page

**Resume Profile**:
The structured facts extracted from a resume for candidate review, matching, and interview preparation.
_Avoid_: Parsed JSON, resume data

**Resume Pool**:
A pre-library staging area for parsed resumes before they are imported into the resume library.
_Avoid_: Resume library, upload queue

**Private Resume Pool**:
The workspace resume-pool scope whose records remain privately owned. It defaults to the current
user's uploads; workspace owners/admins can browse all uploaders, while recruiting supervisors and
leads can browse their own uploads and those of lower-ranked members in their recruiting groups.
_Avoid_: My uploads, personal library

**Public Resume Pool**:
The workspace-shared resume-pool scope. Any member with resume-pool read access in the current
workspace can browse and import these records; they are not visible to other workspaces.
_Avoid_: Global resume library, marketplace, app-wide public feed

**Resume Pool Import**:
The act of copying a resume-pool item into a workspace's resume library while preserving source traceability.
_Avoid_: Move, claim

**Resume Upload Batch**:
A persisted group of resume files being processed for the resume library or resume pool.
_Avoid_: Upload session, import job

**Resume Upload Batch Item**:
One file inside a resume upload batch, with its own processing result.
_Avoid_: File row, upload task

**Mail Ingest Account**:
A user's configured mailbox account for importing resume attachments into the private resume pool.
_Avoid_: Email integration, inbox

**Content Hash**:
The byte-level identity of an uploaded resume file, used to reuse storage and parsing results.
_Avoid_: File id, checksum when discussing product behavior

**Chat Attachment**:
A user-scoped attachment record that can also act as the canonical registry for resume file bytes and parsed resume facts.
_Avoid_: Resume record, S3 object

**Resume Screening Rule**:
A job-description-specific requirement used to compare a resume profile against recruiting expectations before interview progression.
_Avoid_: Prompt instruction, hidden hard filter

**Draft Resume Screening Rule**:
A resume screening rule suggestion that has not yet been confirmed for use in resume screening.
_Avoid_: Active rule, saved requirement

**Active Resume Screening Rule**:
A resume screening rule that has been confirmed for use in resume screening.
_Avoid_: AI suggestion, draft rule

**Resume Screening Rule Severity**:
The configured strength of a resume screening rule, determining whether a rule result is informational, warning-level, or blocking for screening guidance.
_Avoid_: Score weight, automatic outcome

**Deterministic Resume Screening Rule**:
A resume screening rule that can be evaluated from structured resume profile fields without semantic judgment.
_Avoid_: AI judgment, semantic requirement

**Resume Screening Field Rule**:
A resume screening rule evaluated from a specific structured resume profile field, such as education level or work years.
_Avoid_: Skill semantic match, open-ended evidence rule

**Resume Screening Skill Rule**:
A resume screening rule where a recruiter configures required skills and the system evaluates resume evidence for semantically equivalent skill experience.
_Avoid_: Manually maintained alias list, open-ended semantic requirement

**Semantic Resume Screening Rule**:
A resume screening rule that asks whether the resume provides evidence for a qualitative job expectation.
_Avoid_: Deterministic failure, automatic disqualification

**Resume Screening Evidence Agent**:
The narrow AI evaluator that extracts evidence for resume screening skill rules and semantic resume screening rules.
_Avoid_: Resume review agent, final decision maker

**Resume Screening Policy**:
The current set of resume screening rules configured on a job description.
_Avoid_: Resume review prompt, candidate filter text

**Resume Screening Result**:
The system's recommendation after applying resume screening rules to a resume record; it may suggest pass, hold, or risk, but it is not a final candidate outcome.
_Avoid_: Rejection, candidate status, final verdict

**Resume Screening Evidence**:
The cited resume fact, text, inference, or manual note used to explain one resume screening rule result.
_Avoid_: Hidden model reasoning, score rationale

**Resume Screening Recommendation**:
The action guidance produced by a resume screening result, limited to pass, flag, or hold unless a human later changes the candidate outcome.
_Avoid_: Automatic rejection, closed outcome

**Resume Screening Snapshot**:
The stable record of which resume screening policy and rule results were used for one resume screening result.
_Avoid_: Current job rule, live policy

**Stale Resume Screening Snapshot**:
A resume screening snapshot created with an older resume screening policy than the current job description policy.
_Avoid_: Invalid result, failed screening

**Resume Review**:
The generated evaluation of how a resume record matches a job description, including dimensions, strengths, risks, and next-step guidance.
_Avoid_: Screening result, final candidate outcome, manual feedback note

**HR Resume Assessment**:
A human-written assessment of a resume record that captures the recruiter's judgment separately from the generated resume review.
_Avoid_: Resume review, screening result, interview report

**Resume Reassessment**:
The act of regenerating both resume screening and resume review for a resume record after relevant job-description context changes.
_Avoid_: Screening-only refresh

### Interview Workflow

**AI Interview Round**:
One scheduled AI interview attempt for a candidate.
_Avoid_: Candidate row, interview record

**Schedule Entry**:
The round-level scheduling and status record for an AI interview.
_Avoid_: Calendar event, timeslot

**Human Interview**:
A live interview session involving a human interviewer and a candidate.
_Avoid_: AI interview, manual round

**Interview Report**:
The generated evaluation output for an interview round, based on transcript, questions, answers, and evidence.
_Avoid_: Summary, feedback note

**Interview Evidence Snapshot**:
A stable snapshot of the resume, job, questions, and configuration used to generate or explain an interview evaluation.
_Avoid_: Context dump, prompt cache

**Round Invite Email**:
An email invitation for a specific interview round.
_Avoid_: Workspace invitation, reminder email

**Recruitment Stage**:
The candidate's business stage in the recruiting pipeline, such as screening, AI interview, human interview, offer, rejected, or hired.
_Avoid_: Status when the value represents pipeline meaning

### Semantic Matching

**Semantic Index**:
The vector-backed search index for resume duplicate detection and future job-to-resume recommendation.
_Avoid_: Vector database as the business source of truth

**Duplicate Match**:
A persisted or returned risk signal that one resume likely represents the same candidate as another source.
_Avoid_: Duplicate record, conflict

**Semantic Dedup**:
Duplicate detection based on resume meaning and experience overlap rather than only name, email, or phone.
_Avoid_: Identity dedup

**Recommendation**:
A job-to-resume or resume-to-job ranking built from semantic similarity and business filters.
_Avoid_: Duplicate match
