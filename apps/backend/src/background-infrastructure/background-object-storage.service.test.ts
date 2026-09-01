import { describe, expect, it } from "vitest";
import { BackgroundObjectStorageService } from "./background-object-storage.service.js";

describe("BackgroundObjectStorageService typed configuration", () => {
  it("uses the injected key prefix without reading process environment", async () => {
    const storage = new BackgroundObjectStorageService({
      S3_ACCESS_KEY_ID: "access",
      S3_BUCKET_NAME: "bucket",
      S3_ENDPOINT: "https://storage.example.com",
      S3_FORCE_PATH_STYLE: true,
      S3_KEY_PREFIX: "/tenant-prefix/",
      S3_REGION: "auto",
      S3_SECRET_ACCESS_KEY: "secret",
    });

    await expect(storage.buildAttachmentKeyByHash("abc", ".PDF")).resolves.toBe(
      "tenant-prefix/chat-attachments/abc.pdf",
    );
  });

  it("fails lazily with the exact missing typed setting", () => {
    const storage = new BackgroundObjectStorageService({});

    expect(() => storage.buildAttachmentKeyByHash("abc", "pdf")).toThrow(
      "S3_BUCKET_NAME is required",
    );
  });
});
