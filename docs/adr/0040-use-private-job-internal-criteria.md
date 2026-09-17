---
status: accepted
---

# Use optional private job internal criteria in recruiter evaluations

The job form adds an optional Markdown “内部标准” editor below 岗位 JD. This explicitly supersedes the JD-only input restriction in ADR 0029 and the corresponding portion of ADR 0031. The `prompt` field remains the canonical public JD. Internal criteria are a separate nullable field, never merged into JD optimization or public posting content. The form keeps one Save action.

Outside the editing form, the raw criteria appear only in the recruiter job HoverCard. Candidate APIs, referral links, and voice-agent context snapshots must not contain the field. Internal criteria are supplied only to recruiter-side resume evaluation, HR interview evaluation document generation (including recorded initial interviews), and human interview evaluation and its evidence review. Generated documents retain their existing output contracts and do not reproduce the criteria verbatim or treat requirements as candidate facts.

Resume evaluation snapshots store the JD and internal criteria together. Changes or clearing criteria affect future evaluations and explicit reassessments without rewriting historical snapshots or triggering bulk reevaluation. Older snapshots have null criteria and must never fall back to current criteria. Recorded initial interviews keep criteria in their private job snapshot; AI interview document generation and human interview evaluation load the current job criteria at generation time.

Only job-related qualifications and reliable candidate evidence inform assessment. Conflicting JD and internal criteria require human confirmation. Missing evidence does not demonstrate a mismatch. Age, gender, marital/family status and other sensitive personal attributes must not lower ratings or drive recommendation or rejection. Existing four-level resume recommendations and human SABC drafts remain advisory and never change recruiter decisions automatically.
