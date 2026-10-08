---
status: accepted
---

# Keep independent interviewer evaluations

Each interviewer owns one draft and one final submission per human interview round. The authenticated or invite-resolved actor determines ownership; clients cannot nominate another reviewer. Draft saves and submissions carry the observed version so stale browser windows cannot overwrite newer work. Other interviewers' unsubmitted drafts are not exposed, except pre-existing shared historical evaluations.

AI suggestions remain in generation snapshots and are shown separately. Saving a new personal draft does not change the round's AI generation state. Adopting an AI suggestion is an explicit action on an empty personal form. Existing AI generation is still stopped once the round has submitted results; it never replaces personal content.

The first formally submitted pass or fail locks the round outcome; inconclusive does not lock it. Later reviewers automatically inherit the locked outcome, with the selector disabled. Draft saves and final submissions enforce this under the existing round lock, including requests from stale clients. Existing decisive round outcomes are retained on rollout. Unsubmitted evaluations do not participate. The aggregate is visible immediately. A pass completes the round immediately. Without a pass, completion and recruitment closure wait for every non-declined round assignee and every non-observer in non-cancelled linked meetings. Later submissions remain possible after a decisive result and cannot change it. Existing pipeline checks prevent historical rounds from advancing a newer stage.

The round's existing evaluation is a compatibility projection, with all submitted comments attributed to their authors. Its scalar rating and role fields come from the earliest submission with the winning outcome; detailed analysis also retains each reviewer's scalar fields. This is not an average or an AI synthesis. Individual records remain the source of truth. Downstream document synchronization replaces its queued aggregate snapshot, invalidates the old lease, and keeps the existing document/block identity; completion notifications are enqueued only when the round first completes.

The additive migration copies the current historical human evaluation into the known author's record. Unattributed content remains a labeled historical record; matching AI snapshots are not converted into human reviews. Existing round status, outcome, snapshots, document sync jobs and notification history are untouched. No historical rounds are reopened or external deliveries replayed by migration. Removed users retain anonymous evaluation records rather than deleting feedback.

Deploy the database migration before the server and web changes. Old clients must refresh after rollout: requests without a version may create a new personal draft, but cannot overwrite an existing one.
