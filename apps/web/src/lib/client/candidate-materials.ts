import type {
  CandidateMaterialItem,
  CandidateMaterialOwnerType,
  CreateCandidateMaterialLinkInput,
  UpdateCandidateMaterialInput,
  UploadCandidateMaterialMetadataInput,
} from "@app/shared/candidate-materials";
import { apiFetch, rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

function materialsEndpoint(ownerType: CandidateMaterialOwnerType) {
  return ownerType === "resume_pool_item"
    ? rpc.api.w[":slug"].studio["resume-pool"][":id"].materials
    : rpc.api.w[":slug"].studio.resumes[":id"].materials;
}

function materialsBasePath(ownerType: CandidateMaterialOwnerType, slug: string, ownerId: string) {
  const segment = ownerType === "resume_pool_item" ? "resume-pool" : "resumes";
  return `/api/w/${encodeURIComponent(slug)}/studio/${segment}/${encodeURIComponent(ownerId)}/materials`;
}

export function candidateMaterialFileUrl(
  ownerType: CandidateMaterialOwnerType,
  slug: string,
  ownerId: string,
  materialId: string,
) {
  return `${materialsBasePath(ownerType, slug, ownerId)}/${encodeURIComponent(materialId)}/file`;
}

export function listCandidateMaterials(
  ownerType: CandidateMaterialOwnerType,
  slug: string,
  ownerId: string,
): Promise<CandidateMaterialItem[]> {
  return rpcFetch(
    materialsEndpoint(ownerType).$get({
      param: { id: ownerId, slug },
    }),
    "加载补充资料失败",
  );
}

export function createCandidateMaterialLink(
  ownerType: CandidateMaterialOwnerType,
  slug: string,
  ownerId: string,
  input: CreateCandidateMaterialLinkInput,
): Promise<CandidateMaterialItem> {
  return rpcFetch(
    materialsEndpoint(ownerType).links.$post({
      json: input,
      param: { id: ownerId, slug },
    }),
    "添加资料链接失败",
  );
}

export function uploadCandidateMaterialFile(
  ownerType: CandidateMaterialOwnerType,
  slug: string,
  ownerId: string,
  file: File,
  metadata?: UploadCandidateMaterialMetadataInput,
): Promise<CandidateMaterialItem> {
  const body = new FormData();
  body.append("file", file);
  if (metadata?.title?.trim()) {
    body.append("title", metadata.title.trim());
  }
  if (metadata?.category) {
    body.append("category", metadata.category);
  }
  if (metadata?.notes !== undefined) {
    body.append("notes", metadata.notes);
  }
  return apiFetch<CandidateMaterialItem>(`${materialsBasePath(ownerType, slug, ownerId)}/files`, {
    body,
    method: "POST",
  });
}

export function updateCandidateMaterial(
  ownerType: CandidateMaterialOwnerType,
  slug: string,
  ownerId: string,
  materialId: string,
  patch: UpdateCandidateMaterialInput,
): Promise<CandidateMaterialItem> {
  return rpcFetch(
    materialsEndpoint(ownerType)[":materialId"].$patch({
      json: patch,
      param: { id: ownerId, materialId, slug },
    }),
    "保存补充资料失败",
  );
}

export function deleteCandidateMaterial(
  ownerType: CandidateMaterialOwnerType,
  slug: string,
  ownerId: string,
  materialId: string,
) {
  return rpcFetch(
    materialsEndpoint(ownerType)[":materialId"].$delete({
      param: { id: ownerId, materialId, slug },
    }),
    "删除补充资料失败",
  );
}
