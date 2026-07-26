---
status: accepted
---

# Use a question TaskGroup for AI interviews

AI interview rounds use one `InterviewAgent` with readiness and wrap-up tasks around a `TaskGroup` of required-question tasks, rather than a monolithic prompt or agent handoffs. The backend dispatches a V2-only structured question contract containing stable question IDs, difficulty, evaluation focus, and follow-up directions; each task owns its question outcome and bounded behavior while retaining the shared conversation context without TaskGroup summarization. This keeps latency-sensitive prompts focused, preserves one consistent interviewer persona, and makes question coverage deterministic without treating workflow state as evaluation evidence.

Each completed question is checkpointed idempotently, while the final report remains authoritative and scores only transcript-backed evidence. `answered`, `insufficient`, and `skipped` questions participate in the overall-score denominator; `interrupted` and `unasked` questions do not. Insufficient coverage below half of the required questions forces a pending recommendation even when a partial score exists. Studio presents question coverage and report evidence together in the existing evaluation-metrics surface, but does not expose checkpoints as live evaluation results.

Interview active time pauses during bounded hot reconnects. The workflow stops starting required questions at 18:30, ends the current task at 21:00, performs wrap-up by 24:00, and reserves 25:00 as a stuck-session kill boundary. Per-question outcomes record why coverage ended, while the separate call completion status distinguishes `success`, usable `partial`, and technical `failed` calls.
