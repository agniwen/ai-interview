"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { cn } from "@arc/shared/utils";
import { useHydrated } from "@/hooks/use-hydrated";
import { readThemeCookie } from "@/lib/client/theme-cookie";
import type { ResolvedTheme } from "@/lib/client/theme-cookie";

const VIDEO_THEMES = ["light", "dark"] as const;
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
  active: boolean;
  onReady: () => void;
  theme: ResolvedTheme;
}

async function playVideo(video: HTMLVideoElement) {
  try {
    await video.play();
  } catch {
    video.pause();
  }
}

export function DecorativeBackgroundVideo({
  active,
  onReady,
  theme,
}: DecorativeBackgroundVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wasActive = useRef(active);
  const asset = VIDEO_ASSETS[theme];

  useEffect(() => {
    if (wasActive.current === active) {
      return;
    }

    wasActive.current = active;
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (active) {
      void playVideo(video);
      return;
    }

    video.pause();
  }, [active]);

  return (
    <video
      aria-hidden="true"
      autoPlay={active}
      className={cn(
        "pointer-events-none absolute inset-0 size-full select-none object-cover object-center transition-opacity duration-300",
        active ? "opacity-100" : "opacity-0",
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
      onCanPlayThrough={onReady}
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

interface HomeHeroBackgroundVideoProps {
  onReadyChange?: (ready: boolean) => void;
}

export function HomeHeroBackgroundVideo({ onReadyChange }: HomeHeroBackgroundVideoProps) {
  const { resolvedTheme } = useTheme();
  const isHydrated = useHydrated();
  const [cookieTheme, setCookieTheme] = useState<ResolvedTheme | null>(null);
  const [cookieChecked, setCookieChecked] = useState(false);
  const [readyThemes, setReadyThemes] = useState<Record<ResolvedTheme, boolean>>({
    dark: false,
    light: false,
  });

  const providerTheme =
    resolvedTheme === "dark" || resolvedTheme === "light" ? resolvedTheme : null;
  const activeTheme = providerTheme ?? cookieTheme ?? "light";
  const themeResolved = providerTheme !== null || cookieChecked;
  const activeThemeReady = isHydrated && themeResolved && readyThemes[activeTheme];
  const canPreloadAlternateTheme = readyThemes.dark || readyThemes.light;

  useEffect(() => {
    onReadyChange?.(activeThemeReady);
  }, [activeThemeReady, onReadyChange]);

  useEffect(() => {
    if (!isHydrated || providerTheme !== null) {
      return;
    }

    let active = true;
    const loadCookieTheme = async () => {
      const savedTheme = await readThemeCookie();
      if (active) {
        setCookieTheme(savedTheme);
        setCookieChecked(true);
      }
    };

    void loadCookieTheme();
    return () => {
      active = false;
    };
  }, [isHydrated, providerTheme]);

  if (!isHydrated || !themeResolved) {
    return null;
  }

  return VIDEO_THEMES.map((theme) =>
    theme === activeTheme || canPreloadAlternateTheme ? (
      <DecorativeBackgroundVideo
        active={theme === activeTheme}
        key={theme}
        onReady={() => {
          setReadyThemes((current) => (current[theme] ? current : { ...current, [theme]: true }));
        }}
        theme={theme}
      />
    ) : null,
  );
}
