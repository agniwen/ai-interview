import type { ReactNode } from "react";
import { toast } from "sonner";
import type { ExternalToast } from "sonner";

export function showMeetingDeletionSuccess(message: ReactNode, options?: ExternalToast) {
  toast.dismiss();
  return toast.success(message, options);
}

export function showMeetingDeletionError(message: ReactNode, options?: ExternalToast) {
  toast.dismiss();
  return toast.error(message, options);
}
