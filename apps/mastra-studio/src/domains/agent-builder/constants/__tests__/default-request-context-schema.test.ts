import { describe, expect, it } from "vitest";
import { DEFAULT_BUILDER_REQUEST_CONTEXT_SCHEMA } from "../default-request-context-schema";

describe("DEFAULT_BUILDER_REQUEST_CONTEXT_SCHEMA", () => {
  it("exposes a single `user` request-context variable", () => {
    expect(DEFAULT_BUILDER_REQUEST_CONTEXT_SCHEMA.type).toBe("object");
    expect(Object.keys(DEFAULT_BUILDER_REQUEST_CONTEXT_SCHEMA.properties).toSorted()).toEqual([
      "required",
      "user",
    ]);
  });

  it("mirrors the CurrentUser shape with id required", () => {
    const { user } = DEFAULT_BUILDER_REQUEST_CONTEXT_SCHEMA.properties;
    expect(user.type).toEqual("object");
    // Properties must exactly match the keys exposed by CurrentUser. If CurrentUser
    // gains or loses a field, update both the type and this constant.
    expect(Object.keys(user.properties).toSorted()).toEqual(
      ["avatarUrl", "email", "id", "name", "permissions", "roles"].toSorted(),
    );
    expect(user.required).toEqual(["id"]);
  });
});
