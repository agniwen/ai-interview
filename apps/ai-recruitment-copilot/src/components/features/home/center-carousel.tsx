// 用途：移动端通用 carousel —— 居中对齐 + 邻卡露出 + 滚动进度驱动 tween 缓动 + 循环自动播放
// Purpose: shared mobile carousel — center-aligned with peek, scroll-progress tween easing, looping autoplay.
"use client";

import Autoplay from "embla-carousel-autoplay";
import useEmblaCarousel from "embla-carousel-react";
import * as m from "@/paraglide/messages";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@arc/shared/utils";

interface CenterCarouselItem {
  key: string;
  // 用于 dots 的辅助文本（无障碍）
  // Accessible label for the pagination dot
  label: string;
  node: ReactNode;
}

interface CenterCarouselProps {
  autoplayDelay?: number;
  className?: string;
  items: CenterCarouselItem[];
  // 控制 slide 宽度（决定邻卡露出多少）
  // Slide width — controls how much of the neighbors peek
  slideSize?: string;
}

const TWEEN_FACTOR_BASE = 0.5;
const SCALE_MIN = 0.88;
const OPACITY_MIN = 0.55;

export function CenterCarousel({
  autoplayDelay = 4500,
  className,
  items,
  slideSize = "basis-[82%] sm:basis-[70%]",
}: CenterCarouselProps) {
  const [autoplay] = useState(() =>
    Autoplay({ delay: autoplayDelay, stopOnInteraction: false, stopOnMouseEnter: true }),
  );
  const [emblaRef, embla] = useEmblaCarousel(
    { align: "center", containScroll: false, loop: true },
    [autoplay],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const tweenNodesRef = useRef<HTMLElement[]>([]);
  const tweenFactorRef = useRef(0);

  const setTweenNodes = useCallback((emblaApi: NonNullable<typeof embla>) => {
    tweenNodesRef.current = emblaApi.slideNodes().map((slideNode) => {
      const node = slideNode.querySelector<HTMLElement>("[data-tween]");
      return node ?? slideNode;
    });
  }, []);

  const setTweenFactor = useCallback((emblaApi: NonNullable<typeof embla>) => {
    tweenFactorRef.current = TWEEN_FACTOR_BASE * emblaApi.scrollSnapList().length;
  }, []);

  const tweenScale = useCallback((emblaApi: NonNullable<typeof embla>, eventName?: string) => {
    const engine = emblaApi.internalEngine();
    const scrollProgress = emblaApi.scrollProgress();
    const slidesInView = new Set(emblaApi.slidesInView());
    const isScrollEvent = eventName === "scroll";

    const snapList = emblaApi.scrollSnapList();
    for (let snapIndex = 0; snapIndex < snapList.length; snapIndex += 1) {
      const scrollSnap = snapList[snapIndex];
      let diffToTarget = scrollSnap - scrollProgress;
      const slidesInSnap = engine.slideRegistry[snapIndex];

      for (const slideIndex of slidesInSnap) {
        if (isScrollEvent && !slidesInView.has(slideIndex)) {
          continue;
        }

        if (engine.options.loop) {
          for (const loopItem of engine.slideLooper.loopPoints) {
            const target = loopItem.target();
            if (slideIndex === loopItem.index && target !== 0) {
              const sign = Math.sign(target);
              if (sign === -1) {
                diffToTarget = scrollSnap - (1 + scrollProgress);
              }
              if (sign === 1) {
                diffToTarget = scrollSnap + (1 - scrollProgress);
              }
            }
          }
        }

        const tweenValue = 1 - Math.abs(diffToTarget * tweenFactorRef.current);
        const clamped = Math.max(0, Math.min(1, tweenValue));
        const scale = SCALE_MIN + (1 - SCALE_MIN) * clamped;
        const opacity = OPACITY_MIN + (1 - OPACITY_MIN) * clamped;
        const node = tweenNodesRef.current[slideIndex];
        if (node) {
          node.style.transform = `scale(${scale})`;
          node.style.opacity = `${opacity}`;
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!embla) {
      return;
    }
    setTweenNodes(embla);
    setTweenFactor(embla);
    tweenScale(embla);

    const onSelect = () => setSelectedIndex(embla.selectedScrollSnap());
    const onReInit = () => {
      setTweenNodes(embla);
      setTweenFactor(embla);
      tweenScale(embla);
      onSelect();
    };
    const onScroll = () => tweenScale(embla, "scroll");
    const onSlideFocus = () => tweenScale(embla);

    embla.on("select", onSelect);
    embla.on("reInit", onReInit);
    embla.on("scroll", onScroll);
    embla.on("slideFocus", onSlideFocus);
    onSelect();
    return () => {
      embla.off("select", onSelect);
      embla.off("reInit", onReInit);
      embla.off("scroll", onScroll);
      embla.off("slideFocus", onSlideFocus);
    };
  }, [embla, setTweenNodes, setTweenFactor, tweenScale]);

  return (
    <div className={cn("relative", className)}>
      {/* viewport：用 -mx-* 把 overflow-hidden 拉到屏幕边缘，让邻卡突破 Section padding 露出 */}
      {/* viewport — pull overflow edge to screen via negative margins so neighbors peek past Section padding */}
      <div className="-mx-5 sm:-mx-8 overflow-hidden py-4" ref={emblaRef}>
        {/* Embla 官方推荐的 spacing 模式：slide 只在左侧加 pad，flex 容器用等量负 margin 抵消第一张前导留白。
            循环时克隆 slide 也只继承 pl-*，前后接缝处 = pl-* 自身 = 与常规间距完全相等。 */}
        {/* Embla's recommended spacing pattern: slides use leading padding only and the flex container's
            negative margin cancels the first slide's leading offset. Cloned slides at the loop seam carry
            the same pl-*, so the seam gap exactly equals every regular gap. */}
        <div className="-ml-4 flex items-stretch sm:-ml-5">
          {items.map((item) => (
            <div
              className={cn("flex min-w-0 shrink-0 grow-0 pl-4 sm:pl-5", slideSize)}
              key={item.key}
            >
              <div className="flex w-full origin-center will-change-transform" data-tween>
                {item.node}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 flex justify-center gap-2">
        {items.map((item, i) => (
          <button
            aria-label={m.home_carousel_jump_to({ index: i + 1, label: item.label })}
            className={cn(
              "h-1.5 rounded-full transition-[width,background-color] duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] motion-reduce:transition-none",
              i === selectedIndex ? "w-6 bg-foreground/70" : "w-1.5 bg-foreground/20",
            )}
            key={item.key}
            onClick={() => embla?.scrollTo(i)}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}
