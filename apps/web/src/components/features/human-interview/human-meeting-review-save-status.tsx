import { useAtomValue, useSetAtom } from "jotai";
import { Button } from "@/components/ui/button";
import { meetingReviewStateAtom, saveMeetingReviewAtom } from "./human-meeting-review-state";

export function HumanMeetingReviewSaveStatus({ onClose }: { onClose: () => void }) {
  const state = useAtomValue(meetingReviewStateAtom);
  const save = useSetAtom(saveMeetingReviewAtom);
  const labels = {
    error: "自动保存失败，请重试",
    idle: "修改后自动保存",
    pending: "等待自动保存…",
    saved: "已自动保存",
    saving: "正在保存…",
  };
  const label = state?.error ?? labels[state?.status ?? "idle"];
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <output className="text-sm text-muted-foreground">{label}</output>
      <div className="flex shrink-0 gap-2">
        {state?.status === "error" ? (
          <Button variant="outline" onClick={() => save()}>
            重试保存
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onClose}>
          关闭
        </Button>
      </div>
    </div>
  );
}
