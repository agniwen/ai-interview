---
status: accepted
---

# Define built-in recruiting workspace roles

Workspaces ship six built-in roles so teams no longer grant administrator to everyone who needs to approve offers or to people who only interview: owner, admin, recruiting supervisor (`recruitingSupervisor`), recruiting specialist (`member`), interviewer (`interviewer`) and pending assignment (`noAccess`). The specialist and pending roles keep their existing identifiers and only change their display names, so existing memberships keep working without a data migration.

Admins keep every permission except ownership transfer and workspace deletion. Supervisors and specialists both run daily recruiting and maintain departments, job descriptions, interviewer agents, conversation questions and forms. Only supervisors and administrators may delete recruiting data or configuration, decide offer approvals, open the dashboard, and see the member list read-only. Global interview context is read-only for both. Interviewers only open interview management and the personal center: interview management shows rounds assigned to them, and candidate materials and evaluations are reached through the interviewer invite link (ADR-0034, ADR-0042), so they need no candidate-library permissions. Recruiting data visibility still follows reporting lines (ADR-0043); interviewers create no records and therefore see only their assignments.

Only owners and admins manage members, invitations, reporting lines and peer sharing, because letting supervisors set managers would let them grant themselves visibility. Built-in roles can only grant built-in roles ranked below them: owner, admin, supervisor, specialist, interviewer, pending. Admins can assign every role below admin.

Interview management and approval-flow configuration have their own page permissions (`page:calendar`, `page:offerApprovalTemplates`) instead of sharing the AI interview and approval pages. A data migration grants these pages to existing custom roles that already had the shared page. Members without chat access do not see the agent tab and are sent to their first allowed studio page. Mailbox listener administration moved to the platform console, so the workspace no longer has a mailbox listener page or `mailIngestAccount` permission; members still manage their own mailbox ingest from the personal center.
