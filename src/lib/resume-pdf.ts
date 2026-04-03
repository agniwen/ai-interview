import type { UIMessage } from 'ai';
import { decodeDataUrl } from '@/lib/data-url';

export interface UploadedResumePdf {
  id: string
  filename: string
  mediaType: string
  url: string
}

export interface ParsedResumePdf {
  filename: string
  id: string
  pageCount: number
  text: string
  totalTextChars: number
}

export interface ResumeStructuredInfo {
  candidateName: string | null
  degree: string | null
  education: string | null
  email: string | null
  graduationYear: string | null
  internshipHighlights: string[]
  links: string[]
  major: string | null
  phone: string | null
  projectHighlights: string[]
  school: string | null
  skills: string[]
  timelineSummary: ResumeTimelineSummary
}

export interface ResumeTimelineSummary {
  currentStatus: string | null
  dateRanges: string[]
  estimatedExperienceYears: number | null
  riskSignals: string[]
}

let workerConfigured = false;
let pdfParseModulePromise: Promise<typeof import('pdf-parse')> | null = null;
let pdfParseWorkerModulePromise: Promise<typeof import('pdf-parse/worker')> | null
  = null;

const NULL_BYTE_REGEX = /\0/g;
const WINDOWS_LINE_BREAK_REGEX = /\r\n/g;
const CARRIAGE_RETURN_REGEX = /\r/g;
const EXCESSIVE_NEWLINES_REGEX = /\n{3,}/g;
const SECTION_BREAK_HEADING_REGEX = /教育|技能|项目|实习|经历|工作|荣誉|证书|自我评价|objective|education|skills|projects|experience/i;
const CJK_NAME_REGEX = /^[\u4E00-\u9FA5]{2,4}$/;
const LATIN_NAME_REGEX = /^[A-Z]+(?:\s+[A-Z]+){1,2}$/i;
const EMAIL_REGEX = /([\w.%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i;
const MOBILE_PHONE_REGEX = /((?:\+?86[-\s]?)?1[3-9]\d{9})/;
const GENERIC_PHONE_REGEX = /(\+?\d[\d\s-]{7,}\d)/;
const SCHOOL_LINE_REGEX = /大学|学院|University|College|School/i;
const EDUCATION_LINE_REGEX = /本科|硕士|博士|大专|Bachelor|Master|PhD|BSc|MSc/i;
const DEGREE_REGEX = /(本科|硕士|博士|大专|Bachelor(?:'s)?|Master(?:'s)?|PhD|BSc|MSc)/i;
const MAJOR_CAPTURE_REGEX = /(?:专业|Major)[:：]?\s*([^\n，,;；]{2,40})/i;
const MAJOR_LINE_REGEX = /计算机|软件工程|信息管理|电子|数学|统计|金融|会计/;
const GRADUATION_YEAR_REGEX = /(20\d{2})\s*年?\s*(?:毕业|graduate)/i;
const GRADUATION_COHORT_REGEX = /(20\d{2})\s*(?:届|级)/;
const SKILL_SECTION_HEADING_REGEX = /技能|技术栈|能力标签|skills?/i;
const SKILL_SPLIT_REGEX = /[、,，;；/|·]/;
const PROJECT_SECTION_HEADING_REGEX = /项目|projects?/i;
const INTERNSHIP_SECTION_HEADING_REGEX = /实习|工作经历|experience|intern/i;
const URL_REGEX = /(https?:\/\/[^\s)]+)/g;
const DATE_RANGE_REGEX = /(20\d{2}(?:[./-]\d{1,2}|年\d{1,2}月?)?)\s*[至到\-~—–－]\s*(至今|现在|目前|present|current|20\d{2}(?:[./-]\d{1,2}|年\d{1,2}月?)?)/gi;
const DATE_TOKEN_REGEX = /(20\d{2})(?:[./-](\d{1,2})|年(\d{1,2})月?)?/;
const PRESENT_TOKEN_REGEX = /^(?:至今|现在|目前|present|current)$/i;
const PROJECT_OR_WORK_SECTION_HEADING_REGEX = /工作经历|实习经历|职业经历|项目经历|experience|intern|project/i;
const WORK_CONTEXT_REGEX = /公司|任职|岗位|负责|实习|工作|项目|研发|产品|运营/;
const CURRENT_STATUS_MARKER_REGEX = /至今|现在|目前|present|current/i;
const MAX_TIMELINE_RANGES = 12;

async function ensureDomPolyfills() {
  const globalWithPdfPolyfills = globalThis as Record<string, unknown>;

  if (
    globalWithPdfPolyfills.DOMMatrix
    && globalWithPdfPolyfills.ImageData
    && globalWithPdfPolyfills.Path2D
  ) {
    return;
  }

  const canvas = await import('@napi-rs/canvas').catch(() => null);

  if (!canvas) {
    return;
  }

  if (!globalWithPdfPolyfills.DOMMatrix && canvas.DOMMatrix) {
    globalWithPdfPolyfills.DOMMatrix = canvas.DOMMatrix;
  }

  if (!globalWithPdfPolyfills.ImageData && canvas.ImageData) {
    globalWithPdfPolyfills.ImageData = canvas.ImageData;
  }

  if (!globalWithPdfPolyfills.Path2D && canvas.Path2D) {
    globalWithPdfPolyfills.Path2D = canvas.Path2D;
  }
}

async function loadPdfParseWorkerModule(): Promise<
  typeof import('pdf-parse/worker')
> {
  if (!pdfParseWorkerModulePromise) {
    pdfParseWorkerModulePromise = import('pdf-parse/worker');
  }

  return pdfParseWorkerModulePromise;
}

async function loadPdfParseModule(): Promise<typeof import('pdf-parse')> {
  if (!pdfParseModulePromise) {
    pdfParseModulePromise = (async () => {
      await ensureDomPolyfills();
      await loadPdfParseWorkerModule();
      return import('pdf-parse');
    })();
  }

  return pdfParseModulePromise;
}

async function ensurePdfWorker(PDFParse: (typeof import('pdf-parse'))['PDFParse']) {
  if (workerConfigured) {
    return;
  }

  const { getData } = await loadPdfParseWorkerModule();
  PDFParse.setWorker(getData());
  workerConfigured = true;
}

function normalizeText(text: string): string {
  return text
    .replace(NULL_BYTE_REGEX, '')
    .replace(WINDOWS_LINE_BREAK_REGEX, '\n')
    .replace(CARRIAGE_RETURN_REGEX, '\n')
    .replace(EXCESSIVE_NEWLINES_REGEX, '\n\n')
    .trim();
}

const toDefaultFilename = (index: number): string => `resume-${index + 1}.pdf`;

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of items) {
    const normalized = item.trim();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function firstRegexMatch(text: string, pattern: RegExp, group = 1): string | null {
  const match = text.match(pattern);
  const value = match?.[group]?.trim();
  return value && value.length > 0 ? value : null;
}

function parseDateToken(token: string, now: Date) {
  const normalized = token.trim();

  if (PRESENT_TOKEN_REGEX.test(normalized)) {
    return {
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    };
  }

  const match = normalized.match(DATE_TOKEN_REGEX);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthToken = match[2] ?? match[3];
  const month = monthToken ? Number(monthToken) : 1;

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return { month, year };
}

function toMonthIndex(date: { year: number, month: number }) {
  return date.year * 12 + (date.month - 1);
}

function extractTimelineSummary(resumeText: string): ResumeTimelineSummary {
  const lines = resumeText
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const now = new Date();
  const dateRanges: string[] = [];
  const parsedRanges: Array<{
    end: number
    isWorkLike: boolean
    raw: string
    start: number
  }> = [];

  lines.forEach((line) => {
    const matches = [...line.matchAll(DATE_RANGE_REGEX)];

    if (matches.length === 0) {
      return;
    }

    const isWorkLike = PROJECT_OR_WORK_SECTION_HEADING_REGEX.test(line)
      || WORK_CONTEXT_REGEX.test(line);

    matches.forEach((match) => {
      if (dateRanges.length >= MAX_TIMELINE_RANGES) {
        return;
      }

      const startToken = match[1]?.trim();
      const endToken = match[2]?.trim();
      const raw = match[0]?.trim();

      if (!startToken || !endToken || !raw || dateRanges.includes(raw)) {
        return;
      }

      dateRanges.push(raw);

      const start = parseDateToken(startToken, now);
      const end = parseDateToken(endToken, now);

      if (!start || !end) {
        return;
      }

      parsedRanges.push({
        end: toMonthIndex(end),
        isWorkLike,
        raw,
        start: toMonthIndex(start),
      });
    });
  });

  const sortedRanges = parsedRanges
    .filter(range => range.isWorkLike)
    .sort((a, b) => a.start - b.start);
  const riskSignals: string[] = [];

  sortedRanges.forEach((range) => {
    if (range.end < range.start) {
      riskSignals.push(`时间区间可能有误：${range.raw}`);
    }
  });

  for (let i = 1; i < sortedRanges.length; i += 1) {
    const previous = sortedRanges[i - 1];
    const current = sortedRanges[i];

    if (!previous || !current) {
      continue;
    }

    const gapMonths = current.start - previous.end - 1;
    const overlapMonths = previous.end - current.start + 1;

    if (gapMonths >= 6) {
      riskSignals.push(`存在约 ${gapMonths} 个月的时间空档：${previous.raw} -> ${current.raw}`);
    }

    if (overlapMonths >= 2) {
      riskSignals.push(`时间线存在重叠，需核实是否为兼职/并行项目：${previous.raw} 与 ${current.raw}`);
    }
  }

  const shortStints = sortedRanges.filter(range => range.end >= range.start && (range.end - range.start + 1) <= 8);

  if (shortStints.length >= 2) {
    riskSignals.push(`检测到 ${shortStints.length} 段较短经历（8 个月内），需关注稳定性`);
  }

  const futureRanges = sortedRanges.filter(range => range.start > toMonthIndex({ month: now.getMonth() + 1, year: now.getFullYear() }) + 1);

  if (futureRanges.length > 0) {
    riskSignals.push('检测到未来时间段，需核实简历时间填写是否准确');
  }

  const mergedRanges: Array<{ end: number, start: number }> = [];

  sortedRanges
    .filter(range => range.end >= range.start)
    .forEach((range) => {
      const last = mergedRanges.at(-1);

      if (!last || range.start > last.end + 1) {
        mergedRanges.push({ end: range.end, start: range.start });
        return;
      }

      last.end = Math.max(last.end, range.end);
    });

  const totalMonths = mergedRanges.reduce((sum, range) => sum + (range.end - range.start + 1), 0);
  const estimatedExperienceYears = totalMonths > 0
    ? Number((totalMonths / 12).toFixed(1))
    : null;
  const latestRange = sortedRanges.at(-1);
  const currentStatus = latestRange?.raw && CURRENT_STATUS_MARKER_REGEX.test(latestRange.raw)
    ? '最近一段经历显示候选人可能仍在职'
    : sortedRanges.length > 0
      ? '最近一段经历未明确显示为在职状态'
      : null;

  return {
    currentStatus,
    dateRanges,
    estimatedExperienceYears,
    riskSignals: uniqueStrings(riskSignals).slice(0, 6),
  };
}

async function readPdfBytes(url: string): Promise<Uint8Array> {
  if (url.startsWith('data:')) {
    return decodeDataUrl(url).data;
  }

  if (url.startsWith('https://') || url.startsWith('http://')) {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.status}`);
    }

    const bytes = await response.arrayBuffer();
    return new Uint8Array(bytes);
  }

  throw new Error('Unsupported PDF url format.');
}

function clip(text: string, maxChars: number): { text: string, truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }

  return {
    text: `${text.slice(0, maxChars)}\n\n[...content truncated...]`,
    truncated: true,
  };
}

function extractSectionLines(lines: string[], headingPattern: RegExp): string[] {
  const startIndex = lines.findIndex(line => headingPattern.test(line));

  if (startIndex < 0) {
    return [];
  }

  const section: string[] = [];

  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i]?.trim() ?? '';

    if (!line) {
      if (section.length > 0) {
        break;
      }
      continue;
    }

    if (
      section.length > 1
      && SECTION_BREAK_HEADING_REGEX.test(line)
      && line.length <= 20
    ) {
      break;
    }

    section.push(line);

    if (section.length >= 14) {
      break;
    }
  }

  return section;
}

export function collectUploadedResumePdfs(messages: UIMessage[]): UploadedResumePdf[] {
  const results: UploadedResumePdf[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    if (message.role !== 'user') {
      continue;
    }

    message.parts.forEach((part, index) => {
      if (part.type !== 'file' || part.mediaType !== 'application/pdf') {
        return;
      }

      const filename = part.filename?.trim() || toDefaultFilename(results.length);
      const dedupeKey = `${filename}|${part.url}`;

      if (seen.has(dedupeKey)) {
        return;
      }

      seen.add(dedupeKey);
      results.push({
        filename,
        id: `${message.id}-file-${index}`,
        mediaType: part.mediaType,
        url: part.url,
      });
    });
  }

  return results;
}

export function selectUploadedResumePdfs(files: UploadedResumePdf[], resumeName?: string): UploadedResumePdf[] {
  const selector = resumeName?.trim();

  if (!selector) {
    return files;
  }

  const index = Number(selector);

  if (Number.isInteger(index) && index >= 1 && index <= files.length) {
    return [files[index - 1]];
  }

  const lowerSelector = selector.toLowerCase();
  return files.filter(file => file.filename.toLowerCase().includes(lowerSelector));
}

export async function parseResumePdf(file: UploadedResumePdf): Promise<ParsedResumePdf> {
  const { PDFParse } = await loadPdfParseModule();
  await ensurePdfWorker(PDFParse);

  const pdfBytes = await readPdfBytes(file.url);
  const parser = new PDFParse({ data: pdfBytes });

  try {
    const textResult = await parser.getText();
    const normalized = normalizeText(textResult.text ?? '');
    const pageCount
      = typeof textResult.total === 'number' && textResult.total > 0
        ? textResult.total
        : textResult.pages.length;

    return {
      filename: file.filename,
      id: file.id,
      pageCount,
      text: normalized,
      totalTextChars: normalized.length,
    };
  }
  finally {
    await parser.destroy().catch(() => undefined);
  }
}

export function extractResumeStructuredInfo(resumeText: string): ResumeStructuredInfo {
  const lines = resumeText
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const topLines = lines.slice(0, 8);
  const candidateName
    = topLines.find(line => CJK_NAME_REGEX.test(line))
      ?? topLines.find(line => LATIN_NAME_REGEX.test(line))
      ?? null;

  const email = firstRegexMatch(
    resumeText,
    EMAIL_REGEX,
  );
  const phone
    = firstRegexMatch(resumeText, MOBILE_PHONE_REGEX)
      ?? firstRegexMatch(resumeText, GENERIC_PHONE_REGEX);
  const school
    = lines.find(line => SCHOOL_LINE_REGEX.test(line))
      ?? null;
  const education
    = lines.find(line => EDUCATION_LINE_REGEX.test(line))
      ?? null;
  const degree
    = firstRegexMatch(
      resumeText,
      DEGREE_REGEX,
      1,
    ) ?? null;
  const major
    = firstRegexMatch(resumeText, MAJOR_CAPTURE_REGEX)
      ?? lines.find(line => MAJOR_LINE_REGEX.test(line))
      ?? null;
  const graduationYear
    = firstRegexMatch(resumeText, GRADUATION_YEAR_REGEX)
      ?? firstRegexMatch(resumeText, GRADUATION_COHORT_REGEX);

  const skillSection = extractSectionLines(
    lines,
    SKILL_SECTION_HEADING_REGEX,
  );
  const skills = uniqueStrings(
    skillSection
      .join(' ')
      .split(SKILL_SPLIT_REGEX)
      .map(skill => skill.trim())
      .filter(skill => skill.length >= 2 && skill.length <= 30)
      .slice(0, 18),
  );

  const projectSection = extractSectionLines(lines, PROJECT_SECTION_HEADING_REGEX);
  const internshipSection = extractSectionLines(
    lines,
    INTERNSHIP_SECTION_HEADING_REGEX,
  );

  const projectHighlights = uniqueStrings(projectSection).slice(0, 6);
  const internshipHighlights = uniqueStrings(internshipSection).slice(0, 6);
  const links = uniqueStrings(
    Array.from(resumeText.matchAll(URL_REGEX), match => match[1] ?? ''),
  ).slice(0, 6);
  const timelineSummary = extractTimelineSummary(resumeText);

  return {
    candidateName,
    degree,
    education,
    email,
    graduationYear,
    internshipHighlights,
    links,
    major,
    phone,
    projectHighlights,
    school,
    skills,
    timelineSummary,
  };
}

export function clipResumeText(text: string, maxChars = 12000) {
  return clip(text, maxChars);
}
