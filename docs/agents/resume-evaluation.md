# Qualitative Resume Evaluation

Read before changing job setup, JD snapshots, resume evaluation prompts/results, or their presentation. Paths below are relative to the repository root.

## Qualitative Resume Evaluation Configuration Boundary

- Job setup ends with the job description for AI-evaluation inputs. Do not add new recruiter-visible or recruiter-configurable AI evaluation fields after the JD.
- The existing job `prompt` field is the sole canonical JD. Keep its user-facing label as “岗位 JD”; do not merge, copy, or fall back to the legacy `description` field for new snapshots or qualitative evaluation.
- Existing structured-scoring settings (hard gates, dimension weights, deduction rules, priority conditions, and exclusion conditions) remain stored only for historical-result audit and compatibility. Hide them from normal job setup and do not read them when generating a qualitative resume evaluation.
- Do not replace the retired scoring settings with new configuration controls unless an explicit future product decision supersedes `docs/adr/0029-version-qualitative-resume-evaluation.md`.
- Internal persistence needed for immutable JD snapshots, evaluation-contract versions, and versioned results is allowed; those fields are not job settings and must not surface as recruiter configuration.
- Job creation has one Save action and no recruiter-visible draft, scoring-rule preview, or separate publish step. See `docs/adr/0031-save-job-descriptions-without-a-draft-publish-lifecycle.md`.
- A job description must be non-empty, but sparse content only receives a non-blocking notice. Do not add an AI quality gate, mandatory JD template, or preview requirement to job saving.
- In the initial qualitative-evaluation version, factual density and JD alignment are prompt requirements. Do not add structured per-dimension evidence arrays or source-existence validation unless a later explicit product decision requests that hardening.
- Keep qualitative prompt regression as an independent dataset and test script. Real-model regression must not run in the production path, block user actions, or become a product feature.
- Keep the job's Communication Questions and Candidate Forms tabs; they are operational interview configuration, not retired evaluation settings.

## Qualitative Resume Evaluation Output Contract

- New job-bound resume evaluations use exactly four advisory levels: 不推荐, 待定, 推荐, 非常推荐. They never change recruiter decisions or pipeline state automatically.
- 不推荐 requires resume-supported conflict with an explicit core JD responsibility or requirement. Missing or conflicting evidence produces 待定, not 不推荐.
- Each of the six dimensions—技能匹配、经验相关性、项目匹配、教育与背景、潜力、稳定性—returns one of the same four advisory levels plus dense candidate-specific text. Prefer explicit JD requirements; when the JD is silent, apply the versioned general professional evidence standard and label the visible basis accordingly.
- The concise overall evaluation is 1–2 sentences (roughly 50–100 Chinese characters). The detailed evaluation covers overall judgment, key matching evidence, and risks or uncertainties without repeating all six dimensions. Each dimension targets 2–4 information-dense sentences.
- Detailed narrative fields may use restricted Markdown for scanability: bold, italic, ordered lists, and unordered lists only. Do not generate Markdown headings, links, images, tables, code, blockquotes, dividers, task lists, or HTML; concise overall text, level names, and suggestion titles remain plain text. The UI must render this content through the restricted Typeset whitelist rather than raw HTML.
- New results must not contain numeric scores, weights, gates, deductions, priority conditions, exclusion conditions, or skill-checklist output. The UI may map the four ordered dimension levels to non-user-facing radial positions solely to draw the six-dimension qualitative radar chart; those positions are not scores. Seniority recommendation and team positioning are optional and must be omitted when unsupported.
- See `docs/adr/0029-version-qualitative-resume-evaluation.md` and `docs/adr/0030-use-guarded-general-professional-evidence.md` for versioning, presentation, fallback, and history rules.
