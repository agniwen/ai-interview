import { z } from "zod";
import { offerEmailInputSchema } from "./studio-interviews";

export const backgroundCheckCollectionStatusValues = ["pending", "sent", "submitted"] as const;
export const backgroundCheckCollectionStatusSchema = z.enum(backgroundCheckCollectionStatusValues);
export type BackgroundCheckCollectionStatus = z.infer<typeof backgroundCheckCollectionStatusSchema>;

export const backgroundCheckLeavingReasonValues = [
  "contract_ended",
  "employee_resigned",
  "workforce_reduction",
  "restructuring",
  "other",
  "refuse_to_answer",
] as const;
export const backgroundCheckLeavingReasonSchema = z.enum(backgroundCheckLeavingReasonValues);
export type BackgroundCheckLeavingReason = z.infer<typeof backgroundCheckLeavingReasonSchema>;

const backgroundCheckReferenceSchema = z.object({
  contact: z.string().trim().min(1, "请填写办公电话或工作邮箱").max(200),
  name: z.string().trim().min(1, "请填写证明人姓名").max(100),
});

export const backgroundCheckEmploymentSchema = z
  .object({
    colleague: backgroundCheckReferenceSchema,
    companyName: z.string().trim().min(1, "请填写公司名称").max(200),
    contactPermission: z.boolean(),
    disciplinaryRecord: z.string().trim().min(1, "没有违纪记录请填写“无”").max(1000),
    employmentEnd: z.iso.date({ error: "请选择有效的结束日期" }).nullable(),
    employmentStart: z.iso.date({ error: "请选择有效的开始日期" }),
    hasLeftCompany: z.boolean(),
    hrContact: backgroundCheckReferenceSchema,
    lastPosition: z.string().trim().min(1, "请填写最后职位").max(200),
    leavingReason: backgroundCheckLeavingReasonSchema.nullable(),
    leavingReasonOther: z.string().trim().max(500).nullable().optional(),
    lineManager: backgroundCheckReferenceSchema,
  })
  .refine(
    (value) =>
      !value.hasLeftCompany ||
      (value.employmentEnd !== null && value.employmentEnd >= value.employmentStart),
    {
      message: "离职日期不能早于入职日期",
      path: ["employmentEnd"],
    },
  )
  .refine((value) => value.hasLeftCompany || value.employmentEnd === null, {
    message: "在职状态下无需填写离职日期",
    path: ["employmentEnd"],
  })
  .refine((value) => !value.hasLeftCompany || value.leavingReason !== null, {
    message: "请选择离职原因",
    path: ["leavingReason"],
  })
  .refine((value) => value.leavingReason !== "other" || Boolean(value.leavingReasonOther?.trim()), {
    message: "请填写其他离职原因",
    path: ["leavingReasonOther"],
  })
  .refine(
    (value) =>
      value.hasLeftCompany || (value.leavingReason === null && value.leavingReasonOther === null),
    {
      message: "在职状态下无需填写离职原因",
      path: ["leavingReason"],
    },
  );

export const backgroundCheckFormInputSchema = z
  .object({
    candidateName: z.string().trim().min(1, "请填写姓名").max(100),
    consent: z.literal(true, { error: "请确认授权背景调查" }),
    employmentRecords: z
      .array(backgroundCheckEmploymentSchema)
      .min(1, "请至少填写一段工作经历")
      .max(2, "最多填写两段工作经历"),
    gender: z.enum(["male", "female", "other"]),
    graduationCertificateNumber: z.string().trim().min(1, "请填写毕业证书编号").max(100),
    idNumber: z.string().trim().min(6, "请填写有效证件号码").max(50),
    signatureName: z.string().trim().min(1, "请填写本人签名").max(100),
    signedDate: z.iso.date({ error: "请选择签署日期" }),
  })
  .refine((value) => value.signatureName === value.candidateName, {
    message: "本人签名需与姓名一致",
    path: ["signatureName"],
  });
export type BackgroundCheckFormInput = z.infer<typeof backgroundCheckFormInputSchema>;

export const backgroundCheckEmailInputSchema = offerEmailInputSchema;
export type BackgroundCheckEmailInput = z.infer<typeof backgroundCheckEmailInputSchema>;
