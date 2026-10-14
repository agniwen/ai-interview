/** Language-independent fixtures for the homepage demo; localized text lives in demo-copy/. */
export const DEMO_CANDIDATE_ID = "00003";
export const DEMO_CANDIDATE_EMAIL = "shinji@nerv.example";
export const DEMO_CANDIDATE_PHONE = "+81 3-0000-0003";
export const DEMO_INVITATION_URL = `interview.example.com/i/shinji-${DEMO_CANDIDATE_ID}`;
export const DEMO_CREATED_AT = "2026-10-06 14:32";

export type DemoDimensionKey =
  | "skillMatch"
  | "experienceRelevance"
  | "projectMatch"
  | "educationBackground"
  | "potential"
  | "stability";
export type DemoRecommendationLevel = "highly_recommended" | "recommended";
/** 招聘台卡片上的 AI 结论等级。 AI verdict levels shown on desk cards. */
export type DemoDeskVerdictLevel = DemoRecommendationLevel | "undecided";

/** Same order and radial positions as the production six-dimension evaluation. */
export const DEMO_DIMENSIONS: readonly {
  basis: "both" | "general" | "job";
  key: DemoDimensionKey;
  level: DemoRecommendationLevel;
}[] = [
  { basis: "job", key: "skillMatch", level: "highly_recommended" },
  { basis: "job", key: "experienceRelevance", level: "highly_recommended" },
  { basis: "job", key: "projectMatch", level: "highly_recommended" },
  { basis: "general", key: "educationBackground", level: "recommended" },
  { basis: "both", key: "potential", level: "highly_recommended" },
  { basis: "general", key: "stability", level: "recommended" },
];

export type DemoDateGroup = "today" | "yesterday" | "earlier";

/** Other desk records around the tour candidate, so the board reads like a real, busy list. */
export const DEMO_DESK_RECORDS = [
  {
    createdAt: "2026-10-06 11:08",
    group: "today",
    id: "00002",
    level: "recommended",
    pipeline: "interview:second",
  },
  {
    createdAt: "2026-10-06 09:41",
    group: "today",
    id: "00005",
    level: "undecided",
    pipeline: "screening:pass",
  },
  {
    createdAt: "2026-10-05 17:20",
    group: "yesterday",
    id: "00001",
    level: "recommended",
    pipeline: "interview:final",
  },
  {
    createdAt: "2026-10-05 10:03",
    group: "yesterday",
    id: "00004",
    level: "undecided",
    pipeline: "screening:pending",
  },
  {
    createdAt: "2026-10-04 15:46",
    group: "earlier",
    id: "00006",
    level: "recommended",
    pipeline: "offer:negotiating",
  },
] as const;

/** Tab badge counts on the real board; closed is a terminal archive and has no badge. */
export const DEMO_BOARD_COUNTS = new Map([
  ["all", 1284],
  ["interview", 48],
  ["offer", 7],
  ["onboarding", 3],
  ["screening", 312],
]);
