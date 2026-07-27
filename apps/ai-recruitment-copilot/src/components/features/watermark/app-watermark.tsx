import { useEffect } from "react";
import { env } from "@/env/client";
import { authClient } from "@/lib/client/auth-client";

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

  useEffect(() => {
    if (!content) {
      return;
    }

    const watermarkContent = content;
    let disposed = false;
    let instance: { create: () => Promise<void>; destroy: () => void } | null = null;

    async function createWatermark() {
      const Watermark = await loadWatermark();

      if (disposed) {
        return;
      }

      instance = new Watermark({
        backgroundRepeat: "repeat",
        content: watermarkContent.join("\n"),
        contentType: "multi-line-text",
        fontColor: "rgba(71, 85, 105, 0.12)",
        fontFamily: "MiSans, Arial, sans-serif",
        fontSize: "14px",
        fontWeight: "500",
        height: 160,
        lineHeight: 22,
        monitorProtection: true,
        mutationObserve: true,
        rotate: 24,
        textAlign: "center",
        textBaseline: "middle",
        width: 260,
        zIndex: 2_147_483_647,
      });

      void instance.create();
    }

    void createWatermark();

    return () => {
      disposed = true;
      instance?.destroy();
    };
  }, [content]);

  return null;
}

export function AppWatermark() {
  if (!env.NEXT_PUBLIC_ENABLE_WATERMARK) {
    return null;
  }

  return <EnabledAppWatermark />;
}
