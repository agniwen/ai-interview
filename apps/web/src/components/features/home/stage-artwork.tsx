// 首页舞台背景：纯色底 + 粗色带 + 流动虚线，全部为 SSR 内联 SVG，动效只用 CSS。
// 首屏用宽幅构图，下方面板用紧凑构图；色调在克莱因蓝附近轻微变化，见 globals.css。
// Homepage stage artwork: solid fill, ribbons and flowing dashes as inline SVG with CSS-only motion.
// The hero uses the wide composition, lower panels the compact one; tones vary around Klein blue.
import { cn } from "@app/shared/utils";
import { useEffect, useRef } from "react";

export type StageArtworkTone = "azure" | "blue" | "indigo" | "sky";

interface StageComposition {
  /** 裁切锚点：登录页靠右对齐，保证面板右侧露出的部分构图稳定。 Slice anchor; auth keeps the right side stable. */
  align?: string;
  dashes: readonly string[];
  focusPoints: readonly { cx: number; cy: number; r: number }[];
  ribbons: readonly { d: string; strong: boolean; width: number }[];
  viewBox: string;
}

// 路径控制点按曲率连续性整理过：多段曲线在接点两侧曲率相近、不再突然反向，单段曲线去掉了端部的
// 急弯，整体走势与原构图偏差在 8px（两条长 S 线约 17px）以内。改动构图时请保持控制柄长度均衡。
// Control points are tuned for curvature continuity: joints no longer flip curvature abruptly and
// single curves lose their end hooks, staying within ~8px of the original course (~17px for the two
// long S lines). Keep handle lengths balanced when editing the composition.
const HERO_COMPOSITION = {
  dashes: [
    "M0 96C319 104 460 370 850 545C1128 670 1469 720 1720 640",
    "M352 -20C333 302 497 520 250 940",
    "M1720 300C1402 367 1230 149 1270 -40",
    "M1090 940C1197 690 1531 628 1720 830",
  ],
  focusPoints: [
    { cx: 132, cy: 82, r: 7 },
    { cx: 1554, cy: 330, r: 9 },
    { cx: 1612, cy: 778, r: 6 },
  ],
  ribbons: [
    {
      d: "M-120 170C178 150 406 440 780 610C1299 846 1340 920 1560 1040",
      strong: true,
      width: 132,
    },
    { d: "M1800 90C1598 236 1349 120 1200 -80", strong: true, width: 96 },
    { d: "M250 -80C376 185 174 461 -90 540", strong: false, width: 78 },
    { d: "M1800 690C1569 644 1385 828 1320 1010", strong: false, width: 88 },
  ],
  viewBox: "0 0 1680 904",
} satisfies StageComposition;

const COMPOSITIONS = {
  // 登录页沿用首屏构图，靠右裁切：面板盖住左侧，右侧露出色带与虚线。
  // Auth reuses the hero composition anchored right, so the panel covers the left side.
  auth: { ...HERO_COMPOSITION, align: "xMaxYMid slice" },
  hero: HERO_COMPOSITION,
  panel: {
    dashes: [
      "M0 470C265 444 448 631 700 740",
      "M960 230C775 262 660 112 700 -20",
      "M120 -10C160 175 62 300 -10 360",
      "M960 600C873 595 796 656 780 740",
    ],
    focusPoints: [
      { cx: 92, cy: 462, r: 6 },
      { cx: 884, cy: 236, r: 7 },
    ],
    ribbons: [
      { d: "M-80 560C188 485 395 694 620 800", strong: true, width: 110 },
      { d: "M1040 120C874 151 738 1 640 -90", strong: true, width: 90 },
      { d: "M-60 90C86 116 230 46 300 -80", strong: false, width: 60 },
      { d: "M1040 520C920 566 858 699 900 820", strong: false, width: 70 },
    ],
    viewBox: "0 0 960 720",
  },
} satisfies Record<string, StageComposition>;

