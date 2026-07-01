export interface ResumeAnalysisProgressTool {
  done: boolean;
  name: string;
}

export type ResumeOcrPageStatus = "queued" | "running" | "completed" | "failed";

export interface ResumeOcrPageProgress {
  charCount?: number;
  page: number;
  status: ResumeOcrPageStatus;
  textPreview?: string;
  totalPages: number;
}

export interface ResumeOcrPageProgressDetail {
  charCount?: number;
  kind: "ocr-page";
  page: number;
  status: ResumeOcrPageStatus;
  totalPages: number;
}

export interface ResumeOcrPagePreview {
  charCount?: number;
  page: number;
  textPreview?: string;
  totalPages: number;
}

export type ProgressStepLabels = Record<string, string>;

const MAX_OCR_PREVIEW_CHARS = 220;

export function appendUniqueStreamDelta(current: string, delta: string): string {
  if (!delta) {
    return current;
  }
  return current.endsWith(delta) ? current : `${current}${delta}`;
}

export function upsertProgressTool(
  tools: ResumeAnalysisProgressTool[],
  name: string,
  done: boolean,
): ResumeAnalysisProgressTool[] {
  if (!name.trim()) {
    return tools;
  }

  const existingIndex = tools.findIndex((tool) => tool.name === name);
  if (existingIndex === -1) {
    return [...tools, { done, name }];
  }

  const existing = tools[existingIndex];
  if (existing?.done === done) {
    return tools;
  }

  return tools.map((tool, index) => (index === existingIndex ? { ...tool, done } : tool));
}

export function rememberProgressStepLabel(
  labels: ProgressStepLabels,
  stepId: string,
  label: string,
): ProgressStepLabels {
  if (!stepId.trim() || !label.trim()) {
    return labels;
  }
  if (labels[stepId] === label) {
    return labels;
  }
  return { ...labels, [stepId]: label };
}

export function getCompletedProgressToolName(
  event: { output?: unknown; stepId: string; [key: string]: unknown },
  labels: ProgressStepLabels,
): string {
  const { output } = event;
  if (
    typeof output === "object" &&
    output !== null &&
    "name" in output &&
    typeof output.name === "string"
  ) {
    return output.name;
  }
  return labels[event.stepId] ?? event.stepId;
}

function createQueuedPages(totalPages: number): ResumeOcrPageProgress[] {
  return Array.from({ length: totalPages }, (_, index) => ({
    page: index + 1,
    status: "queued",
    totalPages,
  }));
}

function normalizeOcrPages(
  pages: ResumeOcrPageProgress[],
  totalPages: number,
): ResumeOcrPageProgress[] {
  const byPage = new Map(pages.map((page) => [page.page, page]));
  return createQueuedPages(totalPages).map((page) => ({ ...page, ...byPage.get(page.page) }));
}

function sanitizeOcrPreview(value: string) {
  return value
    .replaceAll(/(\d{3})\d{4}(\d{4})/g, "$1****$2")
    .replaceAll(
      /([A-Z0-9._%+-])([A-Z0-9._%+-]*)(@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
      (_match, first: string, _middle: string, domain: string) => `${first}***${domain}`,
    )
    .slice(0, MAX_OCR_PREVIEW_CHARS);
}

export function upsertOcrPageProgress(
  pages: ResumeOcrPageProgress[],
  detail: ResumeOcrPageProgressDetail,
): ResumeOcrPageProgress[] {
  if (detail.page < 1 || detail.totalPages < 1 || detail.page > detail.totalPages) {
    return pages;
  }

  const normalizedPages = normalizeOcrPages(pages, detail.totalPages);
  return normalizedPages.map((page) =>
    page.page === detail.page
      ? {
          ...page,
          charCount: detail.charCount ?? page.charCount,
          status: detail.status,
          totalPages: detail.totalPages,
        }
      : { ...page, totalPages: detail.totalPages },
  );
}

export function upsertOcrPagePreview(
  pages: ResumeOcrPageProgress[],
  preview: ResumeOcrPagePreview,
): ResumeOcrPageProgress[] {
  if (preview.page < 1 || preview.totalPages < 1 || preview.page > preview.totalPages) {
    return pages;
  }

  const normalizedPages = normalizeOcrPages(pages, preview.totalPages);
  return normalizedPages.map((page) =>
    page.page === preview.page
      ? {
          ...page,
          charCount: preview.charCount ?? page.charCount,
          status: "completed",
          textPreview:
            typeof preview.textPreview === "string"
              ? sanitizeOcrPreview(preview.textPreview)
              : page.textPreview,
          totalPages: preview.totalPages,
        }
      : { ...page, totalPages: preview.totalPages },
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function addField(fields: { label: string; value: string }[], label: string, value: unknown) {
  if (typeof value === "string" && value.trim() && value.trim() !== "未发现信息") {
    fields.push({ label, value: value.trim() });
  } else if (typeof value === "number" && Number.isFinite(value)) {
    fields.push({ label, value: String(value) });
  } else if (isStringArray(value) && value.length > 0) {
    fields.push({ label, value: value.slice(0, 5).join("、") });
  }
}

export function profilePreviewToPartialFields(value: unknown): { label: string; value: string }[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const preview = value as Record<string, unknown>;
  const fields: { label: string; value: string }[] = [];
  addField(fields, "姓名", preview.name);
  addField(fields, "目标岗位", preview.targetRoles);
  addField(fields, "技能", preview.skills);
  addField(fields, "院校", preview.schools);
  addField(fields, "工作年限", preview.workYears);
  return fields;
}
