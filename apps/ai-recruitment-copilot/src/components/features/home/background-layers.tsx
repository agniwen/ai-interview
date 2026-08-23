// 用途：为首页首屏提供静态编辑插画与文字净空。
// Purpose: static editorial hero artwork with a copy-safe overlay.

interface BackgroundLayersProps {
  fadeToBackground?: boolean;
}

export function BackgroundLayersView({ fadeToBackground = false }: BackgroundLayersProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-screen overflow-hidden"
    >
      <div
        className="absolute inset-0 bg-[url('/landing/home-background-options/mixed-media-k-talent-city-4k-light.jpg')] bg-center bg-cover bg-no-repeat dark:bg-[url('/landing/home-background-options/mixed-media-k-talent-city-4k-dark.jpg')]"
        data-slot="home-hero-artwork"
      />
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,oklch(0.985_0.012_90/0.3),transparent_52%)] dark:bg-[radial-gradient(circle_at_50%_22%,oklch(0.2_0.045_260/0.18),transparent_54%)]"
        data-slot="home-hero-copy-veil"
      />
      {fadeToBackground ? (
        <div
          className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_88%,var(--background)_100%)]"
          data-slot="home-hero-artwork-fade"
        />
      ) : null}
    </div>
  );
}

export function BackgroundLayers(props: BackgroundLayersProps) {
  return <BackgroundLayersView {...props} />;
}
