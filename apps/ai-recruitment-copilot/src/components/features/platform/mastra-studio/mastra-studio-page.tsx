"use client";

import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const MASTRA_STUDIO_PATH = "/internal/mastra-studio/";
type StudioStatus = "checking" | "error" | "ready";

export function MastraStudioPage() {
  const [attempt, setAttempt] = useState(0);
  const [isFrameLoaded, setIsFrameLoaded] = useState(false);
  const [status, setStatus] = useState<StudioStatus>("checking");

  useEffect(() => {
    const controller = new AbortController();
    setIsFrameLoaded(false);
    setStatus("checking");

    const checkAvailability = async () => {
      try {
        const response = await fetch(MASTRA_STUDIO_PATH, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Mastra Studio responded with ${response.status}`);
        }
        setStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setStatus("error");
      }
    };

    void checkAvailability();

    return () => controller.abort();
  }, [attempt]);

  return (
    <div className="relative min-h-[calc(100dvh-8.5rem)] overflow-hidden rounded-xl border bg-background">
      {(status === "checking" || (status === "ready" && !isFrameLoaded)) && (
        <div className="absolute inset-0 z-10 grid grid-cols-[15rem_1fr] gap-3 bg-background p-3">
          <Skeleton className="h-full rounded-lg" />
          <div className="flex min-w-0 flex-col gap-3">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="min-h-0 flex-1 rounded-lg" />
          </div>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <Alert className="max-w-lg">
            <IconAlertTriangle />
            <AlertTitle>Mastra Studio 未启动</AlertTitle>
            <AlertDescription>
              <p>
                请在项目根目录运行 <code>pnpm mastra:studio:source</code>，然后重试。
              </p>
              <Button onClick={() => setAttempt((value) => value + 1)} size="sm" variant="outline">
                <IconRefresh data-icon="inline-start" />
                重试
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}
      {status === "ready" && (
        <iframe
          className="absolute inset-0 size-full bg-background"
          onLoad={() => setIsFrameLoaded(true)}
          src={MASTRA_STUDIO_PATH}
          title="Mastra Studio"
        />
      )}
    </div>
  );
}
