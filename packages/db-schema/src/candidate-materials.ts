export const candidateMaterialOwnerTypeValues = ["resume_pool_item", "recruiting_record"] as const;
export type CandidateMaterialOwnerType = (typeof candidateMaterialOwnerTypeValues)[number];

export const candidateMaterialKindValues = ["file", "link"] as const;
export type CandidateMaterialKind = (typeof candidateMaterialKindValues)[number];

export const candidateMaterialCategoryValues = [
  "portfolio",
  "video",
  "image",
  "archive",
  "document",
  "other",
] as const;
export type CandidateMaterialCategory = (typeof candidateMaterialCategoryValues)[number];

export const candidateMaterialCategoryLabels = {
  archive: "压缩包",
  document: "文档",
  image: "图片",
  other: "其他",
  portfolio: "作品集",
  video: "视频",
} satisfies Record<CandidateMaterialCategory, string>;
