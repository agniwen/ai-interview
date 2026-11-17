---
status: accepted
---

# Scope external applications to the workspace

Each workspace shares one reusable anonymous application link so recruiters can distribute a common intake address. Workspace owners and admins can enable or disable it, and members with recruiting permissions can copy it. All workspace members with resume viewing permission can see externally submitted resumes regardless of reporting lines. Existing permissions govern claiming and processing.

While enabled, the link exposes all actively recruiting positions and their canonical job descriptions. The searchable selector defaults to automatic matching against those positions. Selecting a position displays its job description and binds the submission to that position. If the selected position closes before submission, the page preserves the selected files and asks the applicant to choose again.

The page reuses bulk file selection and drag-and-drop, and the intake uses the existing asynchronous resume parsing queue. Resumes carry the 外部投递 source. An automatically matched resume stays in the workspace resume pool with no bound position when no suitable position is found. The page reports acceptance or failure per file and allows retrying failed files individually.
