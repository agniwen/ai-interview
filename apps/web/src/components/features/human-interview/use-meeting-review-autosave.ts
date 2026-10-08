import { useEffect } from "react";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import {
  meetingReviewStateAtom,
  meetingReviewDirtyAtom,
  initializeMeetingReviewAtom,
  editMeetingReviewAtom,
  saveMeetingReviewAtom,
} from "./human-meeting-review-state";

export function useMeetingReviewAutosave(enabled: boolean) {
  const store = useStore();
  const state = useAtomValue(meetingReviewStateAtom);
  const initialize = useSetAtom(initializeMeetingReviewAtom);
  const edit = useSetAtom(editMeetingReviewAtom);
  const save = useSetAtom(saveMeetingReviewAtom);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const timer = window.setInterval(async () => {
      if (store.get(meetingReviewStateAtom)?.status !== "error") {
        await save();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [enabled, save, store]);
  return { edit, initialize, isDirty: () => store.get(meetingReviewDirtyAtom), save, state };
}
