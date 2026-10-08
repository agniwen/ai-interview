import { atom } from "jotai";
import type { SetStateAction } from "react";
import type {
  HumanInterviewEvaluationDraft,
  HumanInterviewRoundOutcome,
} from "@app/db-schema/studio-interviews";
import { requestReviewJson } from "./human-meeting-review-api";

export interface MeetingReviewDraft {
  inviteToken: string;
  evaluation: HumanInterviewEvaluationDraft;
  outcome: HumanInterviewRoundOutcome | "";
  transcriptRevisionId: string | null;
}
interface ReviewState extends MeetingReviewDraft {
  revision: number;
  savedRevision: number;
  status: "idle" | "pending" | "saving" | "saved" | "error";
  error: string | null;
}
// Scoped by the meeting page's Provider; never shared between meetings or browser pages.
export const meetingReviewStateAtom = atom<ReviewState | null>(null);
export const meetingReviewOpenAtom = atom(false);
export const meetingReviewStartedAtom = atom(false);
const savingAtom = atom<Promise<boolean> | null>(null);
export const meetingReviewDirtyAtom = atom((get) => {
  const state = get(meetingReviewStateAtom);
  return Boolean(state && state.revision !== state.savedRevision);
});
export const initializeMeetingReviewAtom = atom(null, (get, set, draft: MeetingReviewDraft) => {
  if (!get(meetingReviewStateAtom)) {
    set(meetingReviewStateAtom, {
      ...draft,
      error: null,
      revision: 0,
      savedRevision: 0,
      status: "idle",
    });
  }
});
export const editMeetingReviewAtom = atom(
  null,
  (
    get,
    set,
    update:
      | { evaluation: SetStateAction<HumanInterviewEvaluationDraft> }
      | { outcome: HumanInterviewRoundOutcome | "" },
  ) => {
    const state = get(meetingReviewStateAtom);
    if (!state) {
      return;
    }
    const next =
      "evaluation" in update
        ? {
            evaluation:
              // oxlint-disable-next-line anti-slop/no-runtime-typeof -- React SetStateAction explicitly supports values and updater functions.
              typeof update.evaluation === "function"
                ? update.evaluation(state.evaluation)
                : update.evaluation,
          }
        : update;
    set(meetingReviewStateAtom, {
      ...state,
      ...next,
      error: null,
      revision: state.revision + 1,
      status: "pending",
    });
  },
);

// Serialize writes and drain edits made while a request is in flight before reporting success.
export const saveMeetingReviewAtom = atom(null, (get, set): Promise<boolean> => {
  const pending = get(savingAtom);
  if (pending) {
    return pending;
  }
  if (!get(meetingReviewDirtyAtom)) {
    return Promise.resolve(true);
  }
  const save = async () => {
    try {
      while (get(meetingReviewDirtyAtom)) {
        const draft = get(meetingReviewStateAtom);
        if (!draft) {
          return true;
        }
        set(meetingReviewStateAtom, { ...draft, error: null, status: "saving" });
        await requestReviewJson(
          `/api/public/human-interview-meetings/interviewer/${encodeURIComponent(draft.inviteToken)}/evaluation-draft`,
          {
            body: JSON.stringify({
              evaluation: { ...draft.evaluation, draftOutcome: draft.outcome || null },
              transcriptRevisionId: draft.transcriptRevisionId,
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          },
        );
        set(meetingReviewStateAtom, (current) =>
          current
            ? {
                ...current,
                savedRevision: draft.revision,
                status: current.revision === draft.revision ? "saved" : "pending",
              }
            : current,
        );
      }
      return true;
    } catch (error) {
      set(meetingReviewStateAtom, (current) =>
        current
          ? {
              ...current,
              error: error instanceof Error ? error.message : "自动保存失败，请重试",
              status: "error",
            }
          : current,
      );
      return false;
    } finally {
      set(savingAtom, null);
    }
  };
  const request = save();
  set(savingAtom, request);
  return request;
});
export const toggleMeetingReviewAtom = atom(null, async (get, set) => {
  if (get(meetingReviewOpenAtom)) {
    if (await set(saveMeetingReviewAtom)) {
      set(meetingReviewOpenAtom, false);
    }
  } else {
    set(meetingReviewStartedAtom, true);
    set(meetingReviewOpenAtom, true);
  }
});
