/**
 * 共享的 multipart/form-data 组装：把表单值 + 简历文件 + 序列化字段统一打包。
 * Shared multipart/form-data builder — packs form values + resume file + serialized
 * fields uniformly.
 *
 * 创建 / 编辑 接口都接受 multipart 格式，且字段名一致。把组装逻辑集中后，调整字段名时只需改一处。
 * Both the create and edit endpoints accept the same multipart shape; centralising
 * lets us update field names in one place when the contract changes.
 */

import { normalizeInterviewQuestions, normalizeScheduleEntries } from "./index";
import type { InterviewFormValues } from "./index";

/**
 * 构造提交用的 FormData。
 * Build the FormData payload submitted by the dialog.
 *
 * @param values  当前表单值 / Current form values.
 * @param options 简历文件 / 题目字段名等 / Resume file and questions field selection.
 */
export function buildInterviewFormData(
  values: InterviewFormValues,
  options: {
    resumeFile?: File | null;
    /**
     * 题目以哪个字段名提交。
     * - `manualInterviewQuestions` 用于「创建」（仅在用户手动维护题目时附带）；
     * - `editedQuestions` 用于「编辑」（始终附带改动后的题目）。
     *
     * Which field to use for serialised questions.
     * - `manualInterviewQuestions` for create (only when manually maintained);
     * - `editedQuestions` for edit (always attached with the latest list).
     */
    questionsFieldName?: "manualInterviewQuestions" | "editedQuestions" | null;
  } = {},
): FormData {
  const formData = new FormData();
  formData.append("candidateName", values.candidateName);
  formData.append("candidateEmail", values.candidateEmail);
  formData.append("targetRole", values.targetRole);
  formData.append("notes", values.notes);
  formData.append("status", values.status);
  formData.append("jobDescriptionId", values.jobDescriptionId ?? "");
  formData.append(
    "scheduleEntries",
    JSON.stringify(normalizeScheduleEntries(values.scheduleEntries)),
  );

  if (options.resumeFile) {
    formData.append("resume", options.resumeFile);
  }

  if (options.questionsFieldName) {
    const normalizedQuestions = normalizeInterviewQuestions(values.interviewQuestions);
    if (normalizedQuestions.length > 0) {
      formData.append(options.questionsFieldName, JSON.stringify(normalizedQuestions));
    }
  }

  return formData;
}
