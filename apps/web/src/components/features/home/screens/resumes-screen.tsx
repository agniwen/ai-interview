/* oxlint-disable max-lines -- The landing-only recruiting desk keeps its chart and localized candidate fixtures in one noninteractive screen. */
import {
  IconBriefcase,
  IconChevronDown,
  IconDots,
  IconEdit,
  IconFileText,
  IconFilterX,
  IconInfoCircle,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconUpload,
} from "@tabler/icons-react";
// 用途：landing 用「Studio › 招聘台」简化版 UI。对齐真实组件：
// - PageHeader: <h1 class="text-2xl"> + view switch / refresh actions
// - ResumeLibraryCharts: 3 张 shadcn chart card，顶部含指标分栏
// - ResumeLibraryCardList: Toolbar + 当前候选人卡片结构
// Purpose: simplified Studio resume library mock, mirroring the real components 1:1.

import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResumeLifecycleBadge } from "@/components/features/studio/resumes/resume-lifecycle-badge";
import * as m from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { AppShell, StudioNav } from "./_parts/app-shell";
import type { BreadcrumbCrumb } from "./_parts/app-shell";
import { ScreenFrame } from "./screen-frame";

interface MetricItem {
  label: string;
  value: string;
}

function ChartCardShell({
  title,
  description,
  metrics,
  children,
}: {
  title: string;
  description?: string;
  metrics: [MetricItem, MetricItem];
  children: React.ReactNode;
}) {
  return (
    <Card className="h-full gap-0 overflow-hidden rounded-xl py-0">
      <div className="grid border-b sm:h-22 sm:grid-cols-[minmax(0,1fr)_repeat(2,minmax(5.75rem,7rem))]">
        <CardHeader className="min-w-0 gap-1 p-4 sm:p-5">
          <CardTitle className="truncate text-base">{title}</CardTitle>
          {description ? (
            <CardDescription className="truncate">{description}</CardDescription>
          ) : null}
        </CardHeader>
        {metrics.map((metric) => (
          <div
            className="flex flex-col justify-center border-t px-4 py-3 sm:border-t-0 sm:border-l sm:px-5"
            key={metric.label}
          >
            <div className="truncate text-muted-foreground text-xs">{metric.label}</div>
            <div className="mt-1 font-mono font-semibold text-2xl leading-none tabular-nums">
              {metric.value}
            </div>
          </div>
        ))}
      </div>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

// ─────────────────── 面试流程分布 (stacked horizontal bar) ───────────────────
// 对齐生产 ResumeLibraryCharts.StatusCard：6 桶漏斗 = screening / ai_interview /
// human_interview / offer / closed_hired / closed_rejected。颜色 / label 与
// resume-library-charts.tsx 的 BUCKET_LABEL / BUCKET_COLORS 一致。
// Mirrors the production StatusCard: 6-bucket funnel matching the real chart's
// labels and colors verbatim.
const PIPELINE_ORDER = [
  "screening",
  "ai_interview",
  "human_interview",
  "offer",
  "closed_hired",
  "closed_rejected",
] as const;
const PIPELINE_COUNT = {
  ai_interview: 18,
  closed_hired: 4,
  closed_rejected: 19,
  human_interview: 10,
  offer: 5,
  screening: 28,
} satisfies Record<(typeof PIPELINE_ORDER)[number], number>;
const PIPELINE_COLOR = {
  ai_interview: "var(--pipeline-ai-interview)",
  closed_hired: "var(--pipeline-closed-hired)",
  closed_rejected: "var(--pipeline-closed-rejected)",
  human_interview: "var(--pipeline-human-interview)",
  offer: "var(--pipeline-offer)",
  screening: "var(--pipeline-screening)",
} satisfies Record<(typeof PIPELINE_ORDER)[number], string>;

function StatusCard() {
  const pipelineLabel = {
    ai_interview: m.home_frame_nav_ai_interview(),
    closed_hired: m.home_frame_stage_hired(),
    closed_rejected: m.home_frame_stage_rejected(),
    human_interview: m.home_frame_stage_human(),
    offer: "Offer",
    screening: m.home_frame_stage_screening(),
  } satisfies Record<(typeof PIPELINE_ORDER)[number], string>;
  const total = PIPELINE_ORDER.reduce((acc, s) => acc + PIPELINE_COUNT[s], 0);
  const active =
    PIPELINE_COUNT.screening +
    PIPELINE_COUNT.ai_interview +
    PIPELINE_COUNT.human_interview +
    PIPELINE_COUNT.offer;
  return (
    <ChartCardShell
      description={m.home_frame_excludes_archived()}
      metrics={[
        { label: m.home_frame_total_candidates(), value: String(total) },
        { label: m.home_frame_in_progress(), value: String(active) },
      ]}
      title={m.home_frame_pipeline_title()}
    >
      <div className="flex items-center">
        <div className="flex w-full flex-col justify-center gap-3">
          <div className="flex h-[86px] items-center">
            <div className="flex h-[52px] w-full overflow-hidden rounded bg-muted/40">
              {PIPELINE_ORDER.map((s, i) => {
                let rad = "";
                if (i === 0) {
                  rad = "rounded-l";
                } else if (i === PIPELINE_ORDER.length - 1) {
                  rad = "rounded-r";
                }
                return (
                  <span
                    className={rad}
                    key={s}
                    style={{
                      backgroundColor: PIPELINE_COLOR[s],
                      width: `${(PIPELINE_COUNT[s] / total) * 100}%`,
                    }}
                  />
                );
              })}
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground text-xs">
            {PIPELINE_ORDER.map((s) => (
              <li className="flex items-center gap-2" key={s}>
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-sm"
                  style={{ backgroundColor: PIPELINE_COLOR[s] }}
                />
                <span className="flex-1 truncate">{pipelineLabel[s]}</span>
                <span className="tabular-nums">{PIPELINE_COUNT[s]}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ChartCardShell>
  );
}

// ─────────────────── 近一年入库日历 (current contribution heatmap) ───────────────────
const CALENDAR_LEVEL_COLORS = [
  "color-mix(in oklab, var(--muted-foreground) 14%, var(--background))",
  "#9be9a8",
  "#40c463",
  "#30a14e",
  "#216e39",
] as const;
const CALENDAR_LEVELS = Array.from({ length: 27 * 7 }, (_, index) => {
  if (index % 29 === 0 || index % 41 === 0) {
    return 4;
  }
  if (index % 11 === 0 || index % 17 === 0) {
    return 3;
  }
  if (index % 5 === 0) {
    return 2;
  }
  if (index % 3 === 0) {
    return 1;
  }
  return 0;
});

function DailyAddedCard() {
  const monthLabels = Array.from({ length: 6 }, (_, index) =>
    new Intl.DateTimeFormat(getLocale(), { month: "short" }).format(
      new Date(Date.UTC(2026, index + 2, 1)),
    ),
  );

  return (
    <ChartCardShell
      metrics={[
        { label: m.home_frame_added_year(), value: "188" },
        { label: m.home_frame_daily_peak(), value: "12" },
      ]}
      title={m.home_frame_calendar_title()}
    >
      <div className="flex h-36 flex-col gap-2 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <div
            className="grid w-max gap-0.5"
            style={{
              gridAutoColumns: 12,
              gridAutoFlow: "column",
              gridTemplateRows: "repeat(7, 12px)",
            }}
          >
            {CALENDAR_LEVELS.map((level, index) => (
              <span
                aria-hidden="true"
                className="size-3 rounded-[2px]"
                // The contribution cells are a stable, decorative time series.
                // oxlint-disable-next-line react/no-array-index-key
                key={index}
                style={{ backgroundColor: CALENDAR_LEVEL_COLORS[level] }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between px-1 text-muted-foreground text-[10px]">
            {monthLabels.map((month) => (
              <span key={month}>{month}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-1.5 text-muted-foreground text-[10px]">
          <span>{m.home_frame_less()}</span>
          {CALENDAR_LEVEL_COLORS.map((color) => (
            <span
              aria-hidden="true"
              className="size-3 rounded-[2px]"
              key={color}
              style={{ backgroundColor: color }}
            />
          ))}
          <span>{m.home_frame_more()}</span>
        </div>
      </div>
    </ChartCardShell>
  );
}

// ─────────────────── AI 面试转化 (donut) ───────────────────
const CONVERSION_ACCENT = "var(--chart-conversion)";
const CONVERSION_ACCENT_MUTED = "var(--chart-conversion-muted)";

function ConversionCard() {
  const withCount = 38;
  const totalCount = 84;
  const percent = Math.round((withCount / totalCount) * 100);
  const r = 32;
  const c = 2 * Math.PI * r;
  const dash = (percent / 100) * c;

  return (
    <ChartCardShell
      description={m.home_frame_conversion_description()}
      metrics={[
        { label: m.home_frame_conversion_rate(), value: `${percent}%` },
        { label: m.home_frame_launched(), value: String(withCount) },
      ]}
      title={m.home_frame_conversion_title()}
    >
      <div className="grid min-h-36 grid-cols-[minmax(7.5rem,9rem)_9rem] items-center justify-center gap-3">
        <ul className="flex flex-1 flex-col gap-2 text-muted-foreground text-xs">
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: CONVERSION_ACCENT }}
            />
            <span className="flex-1 truncate">{m.home_frame_launched_interview()}</span>
            <span className="tabular-nums">{withCount}</span>
          </li>
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: CONVERSION_ACCENT_MUTED }}
            />
            <span className="flex-1 truncate">{m.home_frame_stored_only()}</span>
            <span className="tabular-nums">{totalCount - withCount}</span>
          </li>
        </ul>
        <div className="relative grid size-36 shrink-0 place-items-center">
          <svg aria-hidden="true" className="size-36" viewBox="0 0 96 96">
            <circle
              cx="48"
              cy="48"
              fill="none"
              r={r}
              stroke={CONVERSION_ACCENT_MUTED}
              strokeWidth="14"
            />
            <circle
              cx="48"
              cy="48"
              fill="none"
              r={r}
              stroke={CONVERSION_ACCENT}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={c / 4}
              strokeWidth="14"
              transform="rotate(-90 48 48)"
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center">
            <span className="font-mono font-semibold text-2xl tabular-nums">{percent}%</span>
            <span className="text-muted-foreground text-[10px]">
              {m.home_frame_conversion_rate()}
            </span>
          </div>
        </div>
      </div>
    </ChartCardShell>
  );
}

function ChartsRow() {
  // 对齐 ResumeLibraryCharts: grid gap-4 lg:grid-cols-3
  return (
    <div className="grid grid-cols-3 gap-4">
      <StatusCard />
      <DailyAddedCard />
      <ConversionCard />
    </div>
  );
}

// ─────────────────── PageHeader ───────────────────
function PageHeader({ title }: { title: string }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 w-full">
        <h1 className="min-w-0 text-2xl tracking-tight">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button className="opacity-80" size="xs" type="button" variant="ghost">
          {m.home_frame_personal_view()}
        </Button>
        <Button
          aria-label={m.home_frame_refresh_metrics()}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <IconRefresh />
        </Button>
      </div>
    </header>
  );
}

// ─────────────────── Pipeline stage tabs ───────────────────
function PipelineStageTabs() {
  const pipelineTabs = [
    { label: m.home_frame_tab_all(), value: "all" },
    { label: m.home_frame_stage_screening(), value: "screening" },
    { label: m.home_frame_nav_ai_interview(), value: "ai_interview" },
    { label: m.home_frame_stage_human(), value: "human_interview" },
    { label: "Offer", value: "offer" },
    { label: m.home_frame_tab_closed(), value: "closed" },
  ];

  return (
    <Tabs value="all">
      <TabsList className="grid h-auto w-full grid-cols-2 items-stretch gap-1 data-[orientation=horizontal]:h-auto sm:inline-flex sm:w-fit sm:flex-nowrap">
        {pipelineTabs.map((tab) => (
          <TabsTrigger
            className="h-10! w-full px-3 sm:w-auto sm:px-8"
            key={tab.value}
            value={tab.value}
          >
            <span className="text-sm leading-tight">{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

// ─────────────────── DataGrid Toolbar (search filter + 上传简历 button) ───────────────────
function FilterSelectChip({ label }: { label: string }) {
  return (
    <span className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm sm:w-auto sm:min-w-45">
      <span className="truncate text-muted-foreground">{label}</span>
      <IconChevronDown className="size-4 shrink-0 text-muted-foreground opacity-50" />
    </span>
  );
}

function ToolbarIconButton({
  children,
  disabled,
  label,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Button
      aria-label={label}
      className="shrink-0"
      disabled={disabled}
      size="icon"
      type="button"
      variant="outline"
    >
      {children}
    </Button>
  );
}

function ResumeToolbar() {
  // 真实 Toolbar 布局: flex flex-col gap-3 sm:flex-row sm:items-center
  // Filters 与 toolbarRight 同一个 flex row 顺序排列，不做左右分栏。
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[15rem]">
          <IconSearch className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
          <div className="flex h-9 w-full items-center rounded-md border border-input bg-background pr-9 pl-9 text-muted-foreground text-sm">
            {m.home_frame_search_placeholder()}
          </div>
        </div>
        <FilterSelectChip label={m.home_frame_skill_filter()} />
        <FilterSelectChip label={m.home_frame_job_filter()} />
      </div>
      <div className="flex min-w-fit shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap">
        <ToolbarIconButton label={m.home_frame_refresh()}>
          <IconRefresh />
        </ToolbarIconButton>
        <ToolbarIconButton disabled label={m.home_frame_reset_filters()}>
          <IconFilterX />
        </ToolbarIconButton>
        <Button type="button">
          <IconPlus />
          {m.home_frame_create_record()}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────── Current card list ───────────────────
interface ResumeCardData {
  canLaunchInterview: boolean;
  createdAt: string;
  creator: string;
  education: ProfileSnapshotLineData[];
  email: string;
  id: string;
  isScreening: boolean;
  job: string;
  lifecycleDetail: string;
  lifecycleStage: string;
  name: string;
  score: string;
  scoreTone: "success" | "warning";
  skills: string[];
  summary: string;
  work: ProfileSnapshotLineData[];
}

interface ProfileSnapshotLineData {
  period: string;
  primary: string;
  secondary: string;
}

const RESUMES: ResumeCardData[] = [
  {
    canLaunchInterview: false,
    createdAt: "2025-05-12 14:32",
    creator: "葛城美里",
    education: [{ period: "2013–2017", primary: "浙江大学", secondary: "计算机科学" }],
    email: "shinji@example.com",
    id: "01842",
    isScreening: false,
    job: "技术部 / 资深前端工程师",
    lifecycleDetail: "1/2 待下轮",
    lifecycleStage: "AI 面试",
    name: "真嗣",
    score: "推荐 · 86 分",
    scoreTone: "success",
    skills: ["React", "TypeScript", "微前端", "性能优化"],
    summary: "8 年前端经验，主导过中大型架构升级；技术深度与岗位核心要求匹配。",
    work: [
      { period: "2021–至今", primary: "字节跳动", secondary: "高级前端工程师" },
      { period: "2017–2021", primary: "网易", secondary: "前端工程师" },
    ],
  },
  {
    canLaunchInterview: false,
    createdAt: "2025-05-11 09:18",
    creator: "赤木律子",
    education: [{ period: "2012–2016", primary: "武汉大学", secondary: "工商管理" }],
    email: "asuka@example.com",
    id: "01831",
    isScreening: false,
    job: "产品部 / 增长产品经理",
    lifecycleDetail: "1/2 已安排",
    lifecycleStage: "真人复面",
    name: "明日香",
    score: "推荐 · 81 分",
    scoreTone: "success",
    skills: ["增长实验", "商业化", "数据分析"],
    summary: "具备完整增长闭环经验，实验设计能力突出；需要进一步确认团队管理范围。",
    work: [
      { period: "2020–至今", primary: "小红书", secondary: "增长产品负责人" },
      { period: "2016–2020", primary: "美团", secondary: "产品经理" },
    ],
  },
  {
    canLaunchInterview: true,
    createdAt: "2025-05-10 16:05",
    creator: "碇源堂",
    education: [{ period: "2009–2013", primary: "华中科技大学", secondary: "软件工程" }],
    email: "rei.ayanami@example.com",
    id: "01819",
    isScreening: true,
    job: "技术部 / 后端架构师",
    lifecycleDetail: "待处理",
    lifecycleStage: "简历筛选",
    name: "绫波丽",
    score: "匹配 · 72 分",
    scoreTone: "warning",
    skills: ["Java", "分布式系统", "PostgreSQL"],
    summary: "基础架构经验扎实，但简历中缺少大型团队协作与关键稳定性指标。",
    work: [
      { period: "2019–至今", primary: "携程", secondary: "后端架构师" },
      { period: "2013–2019", primary: "阿里云", secondary: "高级开发工程师" },
    ],
  },
];

type LocalizedResumeFields = Pick<
  ResumeCardData,
  | "creator"
  | "education"
  | "job"
  | "lifecycleDetail"
  | "lifecycleStage"
  | "name"
  | "score"
  | "skills"
  | "summary"
  | "work"
>;

const RESUME_TRANSLATIONS = {
  en: [
    {
      creator: "Misato Katsuragi",
      education: [
        { period: "2013–2017", primary: "Zhejiang University", secondary: "Computer Science" },
      ],
      job: "Engineering / Senior Frontend Engineer",
      lifecycleDetail: "1/2 Next round pending",
      lifecycleStage: "AI Interview",
      name: "Shinji",
      score: "Recommended · 86",
      skills: ["React", "TypeScript", "Micro-frontends", "Performance"],
      summary:
        "Eight years in frontend engineering with major architecture upgrades; strong alignment with the role's core requirements.",
      work: [
        { period: "2021–Present", primary: "ByteDance", secondary: "Senior Frontend Engineer" },
        { period: "2017–2021", primary: "NetEase", secondary: "Frontend Engineer" },
      ],
    },
    {
      creator: "Ritsuko Akagi",
      education: [
        { period: "2012–2016", primary: "Wuhan University", secondary: "Business Administration" },
      ],
      job: "Product / Growth Product Manager",
      lifecycleDetail: "1/2 Scheduled",
      lifecycleStage: "Human Interview",
      name: "Asuka",
      score: "Recommended · 81",
      skills: ["Growth Experiments", "Monetization", "Data Analysis"],
      summary:
        "End-to-end growth experience and strong experiment design; team management scope needs further confirmation.",
      work: [
        { period: "2020–Present", primary: "RED", secondary: "Growth Product Lead" },
        { period: "2016–2020", primary: "Meituan", secondary: "Product Manager" },
      ],
    },
    {
      creator: "Gendo Ikari",
      education: [{ period: "2009–2013", primary: "HUST", secondary: "Software Engineering" }],
      job: "Engineering / Backend Architect",
      lifecycleDetail: "Pending",
      lifecycleStage: "Resume Screening",
      name: "Rei Ayanami",
      score: "Match · 72",
      skills: ["Java", "Distributed Systems", "PostgreSQL"],
      summary:
        "Solid infrastructure experience, but the resume lacks evidence of large-team collaboration and key reliability metrics.",
      work: [
        { period: "2019–Present", primary: "Trip.com", secondary: "Backend Architect" },
        { period: "2013–2019", primary: "Alibaba Cloud", secondary: "Senior Engineer" },
      ],
    },
  ],
  ja: [
    {
      creator: "葛城 ミサト",
      education: [
        { period: "2013–2017", primary: "浙江大学", secondary: "コンピューターサイエンス" },
      ],
      job: "技術部 / シニアフロントエンドエンジニア",
      lifecycleDetail: "1/2 次回待ち",
      lifecycleStage: "AI 面接",
      name: "シンジ",
      score: "推奨 · 86 点",
      skills: ["React", "TypeScript", "マイクロフロントエンド", "性能改善"],
      summary:
        "フロントエンド経験 8 年。中〜大規模のアーキテクチャ刷新を主導し、職務の中核要件と高く一致しています。",
      work: [
        { period: "2021–現在", primary: "ByteDance", secondary: "シニアフロントエンドエンジニア" },
        { period: "2017–2021", primary: "NetEase", secondary: "フロントエンドエンジニア" },
      ],
    },
    {
      creator: "赤木 リツコ",
      education: [{ period: "2012–2016", primary: "武漢大学", secondary: "経営管理" }],
      job: "プロダクト部 / グロースプロダクトマネージャー",
      lifecycleDetail: "1/2 日程確定",
      lifecycleStage: "対人面接",
      name: "アスカ",
      score: "推奨 · 81 点",
      skills: ["グロース実験", "収益化", "データ分析"],
      summary:
        "一貫したグロース経験と優れた実験設計力があります。チーム管理範囲は追加確認が必要です。",
      work: [
        { period: "2020–現在", primary: "RED", secondary: "グロースプロダクト責任者" },
        { period: "2016–2020", primary: "Meituan", secondary: "プロダクトマネージャー" },
      ],
    },
    {
      creator: "碇 ゲンドウ",
      education: [{ period: "2009–2013", primary: "華中科技大学", secondary: "ソフトウェア工学" }],
      job: "技術部 / バックエンドアーキテクト",
      lifecycleDetail: "未処理",
      lifecycleStage: "書類選考",
      name: "綾波 レイ",
      score: "適合 · 72 点",
      skills: ["Java", "分散システム", "PostgreSQL"],
      summary:
        "基盤設計の経験は堅実ですが、大規模チーム連携と主要な安定性指標の根拠が履歴書に不足しています。",
      work: [
        { period: "2019–現在", primary: "Trip.com", secondary: "バックエンドアーキテクト" },
        { period: "2013–2019", primary: "Alibaba Cloud", secondary: "シニアエンジニア" },
      ],
    },
  ],
  ko: [
    {
      creator: "카츠라기 미사토",
      education: [{ period: "2013–2017", primary: "저장대학교", secondary: "컴퓨터과학" }],
      job: "기술 부문 / 시니어 프런트엔드 엔지니어",
      lifecycleDetail: "1/2 다음 면접 대기",
      lifecycleStage: "AI 면접",
      name: "신지",
      score: "추천 · 86점",
      skills: ["React", "TypeScript", "마이크로 프런트엔드", "성능 최적화"],
      summary:
        "프런트엔드 경력 8년으로 중대형 아키텍처 개편을 주도했으며 직무의 핵심 요건과 높은 적합도를 보입니다.",
      work: [
        { period: "2021–현재", primary: "ByteDance", secondary: "시니어 프런트엔드 엔지니어" },
        { period: "2017–2021", primary: "NetEase", secondary: "프런트엔드 엔지니어" },
      ],
    },
    {
      creator: "아카기 리츠코",
      education: [{ period: "2012–2016", primary: "우한대학교", secondary: "경영학" }],
      job: "제품 부문 / 그로스 프로덕트 매니저",
      lifecycleDetail: "1/2 일정 확정",
      lifecycleStage: "대면 면접",
      name: "아스카",
      score: "추천 · 81점",
      skills: ["그로스 실험", "수익화", "데이터 분석"],
      summary:
        "완결된 그로스 경험과 뛰어난 실험 설계 역량을 갖췄습니다. 팀 관리 범위는 추가 확인이 필요합니다.",
      work: [
        { period: "2020–현재", primary: "RED", secondary: "그로스 제품 책임자" },
        { period: "2016–2020", primary: "Meituan", secondary: "프로덕트 매니저" },
      ],
    },
    {
      creator: "이카리 겐도",
      education: [
        { period: "2009–2013", primary: "화중과학기술대학교", secondary: "소프트웨어공학" },
      ],
      job: "기술 부문 / 백엔드 아키텍트",
      lifecycleDetail: "처리 대기",
      lifecycleStage: "이력서 심사",
      name: "아야나미 레이",
      score: "적합 · 72점",
      skills: ["Java", "분산 시스템", "PostgreSQL"],
      summary:
        "인프라 설계 경험은 탄탄하지만 이력서에 대규모 팀 협업과 핵심 안정성 지표의 근거가 부족합니다.",
      work: [
        { period: "2019–현재", primary: "Trip.com", secondary: "백엔드 아키텍트" },
        { period: "2013–2019", primary: "Alibaba Cloud", secondary: "시니어 엔지니어" },
      ],
    },
  ],
} satisfies Record<"en" | "ja" | "ko", LocalizedResumeFields[]>;

function getLocalizedResumes(): ResumeCardData[] {
  const locale = getLocale();
  if (locale === "zh-CN") {
    return RESUMES;
  }
  const translations = RESUME_TRANSLATIONS[locale];
  return RESUMES.map((resume, index) => {
    const translation = translations[index];
    return translation ? { ...resume, ...translation } : resume;
  });
}

function CandidateAvatar({ record }: { record: ResumeCardData }) {
  const seed = [record.name, record.email].filter(Boolean).join(" ") || record.id;

  return (
    <Avatar
      className="mt-0.5 size-12"
      generatedSize={48}
      label={m.home_frame_candidate_avatar({ name: record.name })}
      seed={`candidate:${seed}`}
    >
      <AvatarFallback>{record.name.slice(0, 1)}</AvatarFallback>
    </Avatar>
  );
}

function ResumeCardMetaItem({
  children,
  icon,
  label,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span className="flex min-h-6 min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
      <span aria-hidden="true" className="inline-flex shrink-0 text-muted-foreground/70">
        {icon}
      </span>
      <span className="sr-only">{label}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </span>
  );
}

function ResumeCardCreatorMeta({ name }: { name: string }) {
  return (
    <span className="flex h-6 min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
      <IconUpload aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground/70" />
      <span className="shrink-0">{m.home_frame_uploader()}</span>
      <Avatar
        className="size-4! shrink-0"
        generatedSize={16}
        label={m.home_frame_candidate_avatar({ name })}
        seed={`recruiter:${name}`}
        size="sm"
      >
        <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

function ProfileSnapshotLine({ line }: { line: ProfileSnapshotLineData }) {
  return (
    <p
      className="flex min-w-0 items-baseline gap-2"
      title={`${line.period} · ${line.primary} · ${line.secondary}`}
    >
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{line.period}</span>
      <span className="min-w-0 truncate text-foreground text-sm">
        {line.primary} · {line.secondary}
      </span>
    </p>
  );
}

function ResumeCardProfileSnapshot({ record }: { record: ResumeCardData }) {
  return (
    <div className="hidden min-w-0 border-border/60 border-l border-dashed pl-8 2xl:block">
      <div className="grid min-w-0 content-start gap-1 text-sm 2xl:max-w-sm">
        {record.work.map((line) => (
          <ProfileSnapshotLine key={`${line.period}-${line.primary}`} line={line} />
        ))}
        <div className="my-0.5 border-border/60 border-t" />
        {record.education.map((line) => (
          <ProfileSnapshotLine key={`${line.period}-${line.primary}`} line={line} />
        ))}
      </div>
    </div>
  );
}

function ResumeCardActions({ record }: { record: ResumeCardData }) {
  const cardActions = [
    { icon: IconFileText, label: m.home_frame_resume() },
    { icon: IconEdit, label: m.home_frame_edit() },
    { icon: IconDots, label: m.home_frame_candidate_more() },
  ] as const;
  const actions = record.canLaunchInterview
    ? [
        cardActions[0],
        cardActions[1],
        { icon: IconSparkles, label: m.home_frame_ai_round() },
        cardActions[2],
      ]
    : cardActions;

  return (
    <div className="flex justify-end self-center">
      <div className="flex items-center justify-end gap-1.5 xl:flex-col xl:items-stretch">
        {actions.map(({ icon: Icon, label }) => (
          <span
            className="inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-xs"
            key={label}
          >
            <Icon className="size-3.5" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ResumeCardList() {
  const resumes = getLocalizedResumes();

  return (
    <div className="grid gap-3">
      {resumes.map((record) => (
        <Card
          className="h-full overflow-hidden rounded-xl dark:bg-background"
          key={record.id}
          render={<article />}
        >
          <CardPanel className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <div className="flex min-w-0 gap-3">
              <Checkbox
                aria-label={m.home_frame_select_candidate({ name: record.name })}
                className="relative z-20 mt-3"
              />
              <CandidateAvatar record={record} />
              <div className="min-w-0 flex-1">
                <div className="grid min-w-0 gap-x-4 gap-y-3 2xl:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.7fr)] 2xl:gap-x-8">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 xl:col-span-2">
                    <span className="min-w-0 truncate font-semibold text-base underline decoration-transparent underline-offset-4">
                      {record.name}{" "}
                      <span className="font-normal text-muted-foreground/60 text-xs">
                        ({record.id})
                      </span>
                    </span>
                    <ResumeLifecycleBadge
                      detailLabel={record.lifecycleDetail}
                      fullLabel={`${record.lifecycleStage} · ${record.lifecycleDetail}`}
                      stageLabel={record.lifecycleStage}
                      tone={record.isScreening ? "outline" : "info"}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
                      <ResumeCardMetaItem
                        icon={<IconBriefcase className="size-3.5" />}
                        label={m.home_frame_related_job()}
                      >
                        <span className="text-foreground underline decoration-transparent underline-offset-2">
                          {record.job}
                        </span>
                      </ResumeCardMetaItem>
                      <ResumeCardCreatorMeta name={record.creator} />
                      <span className="inline-flex min-h-6 min-w-0 items-center text-muted-foreground text-xs tabular-nums">
                        {record.createdAt}
                      </span>
                      <span className="inline-flex min-h-6 min-w-0 items-center gap-1.5 text-muted-foreground text-xs 2xl:hidden">
                        <IconInfoCircle
                          aria-hidden="true"
                          className="size-3.5 shrink-0 text-muted-foreground/70"
                        />
                        {m.home_frame_candidate_more()}
                      </span>
                    </div>

                    <p className="mt-3 line-clamp-2 text-muted-foreground text-sm leading-6">
                      <IconSparkles
                        aria-hidden="true"
                        className={`mr-1 inline size-3.5 align-[-2px] ${
                          record.scoreTone === "success"
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-amber-700 dark:text-amber-300"
                        }`}
                      />
                      <span
                        className={`font-medium ${
                          record.scoreTone === "success"
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {record.score}
                      </span>{" "}
                      {record.summary}
                    </p>
                    <div className="mt-3 flex max-h-14 flex-wrap gap-1.5 overflow-hidden">
                      {record.skills.map((skill) => (
                        <Badge className="max-w-52 truncate" key={skill} variant="outline">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <ResumeCardProfileSnapshot record={record} />
                </div>
              </div>
            </div>
            <ResumeCardActions record={record} />
          </CardPanel>
        </Card>
      ))}
    </div>
  );
}

function ResumesContent() {
  // 真实 layout 内层：flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6
  // 真实 ResumeLibraryPage: <div className="space-y-6"> 包 PageHeader + Charts + DataGrid
  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <PageHeader title={m.home_frame_recruitment_desk()} />
      <ChartsRow />
      <PipelineStageTabs />
      <div className="flex flex-col gap-4">
        <ResumeToolbar />
        <ResumeCardList />
      </div>
    </div>
  );
}

export function ResumesScreen({ className }: { className?: string }) {
  const breadcrumb: BreadcrumbCrumb[] = [
    { label: "Studio" },
    { current: true, label: m.home_frame_recruitment_desk() },
  ];

  return (
    <ScreenFrame className={className}>
      <AppShell
        breadcrumb={breadcrumb}
        sidebar={<StudioNav activeLabel={m.home_frame_nav_recruitment()} />}
        tab="studio"
      >
        <ResumesContent />
      </AppShell>
    </ScreenFrame>
  );
}
