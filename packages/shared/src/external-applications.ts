import {
  externalApplicationWorkModeLabels,
  externalApplicationWorkModeValues,
} from "@app/db-schema/external-application-details";
import type {
  ExternalApplicationDetails,
  ExternalApplicationWorkMode,
} from "@app/db-schema/external-application-details";
import { z } from "zod";

export { externalApplicationWorkModeLabels, externalApplicationWorkModeValues };
export type { ExternalApplicationDetails, ExternalApplicationWorkMode };

export const externalApplicationWorkModeSchema = z.enum(externalApplicationWorkModeValues, {
  message: "请选择办公形式",
});

function isValidOptionalHttpUrl(value: string): boolean {
  if (!value) {
    return true;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const externalApplicationFormSchema = z.object({
  alternateJobDescriptionId: z
    .string()
    .trim()
    .max(128)
    .nullable()
    .optional()
    .transform((value) => value || null),
  batch: z.string().trim().max(120, "批次不能超过 120 字").optional().default(""),
  candidateName: z.string().trim().min(1, "请输入候选人姓名").max(120, "姓名不能超过 120 字"),
  className: z.string().trim().max(120, "班级不能超过 120 字").optional().default(""),
  contact: z.string().trim().min(1, "请输入联系方式").max(200, "联系方式不能超过 200 字"),
  jobDescriptionId: z.string().trim().min(1, "请选择首选岗位").max(128),
  portfolioContribution: z
    .string()
    .trim()
    .max(2000, "作品个人分工不能超过 2000 字")
    .optional()
    .default(""),
  portfolioUrl: z
    .string()
    .trim()
    .max(2048, "链接长度不能超过 2048 个字符")
    .optional()
    .default("")
    .refine(isValidOptionalHttpUrl, { message: "请输入有效的 http 或 https 链接" }),
  trainingInstitution: z
    .string()
    .trim()
    .min(1, "请输入培训机构/校区")
    .max(200, "培训机构/校区不能超过 200 字"),
  workMode: externalApplicationWorkModeSchema,
});

export type ExternalApplicationFormInput = z.infer<typeof externalApplicationFormSchema>;

const EMAIL_CONTACT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const PHONE_CHARS_PATTERN = /^[+\d\s()-]+$/u;

export interface ParsedExternalApplicationContact {
  contactRaw: string;
  email: string | null;
  phone: string | null;
}

export function parseExternalApplicationContact(raw: string): ParsedExternalApplicationContact {
  const trimmed = raw.trim();
  if (EMAIL_CONTACT_PATTERN.test(trimmed)) {
    return {
      contactRaw: trimmed,
      email: trimmed,
      phone: null,
    };
  }
  if (PHONE_CHARS_PATTERN.test(trimmed)) {
    const digits = trimmed.replaceAll(/\D/gu, "");
    if (digits.length >= 7 && digits.length <= 20) {
      return {
        contactRaw: trimmed,
        email: null,
        phone: trimmed,
      };
    }
  }
  return {
    contactRaw: trimmed,
    email: null,
    phone: null,
  };
}
