import { z } from "zod";

export const departmentBaseSchema = z.object({
  description: z.string().trim().max(500, "描述不能超过 500 字").optional().or(z.literal("")),
  name: z.string().trim().min(1, "请输入部门名称").max(120, "部门名称不能超过 120 个字符"),
});

export const departmentFormSchema = departmentBaseSchema;
export const departmentUpdateSchema = departmentBaseSchema;

export type DepartmentFormValues = z.infer<typeof departmentFormSchema>;
export type DepartmentUpdateValues = z.infer<typeof departmentUpdateSchema>;

export interface DepartmentRecord {
  id: string;
  name: string;
  description: string | null;
  createdBy: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface DepartmentListRecord extends DepartmentRecord {
  interviewerCount: number;
  jobDescriptionCount: number;
}
