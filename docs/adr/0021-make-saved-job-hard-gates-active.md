---
status: superseded by ADR-0023
---

# Make saved job hard gates active

The JD editor models hard gates as seven independently stored free-text fields: education, work years, required skills, work location, language ability, required certificates, and other hard requirements. The fixed categories provide structure without requiring maintained option lists or constraining nuanced requirements such as school tier, major, relevant-industry experience, or work arrangement. Every saved non-empty field is blocking and active without a separate enable or severity control; saving the JD is the recruiter confirmation, while an empty hard-gate configuration means the job has no hard gates. Softer preferences and risks belong to job scoring adjustment rules rather than the hard-gate editor.

This narrows the JD configuration portion of ADR-0014; its decisions about evidence, snapshots, reassessment, and separating screening from review scoring remain in force.

In the first JD-configuration delivery, "active" means confirmed as part of the saved job configuration only. The existing screening runtime does not consume these new gates until a later integration.

Legacy `resumeScreeningPolicy` data remains stored and continues to drive the existing screening runtime. It is not automatically converted into the new hard-gate configuration because legacy warning and informational rules cannot safely become blocking gates. Existing jobs therefore initialize the new structure with empty gates and adjustments plus default weights, while the legacy policy remains behaviorally unchanged.
