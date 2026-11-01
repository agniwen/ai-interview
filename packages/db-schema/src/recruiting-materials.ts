import { z } from "zod";

export const incomeProofTypeValues = [
  "monthly_salary",
  "annual_bonus",
  "bonus",
  "stock",
  "dividend",
  "social_insurance_housing_fund",
  "other",
] as const;
export type IncomeProofType = (typeof incomeProofTypeValues)[number];
export const incomeProofTypeLabels = {
  annual_bonus: "年终",
  bonus: "奖金",
  dividend: "分红",
  monthly_salary: "月薪",
  other: "其他",
  social_insurance_housing_fund: "五险一金",
  stock: "股票",
} satisfies Record<IncomeProofType, string>;
export const recruitingMaterialMetadataSchema = z.object({
  incomeType: z.enum(incomeProofTypeValues).nullable().default(null),
  notes: z.string().max(500, "备注不能超过 500 个字符").default(""),
});
export type RecruitingMaterialMetadata = z.infer<typeof recruitingMaterialMetadataSchema>;
