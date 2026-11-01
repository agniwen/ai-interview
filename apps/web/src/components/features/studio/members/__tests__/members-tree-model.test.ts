import { describe, expect, it } from "vitest";
import {
  flattenMemberTree,
  listManagerCandidates,
  listMembersWithReports,
} from "../members-tree-model";

function person(userId: string, managerUserId: string | null = null) {
  return { email: `${userId}@example.com`, managerUserId, name: userId, userId };
}

const records = [
  person("director"),
  person("lead-a", "director"),
  person("lead-b", "director"),
  person("recruiter-a1", "lead-a"),
  person("intern-a1", "recruiter-a1"),
  person("solo"),
];

function visibleIds(rows: { record: { userId: string } }[]) {
  return rows.map((row) => row.record.userId);
}

describe("flattenMemberTree", () => {
  it("shows only top-level members until a row is expanded", () => {
    const rows = flattenMemberTree({ expandedUserIds: new Set(), records });

    expect(visibleIds(rows)).toEqual(["director", "solo"]);
    expect(rows[0]).toMatchObject({ depth: 0, directReportCount: 2, isExpanded: false });
  });

  it("reveals direct reports level by level as rows expand", () => {
    const rows = flattenMemberTree({
      expandedUserIds: new Set(["director", "lead-a"]),
      records,
    });

    expect(rows.map((row) => [row.record.userId, row.depth])).toEqual([
      ["director", 0],
      ["lead-a", 1],
      ["recruiter-a1", 2],
      ["lead-b", 1],
      ["solo", 0],
    ]);
  });

  it("treats members whose manager left the list as top-level", () => {
    const rows = flattenMemberTree({
      expandedUserIds: new Set(),
      records: [person("orphan", "removed-manager")],
    });

    expect(visibleIds(rows)).toEqual(["orphan"]);
  });

  it("keeps search matches with their manager chain expanded", () => {
    const rows = flattenMemberTree({ expandedUserIds: new Set(), query: "INTERN", records });

    expect(visibleIds(rows)).toEqual(["director", "lead-a", "recruiter-a1", "intern-a1"]);
  });

  it("does not loop on corrupted cycles", () => {
    const rows = flattenMemberTree({
      expandedUserIds: new Set(["a", "b"]),
      records: [person("root"), person("a", "b"), person("b", "a")],
    });

    expect(visibleIds(rows)).toEqual(["root"]);
  });
});

describe("listManagerCandidates", () => {
  it("excludes the member and every transitive report to prevent cycles", () => {
    expect(listManagerCandidates(records, ["lead-a"]).map((record) => record.userId)).toEqual([
      "director",
      "lead-b",
      "solo",
    ]);
  });

  it("also excludes reports reached through dotted-line managers", () => {
    const withDotted = [
      ...records.filter((record) => record.userId !== "solo"),
      { ...person("solo"), dottedManagerUserIds: ["lead-b"] },
    ];
    expect(
      listManagerCandidates(withDotted, ["lead-b"]).map((record) => record.userId),
    ).not.toContain("solo");
  });

  it("excludes every selected member and their reports for bulk changes", () => {
    expect(
      listManagerCandidates(records, ["lead-a", "solo"]).map((record) => record.userId),
    ).toEqual(["director", "lead-b"]);
  });
});

describe("listMembersWithReports", () => {
  it("lists every manager for expand-all", () => {
    expect(listMembersWithReports(records).toSorted()).toEqual(
      ["director", "lead-a", "recruiter-a1"].toSorted(),
    );
  });
});
