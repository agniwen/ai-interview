import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "../../../../../../factory";
import { createMaterialsRouter } from "./route";
import type { MaterialsRouteDependencies } from "./route";

const mocks = {
  deleteRecruitingMaterialObject:
    vi.fn<MaterialsRouteDependencies["deleteRecruitingMaterialObject"]>(),
  findMaterial: vi.fn<MaterialsRouteDependencies["findMaterial"]>(),
  getObjectStream: vi.fn<MaterialsRouteDependencies["getObjectStream"]>(),
  listMaterials: vi.fn<MaterialsRouteDependencies["listMaterials"]>(),
  loadResumeDetail: vi.fn<MaterialsRouteDependencies["loadResumeDetail"]>(),
  removeMaterial: vi.fn<MaterialsRouteDependencies["removeMaterial"]>(),
  resolveRecruitingVisibilityScope:
    vi.fn<MaterialsRouteDependencies["resolveRecruitingVisibilityScope"]>(),
  updateMaterialMetadata: vi.fn<MaterialsRouteDependencies["updateMaterialMetadata"]>(),
  uploadMaterial: vi.fn<MaterialsRouteDependencies["uploadMaterial"]>(),
};
const materialsRouter = createMaterialsRouter({
  ...mocks,
  requirePermission: (_resource, action) =>
    factory.createMiddleware(async (c, next) => {
      if (c.req.header("x-deny") === action) {
        return c.json({ message: "Forbidden" }, 403);
      }
      return await next();
    }),
});

function app() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      // SAFETY: Minimal authenticated workspace fixture used only by this router.
      c.set("activeOrg", { id: "org" } as never);
      // SAFETY: Minimal authenticated workspace fixture used only by this router.
      c.set("member", { role: "hr" } as never);
      // SAFETY: Minimal authenticated workspace fixture used only by this router.
      c.set("user", { id: "hr" } as never);
      await next();
    })
    .route("/:id/materials", materialsRouter);
}

beforeEach(() => {
  vi.clearAllMocks();
  // SAFETY: Only existence of the candidate is consumed by this route.
  mocks.loadResumeDetail.mockResolvedValue({ id: "candidate" } as NonNullable<
    Awaited<ReturnType<MaterialsRouteDependencies["loadResumeDetail"]>>
  >);
  mocks.resolveRecruitingVisibilityScope.mockResolvedValue({ kind: "all" });
  mocks.listMaterials.mockResolvedValue([]);
});

describe("recruiting materials HTTP access", () => {
  it.each(["/candidate/materials", "/candidate/materials/file-id/file"])(
    "rejects invisible candidates at %s",
    async (url) => {
      mocks.loadResumeDetail.mockResolvedValue(null);
      const response = await app().request(url);
      expect(response.status).toBe(404);
      expect(mocks.listMaterials).not.toHaveBeenCalled();
      expect(mocks.findMaterial).not.toHaveBeenCalled();
    },
  );

  it("checks workspace and record visibility before listing", async () => {
    const response = await app().request("/candidate/materials");
    expect(response.status).toBe(200);
    expect(mocks.loadResumeDetail).toHaveBeenCalledWith("candidate", "org", { kind: "all" });
    expect(mocks.listMaterials).toHaveBeenCalledWith({
      actorId: "hr",
      organizationId: "org",
      recruitingRecordId: "candidate",
    });
  });

  it.each(["read", "create", "delete", "update"])(
    "enforces offer %s permission",
    async (action) => {
      const method = { create: "POST", delete: "DELETE", read: "GET", update: "PATCH" }[action];
      const url =
        action === "delete" || action === "update"
          ? "/candidate/materials/file-id"
          : "/candidate/materials";
      const response = await app().request(url, { headers: { "x-deny": action }, method });
      expect(response.status).toBe(403);
      expect(mocks.uploadMaterial).not.toHaveBeenCalled();
      expect(mocks.removeMaterial).not.toHaveBeenCalled();
    },
  );

  it("downloads arbitrary files without rendering active content", async () => {
    // SAFETY: Download consumes only fileName and storageKey from this material fixture.
    mocks.findMaterial.mockResolvedValue({
      fileName: "流水.html",
      storageKey: "private/key",
    } as Awaited<ReturnType<MaterialsRouteDependencies["findMaterial"]>>);
    mocks.getObjectStream.mockResolvedValue({ body: new Blob(["<script>test</script>"]).stream() });
    const response = await app().request("/candidate/materials/file-id/file");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toContain("attachment;");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.findMaterial).toHaveBeenCalledWith(
      { actorId: "hr", organizationId: "org", recruitingRecordId: "candidate" },
      "file-id",
    );
  });

  it("rejects multiple files in a single upload", async () => {
    const body = new FormData();
    body.append("file", new File(["a"], "a.pdf"));
    body.append("file", new File(["b"], "b.pdf"));
    const response = await app().request("/candidate/materials", { body, method: "POST" });
    expect(response.status).toBe(400);
    expect(mocks.uploadMaterial).not.toHaveBeenCalled();
  });
});

