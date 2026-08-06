"use client";

import { useHasPermission } from "@/hooks/use-has-permission";
import type { StudioPersonDetailAccessMode } from "./studio-person-detail-model";

export function useStudioPersonDetailPermissions(accessMode: StudioPersonDetailAccessMode) {
  const isPublic = accessMode === "public";
  const isReview = accessMode === "review";
  const canUseManagementActions = accessMode === "authed";
  const canViewReportMetadata = accessMode === "authed";
  const hasReadHumanInterviewPermission = useHasPermission("humanInterview", "read");
  const hasUpdateInterviewPermission = useHasPermission("interview", "update");
  const hasUpdateResumeLibraryPermission = useHasPermission("resumeLibrary", "update");
  const hasCreateHumanInterviewPermission = useHasPermission("humanInterview", "create");
  const hasUpdateHumanInterviewPermission = useHasPermission("humanInterview", "update");
  const hasDeleteHumanInterviewPermission = useHasPermission("humanInterview", "delete");
  const hasReadOfferPermission = useHasPermission("offer", "read");
  const hasCreateOfferPermission = useHasPermission("offer", "create");
  const hasUpdateOfferPermission = useHasPermission("offer", "update");
  const hasDeleteOfferPermission = useHasPermission("offer", "delete");
  const canReadHumanInterview = canUseManagementActions && hasReadHumanInterviewPermission;
  const canUpdateInterview = canUseManagementActions && hasUpdateInterviewPermission;
  const canUpdateResumeLibrary = canUseManagementActions && hasUpdateResumeLibraryPermission;
  const canCreateHumanInterview = canUseManagementActions && hasCreateHumanInterviewPermission;
  const canUpdateHumanInterview = canUseManagementActions && hasUpdateHumanInterviewPermission;
  const canDeleteHumanInterview = canUseManagementActions && hasDeleteHumanInterviewPermission;
  const canReadOffer = canUseManagementActions && hasReadOfferPermission;
  const canCreateOffer = canUseManagementActions && hasCreateOfferPermission;
  const canUpdateOffer = canUseManagementActions && hasUpdateOfferPermission;
  const canDeleteOffer = canUseManagementActions && hasDeleteOfferPermission;

  return {
    canCreateHumanInterview,
    canCreateOffer,
    canDeleteHumanInterview,
    canDeleteOffer,
    canReadHumanInterview,
    canReadOffer,
    canUpdateHumanInterview,
    canUpdateInterview,
    canUpdateOffer,
    canUpdateResumeLibrary,
    canUseManagementActions,
    canViewReportMetadata,
    isPublic,
    isReview,
  };
}
