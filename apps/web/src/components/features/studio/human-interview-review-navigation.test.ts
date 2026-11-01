import { expect, it } from "vitest";
import { getHumanInterviewReviewNavigation } from "./human-interview-review-navigation";

const older = {
  createdAt: "2026-09-17T00:00:00Z",
  evaluationStatus: "draft" as const,
  id: "older",
  label: "业务一面",
  sortOrder: 1,
  status: "pending" as const,
};
const newer = {
  ...older,
  createdAt: "2026-09-18T00:00:00Z",
  evaluationStatus: "submitted" as const,
  id: "newer",
  label: "业务二面",
  sortOrder: 2,
};

it("keeps the latest submitted round as the entry without calling it historical", () => {
  expect(getHumanInterviewReviewNavigation([older, newer], newer.id)).toEqual({
    latestRound: newer,
    newerRound: undefined,
  });
});
it("points an older review to a genuinely newer result", () => {
  expect(getHumanInterviewReviewNavigation([newer, older], older.id).newerRound).toEqual(newer);
});
it("does not label a new unprocessed round as older than a previous draft", () => {
  const pending = { ...newer, evaluationStatus: "not_started" as const };
  expect(getHumanInterviewReviewNavigation([older, pending], pending.id)).toEqual({
    latestRound: older,
    newerRound: undefined,
  });
});
it("excludes cancelled results and avoids a historical hint for an unknown round", () => {
  expect(
    getHumanInterviewReviewNavigation([older, { ...newer, status: "cancelled" }], "missing"),
  ).toEqual({ latestRound: older, newerRound: undefined });
});
it("uses round order when creation timestamps are equal", () => {
  const tied = { ...newer, createdAt: older.createdAt };
  expect(getHumanInterviewReviewNavigation([tied, older], older.id).newerRound).toEqual(tied);
});
