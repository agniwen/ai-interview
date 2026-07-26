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

**Candidate Recruiting Record**:
The workspace record that tracks one candidate in the context of one job and its recruiting pipeline. AI interview rounds belong to this record; each interview report and its versions belong to exactly one AI interview round rather than directly to the candidate record.
_Avoid_: Candidate identity, resume record, interview round

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

**Resume Scoring Policy**:
A workspace-owned scoring configuration that chooses which resume-review dimensions participate, how their weights are assigned, and which job descriptions it applies to. Each workspace has exactly one global default policy (system-seeded, editable, not deletable); additional policies bind exclusively to selected job descriptions and override the global default for those jobs.
_Avoid_: Dimension config, scoring template, weight settings, six-dimension config

**Resume Scoring Policy Snapshot**:
The frozen copy of the resume scoring policy used when one resume review score was produced, so later policy edits do not silently rewrite historical scores.
_Avoid_: Live policy, current weight settings

**Dimension Deduction Rule**:
A fixed-identity scoring rule (stable rule id) that defines how one resume-review dimension loses points from a 100 baseline; the deduction amount may be configured per workspace while the rule catalog stays product-defined.
_Avoid_: Soft checklist, free-form score rationale, per-policy deduction table

**Workspace Deduction Rule Set**:
The workspace-owned table of deduction amounts (and optional per-rule enablement) applied when computing resume-review dimension raw scores.
_Avoid_: Scoring policy weights, screening rules

**Resume Review Composite Score**:
The weighted overall score of a resume review under the effective scoring policy snapshot, shown to one decimal place. Within candidates who have cleared resume screening, it is the primary rank and score-filter signal; when screening has not passed, the score may still be shown for diagnosis but must not outrank or override the screening conclusion.
_Avoid_: Recommendation score, vector similarity score, screening result, final pass decision

**Resume Evaluation Decision**:
The single user-facing outcome for a resume at the screening/review stage, assembled from resume screening results (and hard filters when applicable) with next-step constrained by those results; dimension scores never independently authorize a more lenient outcome than screening.
_Avoid_: Parallel AI conclusions, competing badges without hierarchy

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

**Interview Active Time**:
The elapsed time in an AI interview round while the candidate is connected and the interview can progress. Time spent inside the hot-reconnect grace window is excluded, although the grace window itself remains bounded.
_Avoid_: Room lifetime, wall-clock duration, recording duration

**Required Interview Question**:
A question from the question-template snapshot assigned to an AI interview round. Resume-derived personalized questions are not part of the round's required question set.
_Avoid_: Personalized question, supplementary question, generated follow-up

**Evaluation Focus**:
The assessable information a required interview question is intended to collect. It defines when the question has gathered enough evidence to complete, but it is not a standard answer or a correctness rule.
_Avoid_: Question intent, scoring answer, evaluation criterion

**Follow-up Direction**:
Guidance for probing when a candidate's answer has not yet covered a question's evaluation focus. It suggests useful avenues rather than a checklist that must be exhausted.
_Avoid_: Required subquestion, completion checklist

**Skipped Interview Question**:
A required interview question that the candidate explicitly declines after one confirmation. It is recorded as a candidate skip, receives zero credit, and does not prevent the round from continuing.
_Avoid_: Unasked interview question, unanswered question

**Insufficient Interview Question**:
A required interview question the candidate attempted but whose evaluation focus remained unsupported after the permitted follow-ups. It records inadequate coverage and lets the round continue without assigning a score by itself.
_Avoid_: Skipped interview question, incorrect answer, zero-score answer

**Interrupted Interview Question**:
A required interview question that started but could not reach a coverage outcome before the round ended. It preserves partial participation and records whether time pressure, disconnect, candidate choice, or system shutdown caused the interruption.
_Avoid_: Unasked interview question, insufficient interview question

**Unasked Interview Question**:
A required question that an AI interview round ended before starting. It records why coverage was incomplete and is neither a candidate skip nor a zero-score answer.
_Avoid_: Skipped question, unanswered question, incorrect answer

