import { lazy, Suspense } from "react";
import { useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { useHydrated } from "@/hooks/use-hydrated";

const HiringShader = lazy(() => import("./hiring-shader"));

export function HiringShaderBackground() {
  const hydrated = useHydrated();
  const reducedMotion = useReducedMotion();
  const { resolvedTheme } = useTheme();

  // Keep the CSS artwork during SSR, reduced motion, and GPU initialization/failure.
  if (!hydrated || reducedMotion !== false) {
    return null;
  }

  return (
    <div className="absolute inset-0" data-slot="hiring-shader">
      <Suspense fallback={null}>
        <HiringShader dark={resolvedTheme === "dark"} />
      </Suspense>
    </div>
  );
}
