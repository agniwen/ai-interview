import type {
  InitialInterviewRoles,
  InitialInterviewTurn,
} from "@app/shared/human-initial-interview";
import { rpc } from "./rpc";
import { rpcFetch } from "./api/rpc-fetch";

const resource = rpc.api.w[":slug"].studio.resumes[":id"]["initial-interviews"];

export function listInitialInterviews(slug: string, id: string) {
  return rpcFetch(resource.$get({ param: { id, slug } }), "加载人工初面失败");
}
export function getInitialInterview(slug: string, id: string, snapshotId: string) {
  return rpcFetch(
    resource[":snapshotId"].$get({ param: { id, slug, snapshotId } }),
    "加载资料快照失败",
  );
}
export function getInitialInterviewPlayback(slug: string, id: string, snapshotId: string) {
  return rpcFetch(
    resource[":snapshotId"].playback.$get({ param: { id, slug, snapshotId } }),
    "加载录音副本失败",
  );
}
export function regenerateInitialInterview(
  slug: string,
  id: string,
  snapshotId: string,
  input: {
    requestId: string;
    overwriteDocumentId: string | null;
    roles?: InitialInterviewRoles;
    turns?: InitialInterviewTurn[];
  },
) {
  return rpcFetch(
    resource[":snapshotId"].versions.$post({ json: input, param: { id, slug, snapshotId } }),
    "重新生成失败",
  );
}
export function resumeInitialInterview(
  slug: string,
  id: string,
  versionId: string,
  input: {
    overwriteDocumentId: string | null;
    roles?: InitialInterviewRoles;
  },
) {
  return rpcFetch(
    resource.versions[":versionId"].resume.$post({ json: input, param: { id, slug, versionId } }),
    "提交失败",
  );
}
export function advanceInitialInterview(
  slug: string,
  id: string,
  versionId: string,
  expectedVersion: number,
) {
  return rpcFetch(
    resource.versions[":versionId"].advance.$post({
      json: { expectedVersion },
      param: { id, slug, versionId },
    }),
    "推进流程失败",
  );
}

export function getInitialInterviewResumeUrl(slug: string, id: string, snapshotId: string) {
  return resource[":snapshotId"].resume.$url({ param: { id, slug, snapshotId } }).toString();
}

export function deleteInitialInterview(slug: string, id: string, snapshotId: string) {
  return rpcFetch(
    resource[":snapshotId"].$delete({ param: { id, slug, snapshotId } }),
    "删除人工初面失败",
  );
}
