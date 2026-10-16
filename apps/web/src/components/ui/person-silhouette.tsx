import type { CSSProperties, ReactNode } from "react";

import { cn } from "@app/shared/utils";

// 无五官的单色人像：按种子确定性地选 6 种发型之一和 8 种色相之一，整幅头像用同一色相的浅色调。
// A faceless monochrome portrait: the seed deterministically picks one of six hairstyles and one
// of eight hues, and the whole avatar uses soft tones of that single hue.
export const PERSON_SILHOUETTE_HAIRSTYLES = [
  "short",
  "sidePart",
  "bun",
  "long",
  "curly",
  "ponytail",
] as const;

export type PersonSilhouetteHairstyle = (typeof PERSON_SILHOUETTE_HAIRSTYLES)[number];

// OKLCH 色相：玫红、珊瑚、琥珀、草绿、青、天蓝、靛蓝、紫。
// OKLCH hues: rose, coral, amber, green, teal, sky, indigo, violet.
export const PERSON_SILHOUETTE_HUES = [15, 45, 80, 145, 185, 230, 265, 305] as const;

function seedHash(seed: number | string): number {
  let hash = 7;
  for (const char of String(seed)) {
    hash = (Math.imul(hash, 31) + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return hash;
}

export function personSilhouetteHairstyle(seed: number | string): PersonSilhouetteHairstyle {
  return PERSON_SILHOUETTE_HAIRSTYLES[seedHash(seed) % PERSON_SILHOUETTE_HAIRSTYLES.length];
}

// 色相取哈希的另一段，避免与发型一一绑定。
// The hue uses a different slice of the hash so it doesn't move in lockstep with the hairstyle.
export function personSilhouetteHue(seed: number | string): number {
  const hash = Math.floor(seedHash(seed) / PERSON_SILHOUETTE_HAIRSTYLES.length);
  return PERSON_SILHOUETTE_HUES[hash % PERSON_SILHOUETTE_HUES.length];
}

// 底色和“墨色”都只混入少量色相，所以颜色清淡且跟随明暗主题；各部位再按比例把墨色混入底色。
// 结果不透明，重叠部位不会叠色；CSS 变量只能写在 style 里，SVG 属性不解析 var()。
// Both the backdrop and the "ink" take only a little of the hue, keeping it soft and theme-aware;
// each part then mixes ink into the backdrop. The results are opaque so overlaps never darken, and
// they go through `style` because SVG presentation attributes don't resolve var().
function paletteStyle(hue: number): CSSProperties & Record<`--${string}`, string> {
  const tint = `oklch(0.66 0.12 ${hue})`;
  return {
    "--person-backdrop": `color-mix(in oklab, ${tint} 8%, var(--muted))`,
    "--person-ink": `color-mix(in oklab, ${tint} 38%, var(--foreground))`,
    backgroundColor: "var(--person-backdrop)",
  };
}

const tone = (percent: number) => ({
  fill: `color-mix(in oklab, var(--person-ink) ${percent}%, var(--person-backdrop))`,
});
const SKIN = tone(20);
const SKIN_SHADE = tone(28);
const CLOTHES = tone(46);
const CLOTHES_SHADE = tone(54);
const SHIRT = tone(14);
const HAIR = tone(70);
const HAIR_HIGHLIGHT = tone(58);

function Strand({ d }: { d: string }) {
  return (
    <path
      d={d}
      fill="none"
      strokeLinecap="round"
      strokeWidth="0.9"
      style={{ stroke: HAIR_HIGHLIGHT.fill }}
    />
  );
}

const CURLS: [cx: number, cy: number, r: number][] = [
  [22, 24, 4],
  [24.6, 19, 4.2],
  [29, 15.6, 4.4],
  [35, 15.6, 4.4],
  [39.4, 19, 4.2],
  [42, 24, 4],
  [32, 18.6, 4],
];
const CURL_HIGHLIGHTS: [x: number, y: number][] = [
  [25, 18.6],
  [31, 14.8],
  [37.6, 17.4],
  [41.4, 22.6],
  [22.6, 22.6],
];

const HAIRSTYLES: Record<
  PersonSilhouetteHairstyle,
  { back?: ReactNode; front: ReactNode; showEars: boolean }
> = {
  bun: {
    back: (
      <>
        <circle cx="32" cy="11" r="5.4" style={HAIR} />
        <Strand d="M28.6 10.4c2-1.8 4.8-1.8 6.8 0" />
        <rect height="2" rx="1" style={HAIR_HIGHLIGHT} width="7.2" x="28.4" y="14.6" />
      </>
    ),
    front: (
      <>
        <path
          d="M20.8 27.4c0-8.6 5-13.8 11.2-13.8s11.2 5.2 11.2 13.8c-2.6-4.2-6.6-6.4-11.2-6.4s-8.6 2.2-11.2 6.4z"
          style={HAIR}
        />
        <Strand d="M25.6 18c4-1.6 8.8-1.6 12.8 0" />
      </>
    ),
    showEars: true,
  },
  curly: {
    front: (
      <>
        {CURLS.map(([cx, cy, r]) => (
          <circle cx={cx} cy={cy} key={`${cx}-${cy}`} r={r} style={HAIR} />
        ))}
        {CURL_HIGHLIGHTS.map(([x, y]) => (
          <Strand d={`M${x} ${y}a2.2 2.2 0 0 1 3 1.2`} key={`${x}-${y}`} />
        ))}
      </>
    ),
    showEars: true,
  },
  long: {
    back: (
      <path
        d="M18.6 29c0-10.4 5.8-16.6 13.4-16.6S45.4 18.6 45.4 29v13.6c0 2.2-1.6 3.4-3.6 3.4H22.2c-2 0-3.6-1.2-3.6-3.4z"
        style={HAIR}
      />
    ),
    front: (
      <>
        <path
          d="M20.4 28.6c0-9.4 5-15 11.6-15S43.6 19.2 43.6 28.6c-2-4.8-5.6-7.8-10.2-8.6-2.2 3.6-7 6.6-13 8.6z"
          style={HAIR}
        />
        <Strand d="M33.4 20c3.4 1.4 6.4 4.2 8 7.6" />
        <Strand d="M20.4 32v9" />
        <Strand d="M43.6 32v9" />
      </>
    ),
    showEars: false,
  },
  ponytail: {
    back: (
      <>
        <path
          d="M41 17c5.6 1.6 8 7 6.8 13.6-.8 4.4-3 7.4-5.6 8.6 1.6-4 1.8-8.6.2-12.8z"
          style={HAIR}
        />
        <Strand d="M44.6 22c1.2 3 1.2 7-.4 10.4" />
      </>
    ),
    front: (
      <>
        <path
          d="M20.8 27.6c0-8.8 5-14 11.2-14S43.2 18.8 43.2 27.6c-2.2-4.4-6.4-6.8-11.2-6.8s-9 2.4-11.2 6.8z"
          style={HAIR}
        />
        <Strand d="M25 18.6c3.4-2 9.2-2.4 13.8-.2" />
      </>
    ),
    showEars: true,
  },
  short: {
    front: (
      <>
        <path
          d="M20.6 27.5c-.6-9 4.6-14.3 11.4-14.3s12 5.3 11.4 14.3c-.9-3.2-2.2-5.4-3.9-6.5-3.4 1.7-10 2-15.2.3-1.6 1.3-2.9 3.3-3.7 6.2z"
          style={HAIR}
        />
        <Strand d="M27 16.4c2.6.6 6 .6 9.4-.4" />
        <Strand d="M24.4 19.2c4.8 1 10.4.9 14.6-.6" />
      </>
    ),
    showEars: true,
  },
  sidePart: {
    front: (
      <>
        <path
          d="M20.4 28c-.4-9.2 4.8-14.8 11.6-14.8 6.6 0 11.6 4.8 11.6 13.2-1.2-2.6-2.6-4-4-4.4-4.4 2-11.6 2.6-19.2 6z"
          style={HAIR}
        />
        <Strand d="M27.2 14.4c-1.2 2.4-1.4 4.6-1 6.8" />
        <Strand d="M30 16.6c3 1.4 6.6 1.6 9.4.6" />
      </>
    ),
    showEars: true,
  },
};

export function PersonSilhouette({
  className,
  seed,
}: {
  className?: string;
  seed: number | string;
}) {
  const hairstyle = personSilhouetteHairstyle(seed);
  const { back, front, showEars } = HAIRSTYLES[hairstyle];
  return (
    <svg
      aria-hidden="true"
      className={cn("size-full", className)}
      data-hairstyle={hairstyle}
      style={paletteStyle(personSilhouetteHue(seed))}
      viewBox="0 0 64 64"
    >
      {back}
      <path d="M8 66c0-12.4 10.2-19.4 24-19.4S56 53.6 56 66z" style={CLOTHES} />
      <path d="M14 66c0-7 2-11.6 5.6-14.6C13.4 54 10 59 9 66z" style={CLOTHES_SHADE} />
      <path d="M50 66c0-7-2-11.6-5.6-14.6C50.6 54 54 59 55 66z" style={CLOTHES_SHADE} />
      <path d="M25.6 47.6 32 57l6.4-9.4c-2-.8-4.2-1.2-6.4-1.2s-4.4.4-6.4 1.2z" style={SHIRT} />
      <path
        d="M25.6 47.6 29 54l3-3.4M38.4 47.6 35 54l-3-3.4"
        fill="none"
        strokeLinejoin="round"
        strokeWidth="1"
        style={{ stroke: CLOTHES_SHADE.fill }}
      />
      <rect height="14" rx="3.4" style={SKIN} width="8.8" x="27.6" y="35" />
      <path d="M27.6 38.6c2.6 2.4 6.2 2.4 8.8 0v3.2c-2.6 2-6.2 2-8.8 0z" style={SKIN_SHADE} />
      {showEars ? (
        <>
          <ellipse cx="20.6" cy="29.5" rx="2.4" ry="3.2" style={SKIN} />
          <ellipse cx="43.4" cy="29.5" rx="2.4" ry="3.2" style={SKIN} />
        </>
      ) : null}
      <ellipse cx="32" cy="27.6" rx="11.2" ry="12.6" style={SKIN} />
      {front}
    </svg>
  );
}
