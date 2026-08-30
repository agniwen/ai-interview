interface ModernArtworkProps {
  assetPath: string;
  className: string;
  dataAttributes: Record<`data-${string}`, string>;
  fallbackPath: string;
  height: number;
  width: number;
}

export function ModernArtwork({
  assetPath,
  className,
  dataAttributes,
  fallbackPath,
  height,
  width,
}: ModernArtworkProps) {
  const sizes = "(min-width: 1024px) 60vw, 100vw";

  return (
    <picture>
      <source
        sizes={sizes}
        srcSet={`${assetPath}-1024.avif 1024w, ${assetPath}.avif ${width}w`}
        type="image/avif"
      />
      <source sizes={sizes} srcSet={`${assetPath}.webp ${width}w`} type="image/webp" />
      {/* oxlint-disable-next-line next/no-img-element -- TanStack Start has no image runtime; picture supplies full-resolution AVIF/WebP with the original JPEG fallback. */}
      <img
        {...dataAttributes}
        alt=""
        className={className}
        decoding="async"
        height={height}
        loading="lazy"
        sizes={sizes}
        src={fallbackPath}
        width={width}
      />
    </picture>
  );
}
