import type {
  HumanInitialInterviewDetail,
  InitialInterviewList,
  InitialInterviewRoles,
} from "@app/shared/human-initial-interview";
import { apiUrl } from "./rpc";
import { apiJson } from "./rpc-fetch";

function path(slug: string, recordId: string) {
  return `/api/w/${encodeURIComponent(slug)}/studio/resumes/${encodeURIComponent(recordId)}/initial-interviews`;
}
export function fetchInitialInterviews(slug: string, recordId: string) {
  return apiJson<InitialInterviewList>(apiUrl(path(slug, recordId)), "加载评价表信息失败");
}
export function fetchInitialInterview(slug: string, recordId: string, snapshotId: string) {
  return apiJson<HumanInitialInterviewDetail>(
    apiUrl(`${path(slug, recordId)}/${encodeURIComponent(snapshotId)}`),
    "加载资料快照失败",
  );
}
export function createInitialInterview(
  slug: string,
  recordId: string,
  input: {
    meetingId: string;
    requestId: string;
    overwriteDocumentId: string | null;
  },
) {
  return apiJson<{ id: string }>(apiUrl(path(slug, recordId)), "生成评价表失败", {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}
export function resumeInitialInterview(
  slug: string,
  recordId: string,
  versionId: string,
  input: {
    roles: InitialInterviewRoles;
    overwriteDocumentId: string | null;
  },
) {
  return apiJson<{ id: string }>(
    apiUrl(`${path(slug, recordId)}/versions/${encodeURIComponent(versionId)}/resume`),
    "确认说话人失败",
    {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
}
export function recruitingInitialInterviewUrl(slug: string, recordId: string) {
  return apiUrl(
    `/w/${encodeURIComponent(slug)}/studio/resumes/${encodeURIComponent(recordId)}?tab=rounds`,
  );
}
