import { z } from "zod";

export const DEFAULT_JOB_CODE_PREFIX = "AUR";

const jobCodePrefixSchema = z.preprocess(
  (value) => {
    const parsed = z.string().safeParse(value);
    if (!parsed.success) {
      return value;
    }
    const normalized = parsed.data.trim().toUpperCase();
    return normalized.length > 0 ? normalized : undefined;
  },
  z
    .string()
    .regex(/^[A-Z0-9]{3}$/, "岗位编码前缀只能包含 3 位大写字母或数字")
    .default(DEFAULT_JOB_CODE_PREFIX),
);

// 表单/接口共享 schema / Shared schema for form & API
export const globalConfigSchema = z.object({
  closingInstructions: z.string().max(10_000).default(""),
  companyContext: z.string().max(8000).default(""),
  companyName: z.string().max(120).default(""),
  jobCodePrefix: jobCodePrefixSchema,
  openingInstructions: z.string().max(10_000).default(""),
});

export type GlobalConfigInput = z.infer<typeof globalConfigSchema>;

export interface GlobalConfigRecord extends GlobalConfigInput {
  updatedAt: string;
  updatedBy: string | null;
}
