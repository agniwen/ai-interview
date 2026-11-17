import { useId, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FloatingBar } from "@/components/ui/floating-bar";
import { HumanMeetingReview } from "./human-meeting-review";
import { InterviewerCandidateMaterials } from "./interviewer-candidate-materials";
import type { InterviewerCandidateMaterialsState } from "./interviewer-candidate-materials";

export function HumanMeetingPostReview({
  inviteToken,
  materials,
  onMaterialsChange,
}: {
  inviteToken: string;
  materials: InterviewerCandidateMaterialsState;
  onMaterialsChange: (state: InterviewerCandidateMaterialsState) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const formId = useId();

  function renderReview(content: ReactNode) {
    return (
      <div className="pointer-events-none absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 flex justify-center">
        <FloatingBar
          className={expanded ? "w-full max-w-4xl overflow-hidden border" : "border p-1"}
        >
          {expanded ? null : (
            <Button
              aria-controls={formId}
              aria-expanded={false}
              onClick={() => setExpanded(true)}
              size="sm"
              type="button"
              variant="default"
            >
              评价
            </Button>
          )}
          <div id={formId} hidden={!expanded} className="h-[min(42dvh,28rem)] min-h-0">
            <div className="flex h-full min-h-0 flex-col">{content}</div>
          </div>
        </FloatingBar>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0">
      <div className="h-full min-h-0 pb-16">
        <InterviewerCandidateMaterials
          active
          inviteToken={inviteToken}
          onStateChange={onMaterialsChange}
          state={materials}
        />
      </div>
      <HumanMeetingReview
        active
        inlineCandidateMaterials
        inviteToken={inviteToken}
        onClose={() => setExpanded(false)}
        renderShell={renderReview}
      />
    </div>
  );
}
