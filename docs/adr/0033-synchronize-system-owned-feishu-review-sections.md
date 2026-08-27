---
status: accepted
---

# Synchronize system-owned Feishu review sections

The Platform Administrator maintenance action may insert missing Resume Evaluation and Recommended Interview Questions sections or synchronize their generated children when current source data differs. Those two callouts are wholly system-owned, so synchronization may replace manual edits made inside them; reviewer-owned sections and all blocks outside them remain untouched. Synchronization is content-aware and idempotent. This narrowly supersedes ADR-0018's blanket prohibition on post-creation document body changes without making the Feishu document a report source of truth.
