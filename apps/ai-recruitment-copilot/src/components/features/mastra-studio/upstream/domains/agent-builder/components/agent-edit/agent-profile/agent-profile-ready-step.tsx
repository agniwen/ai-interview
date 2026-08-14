import { Button } from "@mastra/playground-ui/components/Button";
import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "@/components/features/mastra-studio/router/compat";
import { AgentStepContainer } from "./agent-step-container";
import { useWizard } from "@/components/features/mastra-studio/upstream/domains/agent-builder/contexts/wizard-context";
import { startViewTransition } from "@/components/features/mastra-studio/upstream/lib/routing";

export const AgentProfileReadyStep = () => {
  const { next } = useWizard();
  const navigate = useNavigate();
  const { id: agentId } = useParams<{ id: string }>();
  const sweepRef = useRef<HTMLSpanElement | null>(null);

  // Play the specular sweep exactly once via the Web Animations API. A CSS
  // animation would replay whenever the layout flips into split mode and the
  // view transition repaints this subtree, causing a visible double sweep.
  useEffect(() => {
    const el = sweepRef.current;
    if (!el || typeof el.animate !== "function") {
      return;
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    el.animate(
      [
        { backgroundPosition: "180% 0", opacity: 0 },
        { offset: 0.12, opacity: 1 },
        { offset: 0.88, opacity: 1 },
        { backgroundPosition: "-80% 0", opacity: 0 },
      ],
      { delay: 120, duration: 2400, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "both" },
    );
  }, []);

  const handleReview = () => {
    startViewTransition(() => {
      next();
    });
  };

  const handleTry = () => {
    void navigate(`/agent-builder/agents/${agentId}/view`, { viewTransition: true });
  };

  return (
    <AgentStepContainer
      panelClassName="ready-stage"
      panelOverlay={<span ref={sweepRef} className="ready-stage-sweep" aria-hidden="true" />}
      cta={
        <div className="relative z-[2] flex items-center justify-center gap-3">
          <Button variant="outline" onClick={handleReview} data-testid="agent-builder-ready-review">
            检查我的智能体
          </Button>
          <Button variant="primary" onClick={handleTry} data-testid="agent-builder-ready-try">
            试用我的智能体
          </Button>
        </div>
      }
    >
      <div className="w-full h-full flex flex-col items-center justify-center py-6 px-6 text-center">
        <div className="ready-stage-content flex flex-col items-center gap-4">
          <h2
            className="text-4xl font-semibold text-neutral6"
            data-testid="agent-builder-ready-heading"
          >
            你的智能体已就绪
          </h2>
          <p className="text-neutral3 text-lg max-w-md">
            你可以检查并微调所有配置，也可以直接开始试用。
          </p>
        </div>
      </div>
    </AgentStepContainer>
  );
};
