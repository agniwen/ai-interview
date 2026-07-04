---
status: accepted
---

# Log round invite email sends

Round invite email is a per-round action sent through Resend and recorded in a send log. The MVP supports retry and summary display but does not model delivery webhooks, multiple templates, bulk sending, or per-workspace sender configuration.

## Consequences

The UI should distinguish round invite email from workspace invitations. A failed send should still leave a useful log row for audit and debugging.
