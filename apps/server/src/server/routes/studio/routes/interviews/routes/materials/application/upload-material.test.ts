import { describe, expect, it, vi } from "vitest";
import { uploadMaterial } from "./upload-material";
import { RECRUITING_MATERIAL_MAX_BYTES } from "@app/shared/recruiting-materials";

type Dependencies = NonNullable<Parameters<typeof uploadMaterial>[2]>;
const scope = { actorId: "hr", organizationId: "org", recruitingRecordId: "candidate" };

function setup(initialCount = 0) {
  let count = initialCount;
  let lock = Promise.resolve(0);
  const insert = vi.fn(() => {
    count += 1;
    return Promise.resolve();
  });
  const dependencies: Dependencies = {
    buildRecruitingMaterialKey: vi.fn(() => Promise.resolve("recruiting-materials/test")),
    deleteRecruitingMaterialObject: vi.fn(async () => {}),
    putObjectBytes: vi.fn(async () => {}),
    withMaterialLock: async (_scope, action) => {
      const previous = lock;
      const pending = Promise.withResolvers<number>();
      lock = pending.promise;
      await previous;
      try {
        return await action({ count: () => Promise.resolve(count), insert });
      } finally {
        pending.resolve(0);
      }
    },
  };
  return { dependencies, insert };
}

describe("upload recruiting material", () => {
  it("persists the real file and scoped metadata", async () => {
    const { dependencies, insert } = setup();
    const file = new File(["image bytes"], "流水.png", { type: "image/png" });
    await uploadMaterial(scope, file, dependencies);
    expect(dependencies.putObjectBytes).toHaveBeenCalledWith(
      expect.objectContaining({
        body: new TextEncoder().encode("image bytes"),
        contentType: "image/png",
      }),
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "流水.png",
        kind: "income_proof",
        organizationId: "org",
        recruitingRecordId: "candidate",
        sizeBytes: 11,
        uploadedBy: "hr",
      }),
    );
  });

  it("accepts exactly 20 MB and rejects larger files before storage", async () => {
    const { dependencies } = setup();
    await uploadMaterial(
      scope,
      new File([new Uint8Array(RECRUITING_MATERIAL_MAX_BYTES)], "limit.pdf"),
      dependencies,
    );
    expect(dependencies.putObjectBytes).toHaveBeenCalledTimes(1);
    await expect(
      uploadMaterial(
        scope,
        new File([new Uint8Array(RECRUITING_MATERIAL_MAX_BYTES + 1)], "large.pdf"),
        dependencies,
      ),
    ).rejects.toThrow("超过 20 MB");
    expect(dependencies.putObjectBytes).toHaveBeenCalledTimes(1);
  });

  it("counts inside the record lock so two uploads cannot exceed ten", async () => {
    const { dependencies, insert } = setup(9);
    const results = await Promise.allSettled([
      uploadMaterial(scope, new File(["a"], "a.pdf"), dependencies),
      uploadMaterial(scope, new File(["b"], "b.png"), dependencies),
    ]);
    expect(results.map((result) => result.status).toSorted()).toEqual(["fulfilled", "rejected"]);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(dependencies.putObjectBytes).toHaveBeenCalledTimes(1);
  });

  it("cleans the uploaded object if metadata persistence fails", async () => {
    const { dependencies, insert } = setup();
    insert.mockRejectedValueOnce(new Error("db failed"));
    await expect(uploadMaterial(scope, new File(["a"], "a.pdf"), dependencies)).rejects.toThrow(
      "db failed",
    );
    expect(dependencies.deleteRecruitingMaterialObject).toHaveBeenCalledWith(
      "recruiting-materials/test",
    );
  });

  it("does not insert metadata when storage fails", async () => {
    const { dependencies, insert } = setup();
    vi.mocked(dependencies.putObjectBytes).mockRejectedValueOnce(new Error("storage failed"));
    await expect(uploadMaterial(scope, new File(["a"], "a.pdf"), dependencies)).rejects.toThrow(
      "storage failed",
    );
    expect(insert).not.toHaveBeenCalled();
  });
});
