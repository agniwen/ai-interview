interface DepartmentScopedInterviewer {
  departmentId: string;
  departmentName: string | null;
  id: string;
  name: string;
}

interface DepartmentSyncedInterviewerSelection {
  departmentId: string;
  interviewerIds: string[];
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
  allowCrossDepartmentInterviewers = false,
): string[] {
  if (allowCrossDepartmentInterviewers || !departmentId) {
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
  allowCrossDepartmentInterviewers = false,
) {
  return interviewers
    .map((item) => {
      const disabled = Boolean(
        !allowCrossDepartmentInterviewers && departmentId && item.departmentId !== departmentId,
      );
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
  allowCrossDepartmentInterviewers,
  currentDepartmentId,
  interviewers,
  nextInterviewerIds,
  previousInterviewerIds,
}: {
  allowCrossDepartmentInterviewers: boolean;
  currentDepartmentId: string;
  interviewers: DepartmentScopedInterviewer[];
  nextInterviewerIds: string[];
  previousInterviewerIds: string[];
}): DepartmentSyncedInterviewerSelection {
  if (allowCrossDepartmentInterviewers) {
    return {
      departmentId: currentDepartmentId,
      interviewerIds: nextInterviewerIds,
    };
  }

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

export function validateJobDescriptionInterviewerDepartments({
  allowCrossDepartmentInterviewers,
  departmentId,
  interviewers,
}: {
  allowCrossDepartmentInterviewers: boolean;
  departmentId: string;
  interviewers: DepartmentScopedInterviewer[];
}): string | null {
  if (allowCrossDepartmentInterviewers) {
    return null;
  }
  const hasCrossDepartmentInterviewer = interviewers.some(
    (item) => item.departmentId !== departmentId,
  );
  return hasCrossDepartmentInterviewer ? "面试官必须属于所选部门，或开启跨部门面试官匹配。" : null;
}
