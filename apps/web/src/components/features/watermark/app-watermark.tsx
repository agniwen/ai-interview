import { useEffect } from "react";
import { env } from "@/env/client";
import { authClient } from "@/lib/client/auth-client";
import { getWatermarkText, startAppWatermark } from "./app-watermark-lifecycle";

interface WatermarkUser {
  email?: string | null;
  id: string;
  name?: string | null;
}

const MAX_VISIBLE_USER_ID_LENGTH = 16;

export function maskWatermarkUserId(userId: string): string {
  const normalized = userId.trim().slice(0, MAX_VISIBLE_USER_ID_LENGTH);

  if (normalized.length <= 8) {
    return normalized;
  }

  return `${normalized.slice(0, 4)}****${normalized.slice(-4)}`;
}

export function buildWatermarkContent(user: WatermarkUser): [string, string] {
  const nickname = user.name?.trim() || user.email?.trim() || "用户";

  return [nickname, `ID: ${maskWatermarkUserId(user.id)}`];
}

async function loadWatermark() {
  const { Watermark } = await import("watermark-js-plus");
  return Watermark;
}

async function startLoadedWatermark(text: string, onReady: (stop: () => void) => void) {
  const Watermark = await loadWatermark();
  onReady(
    startAppWatermark({
      createWatermark: (options) => new Watermark(options),
      text,
    }),
  );
}

function EnabledAppWatermark() {
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const content =
    user?.id && !isPending
      ? buildWatermarkContent({
          email: user.email,
          id: user.id,
          name: user.name,
        })
      : null;
  const text = content ? getWatermarkText(content) : null;

  useEffect(() => {
    if (!text) {
      return;
    }

    let cancelled = false;
    let stop: (() => void) | undefined;

    void startLoadedWatermark(text, (nextStop) => {
      if (cancelled) {
        nextStop();
        return;
      }
      stop = nextStop;
    });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [text]);

  return null;
}

export function AppWatermark() {
  if (!env.NEXT_PUBLIC_ENABLE_WATERMARK) {
    return null;
  }

  return <EnabledAppWatermark />;
}
