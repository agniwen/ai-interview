import { describe, expect, it } from "vitest";
import {
  collectSelfAndReportUserIds,
  collectVisibleCreatorUserIds,
} from "../recruiting-visibility";

const edges = [
  { managerUserId: "director", userId: "lead-a" },
  { managerUserId: "director", userId: "lead-b" },
  { managerUserId: "lead-a", userId: "recruiter-a1" },
  { managerUserId: "lead-a", userId: "recruiter-a2" },
  { managerUserId: "lead-b", userId: "recruiter-b1" },
  { managerUserId: "recruiter-a1", userId: "intern-a1" },
];

describe("collectSelfAndReportUserIds", () => {
  it("lets a manager see every direct and indirect report", () => {
    expect(collectSelfAndReportUserIds("director", edges).toSorted()).toEqual(
      [
        "director",
        "intern-a1",
        "lead-a",
        "lead-b",
        "recruiter-a1",
        "recruiter-a2",
        "recruiter-b1",
      ].toSorted(),
    );
  });

  it("hides peers and other branches", () => {
    expect(collectSelfAndReportUserIds("lead-a", edges).toSorted()).toEqual(
      ["intern-a1", "lead-a", "recruiter-a1", "recruiter-a2"].toSorted(),
    );
    expect(collectSelfAndReportUserIds("recruiter-a2", edges)).toEqual(["recruiter-a2"]);
  });

  it("does not let reports see their managers", () => {
    expect(collectSelfAndReportUserIds("intern-a1", edges)).toEqual(["intern-a1"]);
  });

  it("stops on corrupted cycles instead of looping", () => {
    const cyclic = [
      { managerUserId: "a", userId: "b" },
      { managerUserId: "b", userId: "a" },
    ];
    expect(collectSelfAndReportUserIds("a", cyclic).toSorted()).toEqual(["a", "b"]);
  });
});

describe("collectVisibleCreatorUserIds", () => {
  const lines = [
    { managerUserId: null, shareWithPeers: false, userId: "director" },
    { managerUserId: "director", shareWithPeers: false, userId: "lead-a" },
    { managerUserId: "director", shareWithPeers: true, userId: "lead-b" },
    { managerUserId: "lead-b", shareWithPeers: false, userId: "recruiter-b1" },
    { managerUserId: "lead-a", shareWithPeers: false, userId: "recruiter-a1" },
  ];

  it("adds only the own data of peers who share with peers", () => {
    expect(collectVisibleCreatorUserIds("lead-a", lines).toSorted()).toEqual(
      ["lead-a", "lead-b", "recruiter-a1"].toSorted(),
    );
  });

  it("does not expose a non-sharing peer", () => {
    expect(collectVisibleCreatorUserIds("lead-b", lines).toSorted()).toEqual(
      ["lead-b", "recruiter-b1"].toSorted(),
    );
  });

  it("does not expose shared data to members under a different manager", () => {
    expect(collectVisibleCreatorUserIds("recruiter-a1", lines)).toEqual(["recruiter-a1"]);
  });

  it("treats top-level members, including those without settings, as peers", () => {
    const topLevel = [
      { managerUserId: null, shareWithPeers: true, userId: "solo-sharing" },
      { managerUserId: null, shareWithPeers: false, userId: "solo-private" },
    ];
    expect(collectVisibleCreatorUserIds("unconfigured", topLevel).toSorted()).toEqual(
      ["solo-sharing", "unconfigured"].toSorted(),
    );
  });
});

describe("dotted-line managers", () => {
  const lines = [
    { managerUserId: null, shareWithPeers: false, userId: "director-a" },
    { managerUserId: null, shareWithPeers: false, userId: "director-b" },
    { managerUserId: "director-a", shareWithPeers: false, userId: "lead" },
    { managerUserId: "lead", shareWithPeers: false, userId: "recruiter" },
  ];
  const dottedEdges = [{ managerUserId: "director-b", userId: "lead" }];

  it("lets a dotted-line manager see the member and their reports", () => {
    expect(collectVisibleCreatorUserIds("director-b", lines, dottedEdges).toSorted()).toEqual(
      ["director-b", "lead", "recruiter"].toSorted(),
    );
  });

  it("keeps the direct manager's view and peer groups unchanged", () => {
    expect(collectVisibleCreatorUserIds("director-a", lines, dottedEdges).toSorted()).toEqual(
      ["director-a", "lead", "recruiter"].toSorted(),
    );
    expect(collectVisibleCreatorUserIds("lead", lines, dottedEdges).toSorted()).toEqual(
      ["lead", "recruiter"].toSorted(),
    );
  });
});
