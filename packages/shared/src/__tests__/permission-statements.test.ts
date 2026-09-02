import { describe, expect, it } from "vitest";
import {
  clonePermissionStatements,
  hasPermissionInStatements,
  normalizePermissionStatements,
} from "@app/shared/permission-statements";

describe("permission-statements", () => {
  it("checks resource/action membership", () => {
    const statements = {
      interview: ["create", "read"],
      page: ["resumes"],
    };

    expect(hasPermissionInStatements(statements, "interview", "create")).toBe(true);
    expect(hasPermissionInStatements(statements, "interview", "delete")).toBe(false);
    expect(hasPermissionInStatements(statements, "page", "resumes")).toBe(true);
    expect(hasPermissionInStatements(undefined, "page", "resumes")).toBe(false);
  });

  it("normalizes unknown and invalid permission blobs", () => {
    expect(normalizePermissionStatements(null)).toEqual({});
    expect(normalizePermissionStatements("nope")).toEqual({});
    expect(
      normalizePermissionStatements({
        empty: [],
        interview: ["create", 1, "read"],
        page: "resumes",
      }),
    ).toEqual({
      interview: ["create", "read"],
    });
  });

  it("clones statements without sharing action arrays", () => {
    const original = { interview: ["read"] };
    const cloned = clonePermissionStatements(original);
    cloned.interview?.push("create");
    expect(original.interview).toEqual(["read"]);
  });
});
