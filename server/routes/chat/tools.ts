import type { ParsedResumePdf, UploadedResumePdf } from '@/lib/resume-pdf';
import { tool } from 'ai';
import { z } from 'zod';
import { clipResumeText, extractResumeStructuredInfo } from '@/lib/resume-pdf';

interface PdfToolDependencies {
  availableResumeNames: string[]
  parseUploadedResume: (file: UploadedResumePdf) => Promise<ParsedResumePdf>
  selectResumeFiles: (resumeName?: string) => UploadedResumePdf[]
  uploadedResumePdfs: UploadedResumePdf[]
}

function buildNoResumeResult() {
  return {
    count: 0,
    message: '未找到已上传的 PDF 简历。',
    resumes: [] as unknown[],
  };
}

function buildResumeSelectorMissResult(
  availableResumeNames: string[],
  resumeName?: string,
) {
  return {
    count: 0,
    message: `没有匹配该选择器的简历：${resumeName}`,
    resumes: availableResumeNames,
  };
}

function toPdfParseError(error: unknown, filename: string) {
  return {
    error: error instanceof Error ? error.message : '解析简历 PDF 失败。',
    filename,
  };
}

export const getServerTimeTool = tool({
  description: '获取服务端当前日期与时间。当用户询问当前时间或日期时使用。',
  inputSchema: z.object({
    timezone: z.string().describe('IANA 时区，例如 Asia/Shanghai').optional(),
  }),
  execute: async ({ timezone }) => {
    const resolvedTimeZone = timezone?.trim() || 'Asia/Shanghai';

    try {
      return {
        now: new Intl.DateTimeFormat('zh-CN', {
          dateStyle: 'full',
          timeStyle: 'long',
          timeZone: resolvedTimeZone,
        }).format(new Date()),
        timezone: resolvedTimeZone,
      };
    }
    catch {
      return {
        now: new Intl.DateTimeFormat('zh-CN', {
          dateStyle: 'full',
          timeStyle: 'long',
          timeZone: 'UTC',
        }).format(new Date()),
        timezone: 'UTC',
        warning: '提供的时区无效，已自动回退到 UTC。',
      };
    }
  },
});

export const getResumeReviewFrameworkTool = tool({
  description: '返回一个带权重维度的通用简历筛选框架，可用于实习生和社招岗位。',
  inputSchema: z.object({
    seniority: z.enum(['general', 'intern', 'junior', 'mid', 'senior']).optional(),
    targetRole: z.string().describe('目标岗位，例如前端开发').optional(),
  }),
  execute: async ({ seniority, targetRole }) => {
    const level = seniority ?? 'general';

    return {
      targetRole: targetRole ?? '软件工程岗位',
      seniority: level,
      dimensions: [
        {
          name: '影响力与结果',
          weight: 30,
          checklist: [
            '是否有量化的业务或产品结果',
            '是否清楚说明负责范围与角色',
            '是否使用清晰的行动-结果式表述',
          ],
        },
        {
          name: '技术深度',
          weight: 25,
          checklist: [
            '是否写明具体技术栈细节',
            '是否体现架构设计或权衡思路',
            '是否体现性能、稳定性或扩展性相关工作',
          ],
        },
        {
          name: '岗位相关性',
          weight: 20,
          checklist: [
            '是否匹配目标岗位关键词',
            '项目经历是否与岗位职责相关',
            '内容排序和重点是否支撑岗位匹配度',
          ],
        },
        {
          name: '结构与可读性',
          weight: 15,
          checklist: [
            '项目符号和表述是否简洁',
            '时间线与格式是否一致',
            '层级是否清晰、便于快速扫读',
          ],
        },
        {
          name: '信号可信度',
          weight: 10,
          checklist: [
            '是否避免夸大或失真的表述',
            '是否提供可验证的链接或作品',
            '成果是否具备清晰上下文',
          ],
        },
      ],
    };
  },
});

export function createListUploadedResumePdfsTool({
  availableResumeNames,
  uploadedResumePdfs,
}: Pick<PdfToolDependencies, 'availableResumeNames' | 'uploadedResumePdfs'>) {
  return tool({
    description:
      '辅助工具：列出已上传的 PDF 简历，包含序号和文件名。如果存在多份文件，应主动调用以避免文件名歧义，即使模型原生支持读取 PDF。',
    inputSchema: z.object({}),
    execute: async () => ({
      count: uploadedResumePdfs.length,
      resumes: availableResumeNames,
    }),
  });
}

export function createExtractResumePdfTextTool({
  availableResumeNames,
  parseUploadedResume,
  selectResumeFiles,
  uploadedResumePdfs,
}: PdfToolDependencies) {
  return tool({
    description:
      '辅助工具：提取已上传 PDF 简历的纯文本。如果模型支持原生 PDF 分析，应以原生分析为主；此工具主要用于逐字引用证据、交叉核验、冲突消解和提升置信度。做简历对比时建议主动调用。',
    inputSchema: z.object({
      maxChars: z.number().int().min(2000).max(30000).optional().describe('每份简历最多返回的字符数'),
      resumeName: z.string().optional().describe('简历文件名关键词或从 1 开始的序号'),
    }),
    execute: async ({ maxChars, resumeName }) => {
      if (uploadedResumePdfs.length === 0) {
        return buildNoResumeResult();
      }

      const selected = selectResumeFiles(resumeName);

      if (selected.length === 0) {
        return buildResumeSelectorMissResult(availableResumeNames, resumeName);
      }

      const textLimit = maxChars ?? 12000;
      const resumes = await Promise.all(
        selected.map(async (file) => {
          try {
            const parsed = await parseUploadedResume(file);
            const clipped = clipResumeText(parsed.text, textLimit);

            return {
              excerpt: clipped.text,
              filename: parsed.filename,
              pageCount: parsed.pageCount,
              textChars: parsed.totalTextChars,
              truncated: clipped.truncated,
            };
          }
          catch (error) {
            return toPdfParseError(error, file.filename);
          }
        }),
      );

      return {
        count: resumes.length,
        resumes,
      };
    },
  });
}

export function createExtractResumePdfStructuredInfoTool({
  availableResumeNames,
  parseUploadedResume,
  selectResumeFiles,
  uploadedResumePdfs,
}: PdfToolDependencies) {
  return tool({
    description:
      '辅助工具：提取已上传 PDF 简历中的结构化候选人信息，包括联系方式、教育背景、技能、亮点以及时间线摘要。如果模型具备原生 PDF 理解能力，仍应以原生分析为主；但建议主动调用此工具，以生成更一致的结构化字段，用于评分、时间线核验和并排比较。',
    inputSchema: z.object({
      resumeName: z.string().optional().describe('简历文件名关键词或从 1 开始的序号'),
    }),
    execute: async ({ resumeName }) => {
      if (uploadedResumePdfs.length === 0) {
        return buildNoResumeResult();
      }

      const selected = selectResumeFiles(resumeName);

      if (selected.length === 0) {
        return buildResumeSelectorMissResult(availableResumeNames, resumeName);
      }

      const resumes = await Promise.all(
        selected.map(async (file) => {
          try {
            const parsed = await parseUploadedResume(file);

            return {
              filename: parsed.filename,
              pageCount: parsed.pageCount,
              structured: extractResumeStructuredInfo(parsed.text),
            };
          }
          catch (error) {
            return toPdfParseError(error, file.filename);
          }
        }),
      );

      return {
        count: resumes.length,
        resumes,
      };
    },
  });
}
