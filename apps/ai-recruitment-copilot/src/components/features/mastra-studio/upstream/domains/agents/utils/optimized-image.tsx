import { createElement } from "react";
import type { ComponentPropsWithoutRef, Ref } from "react";

interface OptimizedImageProps extends ComponentPropsWithoutRef<"img"> {
  ref?: Ref<HTMLImageElement>;
}

export function OptimizedImage({ ref, ...props }: OptimizedImageProps) {
  return createElement("img", {
    decoding: "async",
    loading: "lazy",
    ...props,
    ref,
  });
}
