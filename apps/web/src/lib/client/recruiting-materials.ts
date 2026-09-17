import { apiFetch, rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

export function materialFileUrl(slug: string, candidateId: string, materialId: string) {
  return `/api/w/${encodeURIComponent(slug)}/studio/interviews/${encodeURIComponent(candidateId)}/materials/${encodeURIComponent(materialId)}/file`;
}

export function listRecruitingMaterials(slug: string, candidateId: string) {
  return rpcFetch(
    rpc.api.w[":slug"].studio.interviews[":id"].materials.$get({
      param: { id: candidateId, slug },
    }),
    "加载附件失败",
  );
}

export function deleteRecruitingMaterial(slug: string, candidateId: string, materialId: string) {
  return rpcFetch(
    rpc.api.w[":slug"].studio.interviews[":id"].materials[":materialId"].$delete({
      param: { id: candidateId, materialId, slug },
    }),
    "删除附件失败",
  );
}

export function uploadRecruitingMaterial(slug: string, candidateId: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiFetch(
    `/api/w/${encodeURIComponent(slug)}/studio/interviews/${encodeURIComponent(candidateId)}/materials`,
    { body, method: "POST" },
  );
}
