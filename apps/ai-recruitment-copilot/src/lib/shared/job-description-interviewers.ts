interface DepartmentScopedInterviewer {
  departmentId: string;
  departmentName: string | null;
  id: string;
  name: string;
}

export function getInterviewersForDepartment<T extends DepartmentScopedInterviewer>(
  interviewers: T[],
  departmentId: string,
): T[] {
  if (!departmentId) {
    return interviewers;
  }
  return interviewers.filter((item) => item.departmentId === departmentId);
}

export function filterInterviewerIdsByDepartment(
  interviewers: DepartmentScopedInterviewer[],
  departmentId: string,
  interviewerIds: string[],
): string[] {
  if (!departmentId) {
    return interviewerIds;
  }
  const validIds = new Set(
    interviewers.filter((item) => item.departmentId === departmentId).map((item) => item.id),
  );
  return interviewerIds.filter((id) => validIds.has(id));
}

export function buildJobDescriptionInterviewerOptions(
  interviewers: DepartmentScopedInterviewer[],
  departmentId: string,
) {
  return interviewers
    .map((item) => {
      const disabled = Boolean(departmentId && item.departmentId !== departmentId);
      return {
        description: item.departmentName ?? "未知部门",
        disabled,
        label: item.name,
        value: item.id,
      };
    })
    .toSorted((a, b) => Number(a.disabled) - Number(b.disabled));
}

export function getDepartmentSyncedInterviewerSelection({
  currentDepartmentId,
  interviewers,
  nextInterviewerIds,
  previousInterviewerIds,
}: {
  currentDepartmentId: string;
  interviewers: DepartmentScopedInterviewer[];
  nextInterviewerIds: string[];
  previousInterviewerIds: string[];
}): { departmentId: string; interviewerIds: string[] } {
  const addedInterviewerId = nextInterviewerIds.find((id) => !previousInterviewerIds.includes(id));
  const anchorInterviewerId = addedInterviewerId ?? nextInterviewerIds[0];
  const anchorInterviewer = interviewers.find((item) => item.id === anchorInterviewerId);
  const departmentId = anchorInterviewer?.departmentId ?? currentDepartmentId;

  return {
    departmentId,
    interviewerIds: filterInterviewerIdsByDepartment(
      interviewers,
      departmentId,
      nextInterviewerIds,
    ),
  };
}
