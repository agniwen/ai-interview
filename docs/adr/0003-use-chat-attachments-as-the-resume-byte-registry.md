---
status: accepted
---

# Use chat attachments as the resume byte registry

Uploaded resume bytes are keyed by content hash, and chat attachments act as the shared registry for storage keys and parsed structured resume facts. Studio resume and interview flows can reuse the same stored bytes and parsed facts, while each business record keeps its own denormalized resume snapshot for stable reads.

## Consequences

Do not add a second shared blob registry for resume PDFs without revisiting this decision. Reusing parsed resume facts is acceptable, but interview questions remain generated from the current job and template context instead of being cached by file hash.