// 流程区切换步骤时的几组姿态：强色带、弱色带、虚线分层位移，形成视差。只用 transform，过渡更顺滑。
// 只有传入 pose 的流程区会切换；其他位置保持静态构图。
// Poses for the process section: layers move by different amounts for parallax, transforms only.
// Only the process section passes a pose; everywhere else the composition stays still.
const PANEL_POSES = [
  { dashes: "none", soft: "none", strong: "none" },
  {
    dashes: "translate(-60px, 40px) rotate(-4deg)",
    soft: "translate(150px, -110px) rotate(18deg) scale(1.08)",
    strong: "translate(-220px, 140px) rotate(-20deg) scale(1.12)",
  },
  {
    dashes: "translate(50px, -36px) rotate(5deg)",
    soft: "translate(-180px, 90px) rotate(-22deg) scale(1.1)",
    strong: "translate(200px, -170px) rotate(24deg) scale(1.18)",
  },
  {
    dashes: "translate(-30px, -50px) rotate(-3deg)",
    soft: "translate(120px, 150px) rotate(14deg) scale(1.16)",
    strong: "translate(-150px, -120px) rotate(-28deg) scale(1.22)",
  },
] as const;

/** 每次切换姿态时虚线向前冲的距离（屏幕像素）。 How far the dashes rush forward on each pose change. */
const DASH_RUSH_PX = 720;

interface StageArtworkProps {
  className?: string;
  composition?: keyof typeof COMPOSITIONS;
  /** 流程区的姿态序号，变化时色带平滑移动、虚线前冲。 Process-section pose; changes move ribbons and rush dashes. */
  pose?: number;
  /** 水平镜像，让相邻面板的色带走向错开。 Mirror so neighbouring panels don't repeat. */
  mirrored?: boolean;
  tone?: StageArtworkTone;
}

export function StageArtwork({
  className,
  composition = "hero",
  mirrored = false,
  pose,
  tone = "blue",
}: StageArtworkProps) {
  const { align, dashes, focusPoints, ribbons, viewBox }: StageComposition =
    COMPOSITIONS[composition];
  const svgRef = useRef<SVGSVGElement>(null);
  const rushRef = useRef({ count: 0, pose });
  // 姿态变化时只增不减地累加冲刺距离，循环回第一步时虚线也继续向前，而不是倒退。
  // The rush distance only grows, so wrapping back to the first pose still moves the dashes forward.
  useEffect(() => {
    const rush = rushRef.current;
    if (pose === undefined || rush.pose === pose) {
      return;
    }
    rush.pose = pose;
    rush.count += 1;
    svgRef.current?.style.setProperty("--stage-dash-rush", `${rush.count * DASH_RUSH_PX}px`);
  }, [pose]);
  const layers = PANEL_POSES[(pose ?? 0) % PANEL_POSES.length];

  return (
    <svg
      aria-hidden="true"
      className={cn(
        "home-stage-artwork absolute inset-0 size-full",
        mirrored && "-scale-x-100",
        className,
      )}
      data-slot="home-stage-artwork"
      data-tone={tone}
      fill="none"
      preserveAspectRatio={align ?? "xMidYMid slice"}
      ref={svgRef}
      viewBox={viewBox}
    >
      {[true, false].map((strong) => (
        <g
          className="home-stage-layer"
          key={strong ? "strong" : "soft"}
          style={{ transform: strong ? layers.strong : layers.soft }}
        >
          {ribbons
            .filter((ribbon) => ribbon.strong === strong)
            .map(({ d, width }) => (
              <path
                className={strong ? "home-stage-ribbon" : "home-stage-ribbon-soft"}
                d={d}
                key={d}
                strokeLinecap="round"
                strokeWidth={width}
              />
            ))}
        </g>
      ))}
      <g className="home-stage-layer" style={{ transform: layers.dashes }}>
        {dashes.map((d) => (
          <path className="home-stage-dash" d={d} key={d} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
      {focusPoints.map(({ cx, cy, r }) => (
        <g className="home-stage-focus" key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r={r * 2.4} className="fill-white/15" />
          <circle cx={cx} cy={cy} r={r} className="fill-white/80" />
        </g>
      ))}
    </svg>
  );
}
