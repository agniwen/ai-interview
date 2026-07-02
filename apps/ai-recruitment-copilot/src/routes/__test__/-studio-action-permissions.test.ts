import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(srcRoot, relativePath), "utf-8");
}

describe("studio action permission gates", () => {
  it("gates job description create/update/delete actions separately from read access", () => {
    const source = readSource("routes/w.$slug.studio.job-descriptions.tsx");

    expect(source).toContain('useHasPermission("jd", "create")');
    expect(source).toContain('useHasPermission("jd", "update")');
    expect(source).toContain('useHasPermission("jd", "delete")');
    expect(source).toContain("canCreateJobDescription ? (");
    expect(source).toContain("show: () => canUpdateJobDescription");
    expect(source).toContain("show: () => canDeleteJobDescription");
    expect(source).toContain("record={canDeleteJobDescription ? crud.deleteRecord : null}");
  });

  it("keeps scoped job detail entry points read-gated and non-clickable without read permission", () => {
    const jobDescriptionSource = readSource("routes/w.$slug.studio.job-descriptions.tsx");
    const departmentSource = readSource("routes/w.$slug.studio.departments.tsx");
    const interviewerSource = readSource("routes/w.$slug.studio.interviewers.tsx");
    const interviewsSource = readSource("routes/w.$slug.studio.interviews.tsx");
    const scopedInterviewersSource = readSource(
      "components/features/studio/scoped-interviewers-modal.tsx",
    );

    expect(jobDescriptionSource).toContain('useHasPermission("resumeLibrary", "read")');
    expect(jobDescriptionSource).toContain("open={canReadResumeLibrary && resumesScope !== null}");
    expect(departmentSource).toContain('useHasPermission("interviewer", "read")');
    expect(departmentSource).toContain('useHasPermission("jd", "read")');
    expect(interviewerSource).toContain('useHasPermission("jd", "read")');
    expect(interviewsSource).toContain("jobDescriptionId={canReadJobDescriptions");
    expect(scopedInterviewersSource).toContain('useHasPermission("jd", "read")');
    expect(scopedInterviewersSource).toContain(
      "open={canReadJobDescriptions && nestedInterviewer !== null}",
    );
  });

  it("gates create/update/delete actions on studio resource tables", () => {
    const expectations = [
      {
        create: "canCreateDepartment ? (",
        deleteAction: "show: () => canDeleteDepartment",
        deleteRecord: "record={canDeleteDepartment ? crud.deleteRecord : null}",
        file: "routes/w.$slug.studio.departments.tsx",
        resource: "department",
        updateAction: "show: () => canUpdateDepartment",
      },
      {
        create: "canCreateInterviewer ? (",
        deleteAction: "show: () => canDeleteInterviewer",
        deleteRecord: "record={canDeleteInterviewer ? crud.deleteRecord : null}",
        file: "routes/w.$slug.studio.interviewers.tsx",
        resource: "interviewer",
        updateAction: "show: () => canUpdateInterviewer",
      },
      {
        create: "canCreateCandidateForm ? (",
        deleteAction: "show: (r) => canDeleteCandidateForm && !r.archivedAt",
        deleteRecord: "record={canDeleteCandidateForm ? crud.deleteRecord : null}",
        file: "routes/w.$slug.studio.forms.tsx",
        resource: "candidateForm",
        updateAction: "show: () => canUpdateCandidateForm",
      },
      {
        create: "canCreateQuestionTemplate ? (",
        deleteAction: "show: (r) => canDeleteQuestionTemplate && !r.archivedAt",
        deleteRecord: "record={canDeleteQuestionTemplate ? crud.deleteRecord : null}",
        file: "routes/w.$slug.studio.interview-questions.tsx",
        resource: "questionTemplate",
        updateAction: "show: () => canUpdateQuestionTemplate",
      },
      {
        create: null,
        deleteAction: "show: () => canDeleteInterview",
        deleteRecord: "open={canDeleteInterview && deleteRecord !== null}",
        file: "routes/w.$slug.studio.interviews.tsx",
        resource: "interview",
        updateAction: "show: () => canUpdateInterview",
      },
    ] as const;

    for (const item of expectations) {
      const source = readSource(item.file);
      if (item.create) {
        expect(source).toContain(`useHasPermission("${item.resource}", "create")`);
        expect(source).toContain(item.create);
      }
      expect(source).toContain(`useHasPermission("${item.resource}", "update")`);
      expect(source).toContain(`useHasPermission("${item.resource}", "delete")`);
      expect(source).toContain(item.updateAction);
      expect(source).toContain(item.deleteAction);
      expect(source).toContain(item.deleteRecord);
    }
  });

  it("gates destructive actions inside scoped job description modals", () => {
    const source = readSource("components/features/studio/scoped-job-descriptions-modal.tsx");

    expect(source).toContain('useHasPermission("jd", "delete")');
    expect(source).toContain("show: () => canDeleteJobDescription");
    expect(source).toContain("record={canDeleteJobDescription ? crud.deleteRecord : null}");
  });
});
