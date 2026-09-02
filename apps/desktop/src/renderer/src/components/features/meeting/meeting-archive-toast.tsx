import { Button } from "@/components/ui/button";
import { showMeetingDeletionSuccess } from "./meeting-deletion-toast";

export function showMeetingArchivedToast(onRestore: (toastId: string | number) => void) {
  const toastId = showMeetingDeletionSuccess("已归档", {
    action: (
      <Button className="ml-auto" onClick={() => onRestore(toastId)} size="sm" type="button">
        撤回
      </Button>
    ),
    style: { paddingBlock: "8px" },
  });
  return toastId;
}
