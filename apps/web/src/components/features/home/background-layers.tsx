// 用途：为共享页面提供静态插画，并为首页首屏提供纯装饰视频背景。
// Purpose: shared static artwork plus a decorative homepage video background.

import { HomeHeroBackgroundVideo } from "./home-hero-background-video";

interface BackgroundLayersProps {
  fadeToBackground?: boolean;
  video?: boolean;
}

export function BackgroundLayersView({
  fadeToBackground = false,
  video = false,
}: BackgroundLayersProps) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-screen">
      <div
        className="home-hero-artwork-light absolute inset-0 bg-center bg-cover bg-no-repeat dark:hidden"
        data-slot="home-hero-artwork"
        data-theme="light"
      />
      <div
        className="home-hero-artwork-dark absolute inset-0 hidden bg-center bg-cover bg-no-repeat dark:block"
        data-slot="home-hero-artwork"
        data-theme="dark"
      />
      {video ? <HomeHeroBackgroundVideo /> : null}
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,oklch(0.985_0.012_90/0.3),transparent_52%)] dark:bg-[radial-gradient(circle_at_50%_22%,oklch(0.2_0.045_260/0.18),transparent_54%)]"
        data-slot="home-hero-copy-veil"
      />
      {fadeToBackground ? (
        <div
          className="absolute inset-x-0 top-0 -bottom-1 bg-[linear-gradient(to_bottom,transparent_88%,var(--background)_100%)]"
          data-slot="home-hero-artwork-fade"
        />
      ) : null}
    </div>
  );
}

export function BackgroundLayers(props: BackgroundLayersProps) {
  return <BackgroundLayersView {...props} />;
}
