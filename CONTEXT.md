# AI Recruitment Copilot

AI Recruitment Copilot is a Chinese-first recruiting workspace for resume intake, candidate review, AI voice interviews, human interviews, and recruiting collaboration. Use this glossary when naming issues, tests, refactors, and product behavior.

## Language

### Workspace and Access

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

**Resume Profile**:
The structured facts extracted from a resume for candidate review, matching, and interview preparation.
_Avoid_: Parsed JSON, resume data

**Resume Pool**:
A pre-library staging area for parsed resumes before they are imported into the resume library.
_Avoid_: Resume library, upload queue

**Private Resume Pool**:
The user's own resume-pool scope inside a workspace.
_Avoid_: My uploads, personal library

**Public Resume Pool**:
A shared resume-pool scope that can be read across workspaces according to product rules.
_Avoid_: Global resume library, marketplace

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
