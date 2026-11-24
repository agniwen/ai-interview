import type {
  CandidateMaterialItem,
  CandidateMaterialOwnerType,
  CreateCandidateMaterialLinkInput,
  UpdateCandidateMaterialInput,
  UploadCandidateMaterialMetadataInput,
} from "@app/shared/candidate-materials";
import { apiFetch, rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

export interface CandidateMaterialsClient {
  candidateMaterialFileUrl: (
    ownerType: CandidateMaterialOwnerType,
    slug: string,
    ownerId: string,
    materialId: string,
  ) => string;
  createCandidateMaterialLink: (
    ownerType: CandidateMaterialOwnerType,
    slug: string,
    ownerId: string,
    input: CreateCandidateMaterialLinkInput,
  ) => Promise<CandidateMaterialItem>;
  deleteCandidateMaterial: (
    ownerType: CandidateMaterialOwnerType,
    slug: string,
    ownerId: string,
    materialId: string,
  ) => Promise<{ success: boolean }>;
  listCandidateMaterials: (
    ownerType: CandidateMaterialOwnerType,
    slug: string,
    ownerId: string,
  ) => Promise<CandidateMaterialItem[]>;
  updateCandidateMaterial: (
    ownerType: CandidateMaterialOwnerType,
    slug: string,
    ownerId: string,
    materialId: string,
    patch: UpdateCandidateMaterialInput,
  ) => Promise<CandidateMaterialItem>;
  uploadCandidateMaterialFile: (
    ownerType: CandidateMaterialOwnerType,
    slug: string,
    ownerId: string,
    file: File,
    metadata?: UploadCandidateMaterialMetadataInput,
  ) => Promise<CandidateMaterialItem>;
}

function materialsEndpoint(ownerType: CandidateMaterialOwnerType) {
  return ownerType === "resume_pool_item"
    ? rpc.api.w[":slug"].studio["resume-pool"][":id"].materials
    : rpc.api.w[":slug"].studio.resumes[":id"].materials;
}

function materialsBasePath(ownerType: CandidateMaterialOwnerType, slug: string, ownerId: string) {
  const segment = ownerType === "resume_pool_item" ? "resume-pool" : "resumes";
  return `/api/w/${encodeURIComponent(slug)}/studio/${segment}/${encodeURIComponent(ownerId)}/materials`;
}

function uploadMaterialFormData(
  uploadUrl: string,
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
  return apiFetch<CandidateMaterialItem>(uploadUrl, {
    body,
    method: "POST",
  });
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
  return uploadMaterialFormData(
    `${materialsBasePath(ownerType, slug, ownerId)}/files`,
    file,
    metadata,
  );
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

export function createExternalApplicationMaterialsClient(token: string): CandidateMaterialsClient {
  const endpoint =
    rpc.api.public["external-applications"][":token"].resumes[":requestId"].materials;
  const basePath = (requestId: string) =>
    `/api/public/external-applications/${encodeURIComponent(token)}/resumes/${encodeURIComponent(requestId)}/materials`;

  return {
    candidateMaterialFileUrl: (_ownerType, _slug, requestId, materialId) =>
      `${basePath(requestId)}/${encodeURIComponent(materialId)}/file`,
    createCandidateMaterialLink: (_ownerType, _slug, requestId, input) =>
      rpcFetch(
        endpoint.links.$post({
          json: input,
          param: { requestId, token },
        }),
        "添加资料链接失败",
      ),
    deleteCandidateMaterial: (_ownerType, _slug, requestId, materialId) =>
      rpcFetch(
        endpoint[":materialId"].$delete({
          param: { materialId, requestId, token },
        }),
        "删除补充资料失败",
      ),
    listCandidateMaterials: (_ownerType, _slug, requestId) =>
      rpcFetch(
        endpoint.$get({
          param: { requestId, token },
        }),
        "加载补充资料失败",
      ),
    updateCandidateMaterial: (_ownerType, _slug, requestId, materialId, patch) =>
      rpcFetch(
        endpoint[":materialId"].$patch({
          json: patch,
          param: { materialId, requestId, token },
        }),
        "保存补充资料失败",
      ),
    uploadCandidateMaterialFile: (_ownerType, _slug, requestId, file, metadata) =>
      uploadMaterialFormData(`${basePath(requestId)}/files`, file, metadata),
  };
}
