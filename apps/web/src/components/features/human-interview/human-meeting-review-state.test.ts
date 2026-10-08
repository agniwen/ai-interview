import { createStore } from "jotai";
import { afterEach, expect, it, vi } from "vitest";
import {
  initializeMeetingReviewAtom,
  editMeetingReviewAtom,
  saveMeetingReviewAtom,
  meetingReviewStateAtom,
  meetingReviewDirtyAtom,
  meetingReviewOpenAtom,
  toggleMeetingReviewAtom,
} from "./human-meeting-review-state";
import { evaluation } from "./human-meeting-review.test-fixtures";

afterEach(() => vi.unstubAllGlobals());
function makeStore() {
  const store = createStore();
  store.set(initializeMeetingReviewAtom, {
    evaluation,
    inviteToken: "invite-1",
    outcome: "",
    transcriptRevisionId: null,
  });
  return store;
}
it("does not save clean drafts and keeps page stores isolated", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const first = makeStore();
  const second = makeStore();
  expect(await first.set(saveMeetingReviewAtom)).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
  first.set(editMeetingReviewAtom, { outcome: "pass" });
  expect(second.get(meetingReviewDirtyAtom)).toBe(false);
  expect(second.get(meetingReviewStateAtom)?.outcome).toBe("");
});
it("serializes saves and flushes edits made while a request is pending", async () => {
  const firstResponse = Promise.withResolvers<Response>();
  const fetchMock = vi
    .fn()
    .mockReturnValueOnce(firstResponse.promise)
    .mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  const store = makeStore();
  store.set(editMeetingReviewAtom, { outcome: "pass" });
  const saving = store.set(saveMeetingReviewAtom);
  store.set(editMeetingReviewAtom, {
    evaluation: (current) => ({ ...current, overallEvaluation: "更新后的评价" }),
  });
  const closing = store.set(saveMeetingReviewAtom);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  firstResponse.resolve(Response.json({ ok: true }));
  expect(await saving).toBe(true);
  expect(await closing).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).expectedVersion).toBe(0);
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).expectedVersion).toBe(1);
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).evaluation).toMatchObject({
    draftOutcome: "pass",
    overallEvaluation: "更新后的评价",
    risks: evaluation.risks,
    strengths: evaluation.strengths,
  });
  expect(store.get(meetingReviewDirtyAtom)).toBe(false);
  expect(store.get(meetingReviewStateAtom)?.status).toBe("saved");
});
it("retains edits and keeps the drawer open on failure, then retries on close", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ error: "网络故障" }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  const store = makeStore();
  store.set(meetingReviewOpenAtom, true);
  store.set(editMeetingReviewAtom, { outcome: "pass" });
  await store.set(toggleMeetingReviewAtom);
  expect(store.get(meetingReviewOpenAtom)).toBe(true);
  expect(store.get(meetingReviewDirtyAtom)).toBe(true);
  expect(store.get(meetingReviewStateAtom)).toMatchObject({
    error: "网络故障",
    outcome: "pass",
    status: "error",
  });
  store.set(initializeMeetingReviewAtom, {
    evaluation,
    inviteToken: "invite-1",
    outcome: "",
    transcriptRevisionId: null,
  });
  expect(store.get(meetingReviewStateAtom)?.outcome).toBe("pass");
  await store.set(toggleMeetingReviewAtom);
  expect(store.get(meetingReviewOpenAtom)).toBe(false);
  expect(store.get(meetingReviewDirtyAtom)).toBe(false);
});
