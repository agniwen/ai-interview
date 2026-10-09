import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CreatedAtRelativeLabel, getCreatedAtRelation } from "./resume-created-at-relative";

describe("getCreatedAtRelation", () => {
  it("marks a record created before the current resume as earlier", () => {
    expect(getCreatedAtRelation("2026-07-24T08:00:00.000Z", "2026-07-25T08:00:00.000Z")).toBe(
      "earlier",
    );
  });

  it("marks a record created after the current resume as later", () => {
    expect(getCreatedAtRelation("2026-07-26T08:00:00.000Z", "2026-07-25T08:00:00.000Z")).toBe(
      "later",
    );
  });

  it("returns null when the creation times are equal", () => {
    expect(getCreatedAtRelation("2026-07-25T08:00:00.000Z", "2026-07-25T08:00:00.000Z")).toBeNull();
  });
});

describe("CreatedAtRelativeLabel", () => {
  it("renders nothing when the creation times are equal", () => {
    const markup = renderToStaticMarkup(
      <CreatedAtRelativeLabel
        createdAt="2026-07-25T08:00:00.000Z"
        referenceCreatedAt="2026-07-25T08:00:00.000Z"
      />,
    );

    expect(markup).toBe("");
  });
});