**Interview Question Outcome**:
The round-scoped process record for one required interview question, including whether it was answered, skipped, or unasked and its timing and follow-up count. It supports coverage auditing but is not interview report evidence; scoring must continue to cite the original transcript.
_Avoid_: Answer evidence, question score, generated assessment

**Call Completion Status**:
The technical completion state of an AI interview call. `success` means the round reached a normal wrap-up, including a time-driven wrap-up; `partial` means a candidate-ended round or exhausted reconnect grace preserved usable partial results; `failed` means an agent, infrastructure, or system-shutdown failure prevented normal completion. It does not replace per-question outcomes.
_Avoid_: Interview score, hiring recommendation, question outcome

**Schedule Entry**:
The round-level scheduling and status record for an AI interview.
_Avoid_: Calendar event, timeslot

**Human Interview**:
A live interview session involving a human interviewer and a candidate.
_Avoid_: AI interview, manual round

**Interview Report**:
The versioned, reviewable evaluation output for one AI interview round, combining evidence from the candidate's resume, submitted forms, and that round's interview. A candidate may have multiple interview reports.
_Avoid_: Candidate-level aggregate report, summary, feedback note

**Interview Report Evidence**:
An immutable source fact cited by an interview report conclusion from exactly one of three source families: resume content, a submitted form response, or a candidate statement from that AI interview round. Generated assessments and prior report conclusions are derived material, not evidence.
_Avoid_: AI rationale, report conclusion, prompt context

**Interview Report Conclusion**:
One structured claim in an interview report that cites at least one interview report evidence item. The report's overall recommendation refers to conclusions rather than introducing unsupported claims.
_Avoid_: Evidence quote, report section, free-form rationale

**Interview Report Evidence Conflict**:
A structured disagreement between source facts that must retain references to the conflicting evidence and request human resolution instead of silently selecting one account.
_Avoid_: Missing source, low confidence, rejected report

**Interview Report Schema Version**:
The version of the interview report data contract used to parse and validate its stored content.
_Avoid_: Report version, prompt version

**Interview Report Version**:
The immutable business revision number of an interview report within one AI interview round.
_Avoid_: Schema version, edit count

**Interview Report Review**:
The decision process applied to the immutable interview report version submitted to the round's Feishu review workspace, with attributable audit history. Once the document exists, the system does not revise or regenerate that round's report.
_Avoid_: Report editing, recruitment stage, Feishu document status

**Business Interview Entry Gate**:
The human decision made from one submitted interview report version: advance the candidate to the human interview stage or close the recruiting record as rejected.
_Avoid_: AI recommendation, human interview outcome, report status

**Interview Report Reviewer**:
A workspace member who may decide the business interview entry gate for candidate recruiting records within their recruiting visibility scope. Ordinary HR members may review their own submitted versions; management rank is not required.
_Avoid_: Feishu document editor, AI evaluator, human interviewer

**Feishu Review Workspace**:
The editable Feishu document generated for one AI interview round. Each round has its own document, and after creation the system never modifies its body, so human review input cannot be overwritten. Editing the document does not revise a system report version, and gate decisions are submitted in the authenticated system rather than through Feishu callbacks.
_Avoid_: Report source of truth, report version, unrestricted report editor

**Human Review Input**:
Reviewer-authored content entered in designated sections of a Feishu review workspace. In the first version it remains in Feishu and is not part of the immutable generated report or the system review record.
_Avoid_: AI assessment conclusion, Feishu document body, approval decision

**Interview Report Source Coverage**:
The explicit availability state of each interview report source family: available, missing, or not applicable. Missing required sources block review submission; a source omitted by the recruiting process does not.
_Avoid_: Evidence quality, completion percentage

**Interview Evidence Snapshot**:
A stable snapshot of the resume, job, submitted forms, questions, configuration, and transcript used to generate or explain one interview report.
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
