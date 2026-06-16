import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { structuredSchema } from "@arc/db-schema/resume-parser-schema";
import type { ResumeParserStructured } from "@arc/db-schema/resume-parser-schema";

interface CliOptions {
  files: string[];
  out?: string;
}

interface FieldReport {
  present: boolean;
  source: string | null;
  value: unknown;
}

interface FileReport {
  duplicateCheck: {
    isDuplicate: boolean | null;
    matchedResumeRid: number | string | null;
    primaryReason: string | null;
  } | null;
  error: string | null;
  fields: Record<string, FieldReport>;
  file: string;
  fileHashMd5: string;
  fileName: string;
  hashVerified: boolean | null;
  httpStatus: number | null;
  mappedStructured: ResumeParserStructured | null;
  missingValueFields: string[];
  schemaIssues: string[];
  schemaValid: boolean;
  traceId: string | null;
}

interface EvaluationReport {
  baseUrl: string;
  generatedAt: string;
  results: FileReport[];
  summary: {
    failed: number;
    schemaValid: number;
    succeeded: number;
    total: number;
  };
}

const REQUIRED_VALUE_FIELDS = [
  "name",
  "phone",
  "email",
  "schools",
  "skills",
  "targetRoles",
  "workYears",
  "workExperiences",
  "projectExperiences",
] as const;
const DEFAULT_VERIFY_PARSE_API_KEY = "l0GX1WyHtwkLFcKw0mU491ljYMkfxhWmLkuQuUg2-68";
const DEFAULT_VERIFY_PARSE_BASE_URL = "https://test.roomdesign.online";

