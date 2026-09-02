"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { cn } from "@app/shared/utils";
import { useHydrated } from "@/hooks/use-hydrated";
import type { ResolvedTheme } from "@/lib/client/theme-cookie";

const HOME_HERO_ASSET_BASE_URL =
  "https://ai-interview-1350977987.cos.ap-guangzhou.myqcloud.com/dev/public/homepage/hero/365753858185a99d";
const VIDEO_ASSETS = {
  dark: {
    poster: `${HOME_HERO_ASSET_BASE_URL}/home-hero-background-dark-poster.jpg`,
    video: `${HOME_HERO_ASSET_BASE_URL}/home-hero-background-dark.mp4`,
  },
  light: {
    poster: `${HOME_HERO_ASSET_BASE_URL}/home-hero-background-light-poster.jpg`,
    video: `${HOME_HERO_ASSET_BASE_URL}/home-hero-background-light.mp4`,
  },
} satisfies Record<ResolvedTheme, { poster: string; video: string }>;

interface DecorativeBackgroundVideoProps {
  theme: ResolvedTheme;
}

async function playVideo(video: HTMLVideoElement) {
  try {
    await video.play();
  } catch {
    video.pause();
  }
}

export function DecorativeBackgroundVideo({ theme }: DecorativeBackgroundVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const asset = VIDEO_ASSETS[theme];

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      void playVideo(video);
    }
  }, []);

  return (
    <video
      aria-hidden="true"
      autoPlay
      className={cn(
        "pointer-events-none absolute inset-0 size-full select-none object-cover object-center transition-opacity duration-300",
        ready ? "opacity-100" : "opacity-0",
      )}
      controls={false}
      controlsList="nodownload nofullscreen noremoteplayback"
      data-slot="home-hero-background-video"
      data-theme={theme}
      disablePictureInPicture
      disableRemotePlayback
      draggable={false}
      loop
      muted
      onCanPlay={() => setReady(true)}
      playsInline
      poster={asset.poster}
      preload="auto"
      ref={videoRef}
      tabIndex={-1}
    >
      <source src={asset.video} type="video/mp4" />
    </video>
  );
}

export function HomeHeroBackgroundVideo() {
  const { resolvedTheme } = useTheme();
  const isHydrated = useHydrated();
  const activeTheme = resolvedTheme === "dark" || resolvedTheme === "light" ? resolvedTheme : null;

  if (!(isHydrated && activeTheme)) {
    return null;
  }

  return <DecorativeBackgroundVideo key={activeTheme} theme={activeTheme} />;
}
