import { z } from "zod";

// 表单/接口共享 schema / Shared schema for form & API
export const globalConfigSchema = z.object({
  closingInstructions: z.string().max(10_000).default(""),
  companyContext: z.string().max(8000).default(""),
  companyName: z.string().max(120).default(""),
  openingInstructions: z.string().max(10_000).default(""),
});

export type GlobalConfigInput = z.infer<typeof globalConfigSchema>;

export interface GlobalConfigRecord extends GlobalConfigInput {
  updatedAt: string;
  updatedBy: string | null;
}
