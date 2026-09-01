# Candidate Lifecycle

Candidate Lifecycle owns a candidate's path from document intake through recruiting outcomes, including interview rounds that belong to the Candidate Recruiting Record.

## Language

**Candidate Lifecycle**:
The connected intake, resume-library, evaluation, recruiting-pipeline, interview, offer, and notification work for candidates in a Workspace.
_Avoid_: Interview module, resume feature

**Candidate Document**:
A resume or supporting document registered for candidate intake and later referenced by a Resume Record.
_Avoid_: Chat attachment, storage object

**Recruiting Timeline**:
The append-only sequence of domain events that explains changes to one Candidate Recruiting Record.
_Avoid_: Shared audit table, application log
