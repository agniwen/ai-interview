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
A position definition used to evaluate resumes and drive interview questions; it is either a draft or a published job description.
_Avoid_: JD when writing user-facing copy, role posting

**Draft Job Description**:
A job description whose recruiting and resume-evaluation configuration is still editable and cannot yet receive, match, or evaluate candidates.
_Avoid_: Inactive position, unpublished config

**Published Job Description**:
A job description available to recruiting workflows. For structured jobs, its name, code, description, prompt, resume gates, evaluation blueprint, scoring weights, scoring adjustments, and scoring-rule-set version are immutable, while operational interview assignments and questions may still change; legacy jobs retain their existing edit/version behavior.
_Avoid_: Saved draft, editable active job

**Job Resume Evaluation Mode**:
The immutable evaluation lineage of a published job description: legacy for jobs created before structured evaluation, or structured for newly published jobs. A legacy job cannot be upgraded in place; using structured evaluation requires a new job description.
_Avoid_: Feature flag, scoring version, temporary rollout state

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

**Resume Screening Gate**:
A published structured-job requirement evaluated as passed, failed, or needing verification. A failed gate marks the AI reference result as "未通过门槛", but the gate is not a final candidate decision and cannot prevent an explicit recruiter action.
_Avoid_: Warning-only rule, automatic rejection, score deduction, final HR decision, hard filter

**Job Hard-Gate Configuration**:
The draft job-description-owned set of independently stored free-text resume screening gates for education, work years, required skills, work location, language ability, required certificates, and other requirements. Non-empty gates become active when a structured job is published; an empty published configuration means the job has no hard gates.
_Avoid_: Free-form JD text, scoring adjustment rules, runtime-extracted hard filter

**Draft Job Evaluation Blueprint Preview**:
The server-stored, recruiter-reviewable interpretation compiled from the current structured draft. It becomes stale when evaluation inputs change and is copied unchanged into the published blueprint only after confirmation.
_Avoid_: Client-generated preview, published blueprint, live model output

**Published Job Evaluation Blueprint**:
The recruiter-confirmed immutable interpretation of a structured job's source-backed evaluation inputs, compiled before publication into atomic gates, skill expectations, and normalized job-side scoring expectations without inventing unstated requirements.
_Avoid_: Runtime JD extraction, mutable prompt output, resume evaluation result

**Atomic Resume Gate Requirement**:
One stable requirement compiled from a draft free-text gate into the published evaluation blueprint and independently judged for each resume. Its result retains the raw AI status and evidence; an optional recruiter correction produces the effective gate status without erasing the AI judgment.
_Avoid_: Entire gate text box, scoring deduction, recruiter decision

**Custom Hard Gate**:
A free-text blocking requirement stored under "其他硬性门槛" because it does not fit one of the six named hard-gate categories, such as shift availability or work authorization.
_Avoid_: Catch-all JD text, preference, scoring adjustment

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
The current set of confirmed resume screening rules configured on a legacy job description.
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
A legacy resume screening snapshot created with an older resume screening policy than the current legacy job policy.
_Avoid_: Invalid result, failed screening

**Resume Review**:
The generated evaluation of how a resume record matches a job description, including dimensions, strengths, risks, and next-step guidance.
_Avoid_: Screening result, final candidate outcome, manual feedback note

**Structured Resume Evaluation**:
The current structured-job evaluation artifact containing frozen job expectations, six raw dimension scores, gate evidence, deductions, adjustments, deterministic composite score, and AI narrative. It is stored separately from legacy resume-review v4 results.
_Avoid_: Legacy resume review, recruiter decision, resume-pool note

**Current Resume Evaluation**:
The mode-specific generated artifact currently valid for one resume record and its bound job: legacy v4 for a legacy job or structured V1 for a structured job.
_Avoid_: Any non-null review field, historical evaluation, recruiter decision

**Resume Review Dimension**:
One of the six product-defined aspects always independently scored for a structured resume evaluation: skill match, experience relevance, project match, education/background, potential, or stability. Its configured weight controls only its contribution to the composite score.
_Avoid_: Screening rule, scoring condition, weight

**Resume Review Dimension Score**:
The integer score from 0 to 100 calculated by code for one resume-review dimension from a 100-point baseline, matched standardized deductions, direct-zero rules, and the insufficient-evidence cap. It is retained even when that dimension's configured weight is zero.
_Avoid_: Composite score, weighted score, screening result

**Required Relevant Experience**:
The single source-backed threshold frozen in a structured job's published blueprint, containing the required years and the role, industry, domain, capability, or total-employment scope whose experience counts toward those years. V1 rejects incompatible experience thresholds instead of choosing or combining them.
_Avoid_: Total work years, tenure, model-estimated experience

**Job Resume Scoring Configuration**:
The published structured-job-owned integer weights used to combine all six resume-review dimension scores. New jobs use 35/25/15/10/8/7; a zero weight contributes nothing to the composite without suppressing the raw score, and all six weights always total 100%.
_Avoid_: Global scoring policy, scoring template, reusable weight policy

