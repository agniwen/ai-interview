---
status: accepted
---

# Support shared workspace invite links

Workspace membership supports reusable shared invite links alongside directed email invitations. Shared links are manually disabled, can be used multiple times, and assign the default role defined by the product rules; directed email invitations remain for one-off member invites.

## Consequences

Do not overload email invitations to behave like shared links. Shared-link joins should be idempotent for existing members and should not require an active workspace context before acceptance.