function usage(): never {
  throw new Error(
    [
      "Usage:",
      "  RESUME_VERIFY_PARSE_API_KEY=... pnpm --filter @arc/ai-recruitment-copilot-backend exec tsx src/scripts/evaluate-external-resume-parser.ts --out /tmp/report.json <resume...>",
      "",
      "Env:",
      `  RESUME_VERIFY_PARSE_BASE_URL defaults to ${DEFAULT_VERIFY_PARSE_BASE_URL}`,
      "  RESUME_VERIFY_PARSE_API_KEY defaults to the shared integration-test key",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): CliOptions {
  const files: string[] = [];
  let out: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      const value = argv[index + 1];
      if (!value) {
        usage();
      }
      out = value;
      index += 1;
      continue;
    }
    if (arg?.startsWith("--out=")) {
      out = arg.slice("--out=".length);
      continue;
    }
    if (arg?.startsWith("-")) {
      usage();
    }
    if (arg) {
      files.push(arg);
    }
  }

  if (files.length === 0) {
    usage();
  }
  return { files, out };
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
  const normalized = child.trim();
  if (!normalized) {
    return null;
  }
  const match = normalized.match(/\d+(?:\.\d+)?/);
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

function pickString(...candidates: [string | null, string][]): {
  source: string | null;
  value: string | null;
} {
  for (const [value, source] of candidates) {
    if (value) {
      return { source, value };
    }
  }
  return { source: null, value: null };
}

function pickArray(...candidates: [unknown[], string][]): {
  source: string | null;
  value: unknown[];
} {
  for (const [value, source] of candidates) {
    if (value.length > 0) {
      return { source, value };
    }
  }
  return { source: null, value: [] };
}

function field(value: unknown, source: string | null): FieldReport {
  let present: boolean;
  if (Array.isArray(value)) {
    present = value.length > 0;
  } else if (isRecord(value)) {
    present = Object.keys(value).length > 0;
  } else {
    present = value !== null && value !== undefined && value !== "";
  }
  return { present, source, value };
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

function mapExternalResponse(response: unknown): {
  fields: Record<string, FieldReport>;
  structured: ResumeParserStructured;
} {
  const parsedResult = getRecord(response, "parsedResult");
  const profile = getRecord(parsedResult, "resumeProfile") ?? {};
  const record = getRecord(response, "resumeRecord") ?? {};

  const name = pickString(
    [getString(profile, "name"), "parsedResult.resumeProfile.name"],
    [getString(record, "name"), "resumeRecord.name"],
  );
  const gender = pickString(
    [getString(profile, "gender"), "parsedResult.resumeProfile.gender"],
    [getString(record, "gender"), "resumeRecord.gender"],
  );
  const email = pickString(
    [getString(profile, "email"), "parsedResult.resumeProfile.email"],
    [getString(record, "email"), "resumeRecord.email"],
  );
  const phone = pickString(
    [getString(profile, "phone"), "parsedResult.resumeProfile.phone"],
    [getString(record, "phone"), "resumeRecord.phone"],
  );
  const degree = pickString([getString(record, "education"), "resumeRecord.education"]);
  const major = pickString([getString(record, "major"), "resumeRecord.major"]);
  const targetRoleText = getString(record, "job_intention");
  const skillsText = getString(record, "skills");
  const schools = uniqueStrings([
    ...getStringArray(profile, "schools"),
    ...splitList(getString(record, "school")),
  ]);
  const targetRoles = uniqueStrings([
    ...getStringArray(profile, "targetRoles"),
    ...splitList(targetRoleText),
  ]);
  const skills = uniqueStrings([...getStringArray(profile, "skills"), ...splitList(skillsText)]);
  const workYears =
    getNumberLike(profile, "workYears") ?? getNumberLike(record, "experience_years");
  const workExperienceSource = pickArray(
    [getArray(profile, "workExperiences"), "parsedResult.resumeProfile.workExperiences"],
    [getArray(record, "workExperiences"), "resumeRecord.workExperiences"],
  );
  const projectExperienceSource = pickArray(
    [getArray(profile, "projectExperiences"), "parsedResult.resumeProfile.projectExperiences"],
    [getArray(record, "projectExperiences"), "resumeRecord.projectExperiences"],
  );
  const workExperiences = mapWorkExperiences(workExperienceSource.value);
  const projectExperiences = mapProjectExperiences(projectExperienceSource.value);
  const dateRanges = uniqueStrings(
    [...workExperiences, ...projectExperiences]
      .map((experience) => experience.period)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
  );

  const structured: ResumeParserStructured = {
    age: getNumberLike(profile, "age") ?? getNumberLike(record, "age"),
    degree: degree.value,
    education: degree.value,
    email: email.value,
    gender: gender.value,
    graduationYear: null,
    links: [],
    major: major.value,
    name: name.value,
    personalStrengths: getStringArray(profile, "personalStrengths"),
    phone: phone.value,
    projectExperiences,
    schools,
    skills,
    targetRoles,
    timelineSummary: {
      currentStatus: null,
      dateRanges,
      estimatedExperienceYears: workYears,
      riskSignals: [],
    },
    workExperiences,
    workYears,
  };

  const fields: Record<string, FieldReport> = {
    age: field(
      structured.age,
      structured.age === null ? null : "parsedResult.resumeProfile.age|resumeRecord.age",
    ),
    degree: field(structured.degree, degree.source),
    education: field(structured.education, degree.source),
    email: field(structured.email, email.source),
    gender: field(structured.gender, gender.source),
    graduationYear: field(structured.graduationYear, null),
    links: field(structured.links, null),
    major: field(structured.major, major.source),
    name: field(structured.name, name.source),
    personalStrengths: field(
      structured.personalStrengths,
      "parsedResult.resumeProfile.personalStrengths",
    ),
    phone: field(structured.phone, phone.source),
    projectExperiences: field(structured.projectExperiences, projectExperienceSource.source),
    schools: field(structured.schools, "parsedResult.resumeProfile.schools|resumeRecord.school"),
    skills: field(structured.skills, "parsedResult.resumeProfile.skills|resumeRecord.skills"),
    targetRoles: field(
      structured.targetRoles,
      "parsedResult.resumeProfile.targetRoles|resumeRecord.job_intention",
    ),
    timelineSummary: field(structured.timelineSummary, "derived from periods/workYears"),
    workExperiences: field(structured.workExperiences, workExperienceSource.source),
    workYears: field(
      structured.workYears,
      workYears === null
        ? null
        : "parsedResult.resumeProfile.workYears|resumeRecord.experience_years",
    ),
  };

  return { fields, structured };
}

function summarizeMissing(fields: Record<string, FieldReport>): string[] {
  return REQUIRED_VALUE_FIELDS.filter((key) => !fields[key]?.present);
}

function getMimeType(fileName: string): string {
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

function readDuplicateCheck(response: unknown): FileReport["duplicateCheck"] {
  const duplicateCheck = getRecord(response, "duplicateCheck");
  if (!duplicateCheck) {
    return null;
  }
  return {
    isDuplicate: getBoolean(duplicateCheck, "isDuplicate"),
    matchedResumeRid:
      getString(duplicateCheck, "matchedResumeRid") ??
      getNumberLike(duplicateCheck, "matchedResumeRid"),
    primaryReason: getString(duplicateCheck, "primaryReason"),
  };
}

async function parseOneFile(args: {
  apiKey: string;
  baseUrl: string;
  file: string;
  index: number;
}): Promise<FileReport> {
  const bytes = await readFile(args.file);
  const fileName = path.basename(args.file);
  const fileHashMd5 = createHash("md5").update(bytes).digest("hex");
  const formData = new FormData();
  formData.append("resume", new Blob([bytes], { type: getMimeType(fileName) }), fileName);
  formData.append("file_hash", fileHashMd5);
  formData.append(
    "request_id",
    `arc-external-parser-eval-${Date.now()}-${args.index}-${fileHashMd5.slice(0, 8)}`,
  );

  let httpStatus: number | null = null;
  try {
    const response = await fetch(`${args.baseUrl.replace(/\/$/, "")}/api/resume/verify-parse`, {
      body: formData,
      headers: { "X-Api-Key": args.apiKey },
      method: "POST",
      signal: AbortSignal.timeout(120_000),
    });
    httpStatus = response.status;
    const rawBody = await response.text();
    let json: unknown;
    try {
      json = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      throw new Error(`Non-JSON response (${response.status}): ${rawBody.slice(0, 500)}`);
    }
    if (!response.ok) {
      const detail = isRecord(json) ? getString(json, "detail") : null;
      throw new Error(detail ?? `HTTP ${response.status}: ${rawBody.slice(0, 500)}`);
    }

    const { fields, structured } = mapExternalResponse(json);
    const parsed = structuredSchema.safeParse(structured);
    return {
      duplicateCheck: readDuplicateCheck(json),
      error: null,
      fields,
      file: args.file,
      fileHashMd5,
      fileName,
      hashVerified: getBoolean(json, "hashVerified"),
      httpStatus,
      mappedStructured: parsed.success ? parsed.data : structured,
      missingValueFields: summarizeMissing(fields),
      schemaIssues: parsed.success
        ? []
        : parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      schemaValid: parsed.success,
      traceId: getString(json, "traceId"),
    };
  } catch (error) {
    return {
      duplicateCheck: null,
      error: error instanceof Error ? error.message : String(error),
      fields: {},
      file: args.file,
      fileHashMd5,
      fileName,
      hashVerified: null,
      httpStatus,
      mappedStructured: null,
      missingValueFields: [...REQUIRED_VALUE_FIELDS],
      schemaIssues: [],
      schemaValid: false,
      traceId: null,
    };
  }
}

function printSummary(report: EvaluationReport): void {
  console.log(`External resume parser evaluation (${report.generatedAt})`);
  console.log(`Base URL: ${report.baseUrl}`);
  console.log(
    `Summary: ${report.summary.succeeded}/${report.summary.total} succeeded, ${report.summary.schemaValid}/${report.summary.total} schema-valid`,
  );
  console.log("");
  console.log(
    [
      "file",
      "http",
      "schema",
      "name",
      "phone",
      "email",
      "schools",
      "skills",
      "workExp",
      "projectExp",
      "missing",
      "error",
    ].join("\t"),
  );
  for (const result of report.results) {
    const cells = [
      result.fileName,
      result.httpStatus ?? "-",
      result.schemaValid ? "ok" : "fail",
      result.fields.name?.present ? "yes" : "no",
      result.fields.phone?.present ? "yes" : "no",
      result.fields.email?.present ? "yes" : "no",
      result.fields.schools?.present ? "yes" : "no",
      result.fields.skills?.present ? "yes" : "no",
      Array.isArray(result.fields.workExperiences?.value)
        ? String(result.fields.workExperiences.value.length)
        : "0",
      Array.isArray(result.fields.projectExperiences?.value)
        ? String(result.fields.projectExperiences.value.length)
        : "0",
      result.missingValueFields.join(",") || "-",
      result.error ? result.error.replaceAll(/\s+/g, " ").slice(0, 120) : "-",
    ];
    console.log(cells.join("\t"));
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const baseUrl = process.env.RESUME_VERIFY_PARSE_BASE_URL ?? DEFAULT_VERIFY_PARSE_BASE_URL;
  const apiKey = process.env.RESUME_VERIFY_PARSE_API_KEY ?? DEFAULT_VERIFY_PARSE_API_KEY;

  const results: FileReport[] = [];
  for (const [index, file] of options.files.entries()) {
    results.push(await parseOneFile({ apiKey, baseUrl, file, index }));
  }

  const report: EvaluationReport = {
    baseUrl,
    generatedAt: new Date().toISOString(),
    results,
    summary: {
      failed: results.filter((result) => result.error).length,
      schemaValid: results.filter((result) => result.schemaValid).length,
      succeeded: results.filter((result) => !result.error).length,
      total: results.length,
    },
  };

  printSummary(report);
  if (options.out) {
    await mkdir(path.dirname(options.out), { recursive: true });
    await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
    console.log("");
    console.log(`Wrote JSON report: ${options.out}`);
  }
}

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
