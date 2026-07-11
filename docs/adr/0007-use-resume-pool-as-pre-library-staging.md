---
status: accepted
---

# Use resume pool as pre-library staging

The resume pool is a staging area before the resume library, with private and public scopes. Importing from the pool copies a pool item into a workspace resume record and keeps source traceability, while publishing from private to public is copy-based so the original private item remains intact.

## Consequences

Do not treat the resume pool as the resume library. Features that act on active recruiting candidates should use resume records; features that collect or share potential resumes before acceptance should use pool items.