**Job Scoring Adjustment Rule**:
A dimension-independent, job-description-specific scoring condition stored with free-text condition and a non-zero integer point magnitude from 1 to 100. The condition is either matched or not matched from resume evidence; only matched priority or exclusion conditions adjust the weighted base score.
_Avoid_: Dimension deduction rule, free-form note, automatic rejection, screening rule

**Priority Condition**:
A job scoring adjustment rule with a positive point value for evidence the job prefers.
_Avoid_: Required gate, pass decision, unscored preference

**Exclusion Condition**:
A job scoring adjustment rule with a negative point value for an undesirable match signal. It lowers a score but does not mark the candidate as rejected or as having failed a resume screening gate.
_Avoid_: Resume screening gate, automatic rejection, hard filter

**Job Resume Scoring Snapshot**:
The frozen copy of the published evaluation blueprint, job weights, adjustments, scoring-rule-set version, evaluation-engine version, and model identity used for one structured resume evaluation.
_Avoid_: Live job configuration, current weight settings

**Dimension Deduction Rule**:
A product-defined, fixed-identity rule describing how one resume-review dimension loses points from a 100-point baseline. Rules belong to a versioned catalog pinned when a structured job is published; recruiters do not edit them per job or workspace.
_Avoid_: Soft checklist, free-form score rationale, per-policy deduction table

**Dimension Rule Judgment**:
The evidence-backed result for one applicable deduction rule: matched, not matched, insufficient evidence, or not applicable. Only matched subtracts points; insufficient evidence may cap the dimension score.
_Avoid_: Dimension score, gate status, binary adjustment match

**Resume Evaluation As-Of Date**:
The UTC calendar date fixed at the start of one evaluation run and used by all recency, duration, jump, and gap windows in that run.
_Avoid_: Display time, generated timestamp, current wall-clock lookup

**Resume Evaluation Engine Version**:
The versioned semantic-judgment contract used to judge frozen gates, identify scoring evidence, and match deduction and adjustment rules. It records prompt and model metadata for audit without permanently binding a job to a model that may be retired.
_Avoid_: Deduction rule set, application release, model name alone

**Resume Review Weighted Base Score**:
The six-dimension weighted sum before job-specific priority and exclusion adjustments.
_Avoid_: Final composite score, dimension score, vector similarity

**Resume Review Composite Score**:
The integer from 0 to 100 produced by adding matched priority points and subtracting matched exclusion points from the weighted base score, clamping to 0–100, and rounding to an integer. Within one structured job it drives score sorting and the AI match grade, but it remains advisory to the recruiter.
_Avoid_: Recommendation score, vector similarity score, final HR decision

**AI Resume Match Grade**:
The score-derived structured-job reference grade: 推荐 for 85–100, 匹配 for 75–84, or 不匹配 for 0–74. A failed or needs-verification gate takes presentation and AI-ranking precedence over this grade without erasing the score.
_Avoid_: HR pass status, candidate outcome, screening gate result

**Resume Evaluation Decision**:
The recruiter-owned final pass or fail decision for a resume record. AI gates, match grade, score, and narrative are reference evidence; before a recruiter decides they may lead the presentation, and after a recruiter decides they remain secondary without changing the human decision.
_Avoid_: AI recommendation, match grade, automatic candidate outcome

**HR Resume Assessment**:
A human-written assessment of a resume record that captures the recruiter's judgment separately from the generated resume review.
_Avoid_: Resume review, screening result, interview report

**Resume Reassessment**:
The act of clearing and regenerating the current job's AI evaluation after resume evidence or job binding changes, or after an explicit eligible rerun. It does not itself change a recruiter decision; a job rebind separately resets that decision under the binding contract.
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

**Key Interview Information**:
A recommendation-free set of the candidate's most decision-relevant skill evidence, contextualized quantitative information including stated compensation expectations, and risks stated by the candidate in one AI interview round. Selection prioritizes relevance to the current job while retaining exceptionally material general evidence or risks. Age, marital status, and family circumstances are excluded; an explicit conflict with a job requirement may be retained as an objective constraint. Unverified claims retain candidate-attributed language; resume or form content is included only when the candidate confirms it during that round. It informs an HR member's progression decision without replacing or modifying the interview transcript summary.
_Avoid_: Interview recommendation, overall assessment, interview transcript summary

**Key Skill Evidence**:
A candidate statement that shows a job-relevant skill through an actual usage context, responsibility, problem, or result. A standalone claim that the candidate knows a skill is not key skill evidence.
_Avoid_: Skill keyword, self-rating, inferred capability

**Observed Interview Risk**:
A job-relevant contradiction, capability gap, or work-condition conflict directly exposed by the candidate's answers in one AI interview round.
_Avoid_: Missing coverage, unasked requirement, unverified concern

**Interview Verification Item**:
A decision-relevant candidate statement that remains incomplete or lacks enough detail to confirm or reject. It is explicitly distinct from an observed interview risk.
_Avoid_: Confirmed weakness, negative inference, missing interview coverage

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
