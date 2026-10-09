import { HiringShaderBackground } from "./hiring-shader-background";

interface BackgroundLayersProps {
  fadeToBackground?: boolean;
}

export function BackgroundLayersView({ fadeToBackground = false }: BackgroundLayersProps) {
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
      <HiringShaderBackground />
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_22%,#f8faff_0%,#f8faffd9_24%,transparent_72%)] dark:bg-[radial-gradient(ellipse_at_50%_22%,#080f2a_0%,#080f2ad9_24%,transparent_72%)]"
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