const metadataUrl = "/candidate/materials/file-id";
function metadataRequest(value: { incomeType: string; notes: string }) {
  return {
    body: JSON.stringify(value),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  };
}

it("saves metadata only for the visible workspace record", async () => {
  mocks.updateMaterialMetadata.mockResolvedValue({ id: "file-id" });
  const metadata = { incomeType: "stock", notes: "归属期说明\n第二行" };
  const response = await app().request(metadataUrl, metadataRequest(metadata));
  expect(response.status).toBe(200);
  expect(mocks.updateMaterialMetadata).toHaveBeenCalledWith(
    { actorId: "hr", organizationId: "org", recruitingRecordId: "candidate" },
    "file-id",
    metadata,
  );
});

it.each([
  { incomeType: "invalid", notes: "" },
  { incomeType: "bonus", notes: "字".repeat(501) },
])("rejects invalid attachment metadata", async (metadata) => {
  const response = await app().request(metadataUrl, metadataRequest(metadata));
  expect(response.status).toBe(400);
  expect(mocks.updateMaterialMetadata).not.toHaveBeenCalled();
});

it("does not update an invisible record", async () => {
  mocks.loadResumeDetail.mockResolvedValue(null);
  const response = await app().request(
    metadataUrl,
    metadataRequest({ incomeType: "bonus", notes: "" }),
  );
  expect(response.status).toBe(404);
  expect(mocks.updateMaterialMetadata).not.toHaveBeenCalled();
});

it("passes uploaded file metadata to persistence", async () => {
  const body = new FormData();
  body.append("file", new File(["data"], "income.pdf"));
  body.append("incomeType", "annual_bonus");
  body.append("notes", "年度奖金");
  mocks.uploadMaterial.mockResolvedValue({ id: "00000000-0000-0000-0000-000000000001" });
  const response = await app().request("/candidate/materials", { body, method: "POST" });
  expect(response.status).toBe(201);
  expect(mocks.uploadMaterial).toHaveBeenCalledWith(expect.anything(), expect.any(File), {
    incomeType: "annual_bonus",
    notes: "年度奖金",
  });
});

it("accepts exactly 500 characters in attachment notes", async () => {
  const metadata = { incomeType: "bonus", notes: "字".repeat(500) };
  mocks.updateMaterialMetadata.mockResolvedValue({ id: "file-id" });
  const response = await app().request(metadataUrl, metadataRequest(metadata));
  expect(response.status).toBe(200);
  expect(mocks.updateMaterialMetadata).toHaveBeenCalledWith(expect.anything(), "file-id", metadata);
});

it("accepts uploads without type or notes", async () => {
  const body = new FormData();
  body.append("file", new File(["data"], "income.pdf"));
  mocks.uploadMaterial.mockResolvedValue({ id: "00000000-0000-0000-0000-000000000001" });
  const response = await app().request("/candidate/materials", { body, method: "POST" });
  expect(response.status).toBe(201);
  expect(mocks.uploadMaterial).toHaveBeenCalledWith(expect.anything(), expect.any(File), {
    incomeType: null,
    notes: "",
  });
});
