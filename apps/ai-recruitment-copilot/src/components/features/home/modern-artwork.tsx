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
  return (
    <picture>
      <source srcSet={`${assetPath}.avif`} type="image/avif" />
      <source srcSet={`${assetPath}.webp`} type="image/webp" />
      {/* oxlint-disable-next-line next/no-img-element -- TanStack Start has no image runtime; picture supplies full-resolution AVIF/WebP with the original JPEG fallback. */}
      <img
        {...dataAttributes}
        alt=""
        className={className}
        decoding="async"
        height={height}
        loading="lazy"
        src={fallbackPath}
        width={width}
      />
    </picture>
  );
}
