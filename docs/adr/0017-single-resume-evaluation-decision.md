---
status: accepted
---

# Single user-facing resume evaluation decision

Resume **screening** and resume **review scoring** remain separate mechanisms (rules vs match quality), but the product must not show competing conclusions. Users see one **resume evaluation decision** assembled by deterministic policy, not two agents posting independent badges.

## Decision

- **Screening (and hard filter when it still short-circuits)** owns pass/hold/block style **gate** outcomes: whether the candidate clears the configured bar for progression narrative.
- **Composite six-dimension score** owns **match ranking and score filters among candidates who have cleared screening**. It must not authorize a more lenient outcome than screening (e.g. next step “interview” while screening is hold/block).
- When screening has **not** passed, dimension scores and the composite score **may still be shown** for diagnosis, with explicit copy that they are **not** used for pass ranking or to override the screening conclusion.
- `nextStep.action` is **constrained in code** from screening (and hard filter) results; the qualitative model may supply rationale and interview focus only within the allowed action set.
- Stale or missing screening must not be presented as a final evaluation decision; UI should require refresh or show “screening incomplete” rather than a confident pass/interview.
- Phase 2 scoring will **align deduction triggers with screening-proven facts** (e.g. missing required skills) so raw dimension scores do not contradict screening evidence. Phase 1 uses prompt injection plus decision-table constraints; phase 2 adds structural enforcement.

## Relationship to ADR 0014

ADR 0014 keeps screening distinct from review and from final candidate outcome, and treats six-dimension score as match quality rather than a hidden hard filter. This ADR keeps that separation of **config and storage**, and adds a **single presentation/decision assembly** so the two tracks do not fight in the UI.

## Considered options (rejected)

- Fully merging screening rules and scoring into one runtime artifact in phase 1: high rewrite cost; not required if decision assembly is strict.
- Hiding scores when screening fails: loses diagnostic value; rejected in favor of secondary display with clear non-ranking semantics.
- Relying only on prompt “stay consistent with screening”: too weak for next-step and ranking conflicts.
