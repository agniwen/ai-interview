import { createHash } from "node:crypto";
import path from "node:path";
import { structuredSchema } from "@arc/db-schema/resume-parser-schema";
import type { ResumeParserStructured } from "@arc/db-schema/resume-parser-schema";
import type { ResumeTextSource } from "./resume-parse-pipeline";

const DEFAULT_VERIFY_PARSE_BASE_URL = "https://test.roomdesign.online";

export interface ExternalResumeVerifyParseResult {
  pageCount: number;
  structured: ResumeParserStructured;
  text: string;
  textSource: ResumeTextSource;
}

interface ExternalResumeVerifyParseInput {
  bytes: Uint8Array;
  fileName: string;
  mediaType?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }
  const child = value[key];
  return isRecord(child) ? child : null;
}

function getArray(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) {
    return [];
  }
  const child = value[key];
  return Array.isArray(child) ? child : [];
}

function getString(value: unknown, key: string): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const child = value[key];
  return typeof child === "string" ? child.trim() || null : null;
}

function getBoolean(value: unknown, key: string): boolean | null {
  if (!isRecord(value)) {
    return null;
  }
  const child = value[key];
  return typeof child === "boolean" ? child : null;
}

function getNumberLike(value: unknown, key: string): number | null {
  if (!isRecord(value)) {
    return null;
  }
  const child = value[key];
  if (typeof child === "number" && Number.isFinite(child)) {
    return child;
  }
  if (typeof child !== "string") {
    return null;
  }
  const match = child.trim().match(/\d+(?:\.\d+)?/);
  if (!match?.[0]) {
    return null;
  }
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function getStringArray(value: unknown, key: string): string[] {
  if (!isRecord(value)) {
    return [];
  }
  const child = value[key];
  if (!Array.isArray(child)) {
    return [];
  }
  return uniqueStrings(child.filter((item): item is string => typeof item === "string"));
}

function splitList(value: string | null): string[] {
  if (!value) {
    return [];
  }
  return uniqueStrings(value.split(/[,，;；、/|]/));
}

function pickString(...candidates: [string | null, string][]): string | null {
  for (const [value] of candidates) {
    if (value) {
      return value;
    }
  }
  return null;
}

function pickArray(...candidates: unknown[][]): unknown[] {
  for (const value of candidates) {
    if (value.length > 0) {
      return value;
    }
  }
  return [];
}

function mapWorkExperiences(source: unknown[]): ResumeParserStructured["workExperiences"] {
  return source.filter(isRecord).map((item) => ({
    company: getString(item, "company"),
    period: getString(item, "period"),
    role: getString(item, "position") ?? getString(item, "role"),
    summary: getString(item, "description") ?? getString(item, "summary"),
  }));
}

function mapProjectExperiences(source: unknown[]): ResumeParserStructured["projectExperiences"] {
  return source.filter(isRecord).map((item) => ({
    name: getString(item, "name"),
    period: getString(item, "period"),
    role: getString(item, "role"),
    summary: getString(item, "description") ?? getString(item, "summary"),
    techStack: [
      ...splitList(getString(item, "technologies")),
      ...getStringArray(item, "techStack"),
    ],
  }));
}

function structuredToText(structured: ResumeParserStructured): string {
  const lines = [
    `姓名：${structured.name ?? ""}`,
    `电话：${structured.phone ?? ""}`,
    `邮箱：${structured.email ?? ""}`,
    `学校：${structured.schools.join("、")}`,
    `岗位：${structured.targetRoles.join("、")}`,
    `技能：${structured.skills.join("、")}`,
    "工作经历：",
    ...structured.workExperiences.map((item) =>
      [item.period, item.company, item.role, item.summary].filter(Boolean).join(" | "),
    ),
    "项目经历：",
    ...structured.projectExperiences.map((item) =>
      [item.period, item.name, item.role, item.techStack.join("、"), item.summary]
        .filter(Boolean)
        .join(" | "),
    ),
  ];
  return lines.filter((line) => line.trim().length > 0).join("\n");
}

function mapExternalResponse(response: unknown): ResumeParserStructured {
  const parsedResult = getRecord(response, "parsedResult");
  const profile = getRecord(parsedResult, "resumeProfile") ?? {};
  const record = getRecord(response, "resumeRecord") ?? {};
  const workExperiences = mapWorkExperiences(
    pickArray(getArray(profile, "workExperiences"), getArray(record, "workExperiences")),
  );
  const projectExperiences = mapProjectExperiences(
    pickArray(getArray(profile, "projectExperiences"), getArray(record, "projectExperiences")),
  );
  const workYears =
    getNumberLike(profile, "workYears") ?? getNumberLike(record, "experience_years");
  const dateRanges = uniqueStrings(
    [...workExperiences, ...projectExperiences]
      .map((experience) => experience.period)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
  );

  return structuredSchema.parse({
    age: getNumberLike(profile, "age") ?? getNumberLike(record, "age"),
    degree: getString(record, "education"),
    education: getString(record, "education"),
    email: pickString(
      [getString(profile, "email"), "parsedResult.resumeProfile.email"],
      [getString(record, "email"), "resumeRecord.email"],
    ),
    gender: pickString(
      [getString(profile, "gender"), "parsedResult.resumeProfile.gender"],
      [getString(record, "gender"), "resumeRecord.gender"],
    ),
    graduationYear: null,
    links: [],
    major: getString(record, "major"),
    name: pickString(
      [getString(profile, "name"), "parsedResult.resumeProfile.name"],
      [getString(record, "name"), "resumeRecord.name"],
    ),
    personalStrengths: getStringArray(profile, "personalStrengths"),
    phone: pickString(
      [getString(profile, "phone"), "parsedResult.resumeProfile.phone"],
      [getString(record, "phone"), "resumeRecord.phone"],
    ),
    projectExperiences,
    schools: uniqueStrings([
      ...getStringArray(profile, "schools"),
      ...splitList(getString(record, "school")),
    ]),
    skills: uniqueStrings([
      ...getStringArray(profile, "skills"),
      ...splitList(getString(record, "skills")),
    ]),
    targetRoles: uniqueStrings([
      ...getStringArray(profile, "targetRoles"),
      ...splitList(getString(record, "job_intention")),
    ]),
    timelineSummary: {
      currentStatus: null,
      dateRanges,
      estimatedExperienceYears: workYears,
      riskSignals: [],
    },
    workExperiences,
    workYears,
  });
}

function getMimeType(fileName: string, mediaType?: string): string {
  const normalizedMediaType = mediaType?.trim();
  if (normalizedMediaType) {
    return normalizedMediaType;
  }
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".docx": {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    case ".pdf": {
      return "application/pdf";
    }
    case ".xlsx": {
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
    case ".jpg":
    case ".jpeg": {
      return "image/jpeg";
    }
    case ".png": {
      return "image/png";
    }
    default: {
      return "application/octet-stream";
    }
  }
}

export function isExternalResumeVerifyParseEnabled(): boolean {
  return Boolean(process.env.RESUME_VERIFY_PARSE_API_KEY?.trim());
}

export async function parseExternalResumeVerifyParse(
  input: ExternalResumeVerifyParseInput,
): Promise<ExternalResumeVerifyParseResult> {
  const apiKey = process.env.RESUME_VERIFY_PARSE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RESUME_VERIFY_PARSE_API_KEY is not configured.");
  }

  const baseUrl = process.env.RESUME_VERIFY_PARSE_BASE_URL ?? DEFAULT_VERIFY_PARSE_BASE_URL;
  const fileHashMd5 = createHash("md5").update(input.bytes).digest("hex");
  const formData = new FormData();
  formData.append(
    "resume",
    new Blob([Buffer.from(input.bytes)], { type: getMimeType(input.fileName, input.mediaType) }),
    input.fileName,
  );
  formData.append("file_hash", fileHashMd5);
  formData.append("request_id", `arc-${Date.now()}-${fileHashMd5.slice(0, 8)}`);

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/resume/verify-parse`, {
    body: formData,
    headers: { "X-Api-Key": apiKey },
    method: "POST",
  });
  const rawBody = await response.text();
  let json: unknown;
  try {
    json = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    throw new Error(`External resume parser returned non-JSON response (${response.status}).`);
  }

  if (!response.ok) {
    const detail = isRecord(json) ? getString(json, "detail") : null;
    throw new Error(detail ?? `External resume parser failed with HTTP ${response.status}.`);
  }
  if (getBoolean(json, "hashVerified") === false) {
    throw new Error("External resume parser reported a file hash mismatch.");
  }

  const structured = mapExternalResponse(json);
  return {
    pageCount: 1,
    structured,
    text: structuredToText(structured),
    textSource: "external-verify-parse",
  };
}
