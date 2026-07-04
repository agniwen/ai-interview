---
status: accepted
---

# Store global interview config per workspace

Interview-wide settings such as company context, opening instructions, closing instructions, and job-code prefix belong in workspace global config rather than environment variables or hard-coded agent prompts. These settings are injected into interview setup so the voice agent can follow workspace-specific context.

## Consequences

Provider secrets remain environment configuration, but recruiting language and company context are product configuration. New workspace-wide interview behavior should consider global config before adding another hard-coded prompt.
