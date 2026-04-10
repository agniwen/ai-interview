import type { ModelMessage, UIMessage } from 'ai';
import type { ParsedResumePdf, UploadedResumePdf } from '@/lib/resume-pdf';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { clipResumeText, extractResumeStructuredInfo, readPdfBytes } from '@/lib/resume-pdf';

// =====================================================================
// Title sanitization
// =====================================================================

const TITLE_QUOTES_REGEX = /["'`]/g;
const TITLE_LINE_BREAKS_REGEX = /[\r\n]+/g;
const TITLE_WHITESPACE_REGEX = /\s+/g;

export function sanitizeTitle(title: string): string {
  return title
    .replace(TITLE_QUOTES_REGEX, '')
    .replace(TITLE_LINE_BREAKS_REGEX, ' ')
    .replace(TITLE_WHITESPACE_REGEX, ' ')
    .trim()
    .slice(0, 28);
}

// =====================================================================
// Message/role inference helpers (agent chat)
// =====================================================================

export function stripNonImageFileParts(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((message) => {
    if (message.role !== 'user' || typeof message.content === 'string') {
      return message;
    }

    const filtered = message.content.filter(
      part => part.type !== 'file' || part.mediaType.startsWith('image/'),
    );

    return { ...message, content: filtered };
  });
}

const NORMALIZE_WHITESPACE_REGEX = /\s+/g;
const ROLE_KEYWORD_MAP: Array<{ keyword: RegExp, role: string }> = [
  { keyword: /行政/, role: '行政' },
  { keyword: /人事|HR/, role: '人力资源' },
  { keyword: /运营/, role: '运营' },
  { keyword: /产品/, role: '产品' },
  { keyword: /前端/, role: '前端开发' },
  { keyword: /后端|服务端|后台/, role: '后端开发' },
  { keyword: /测试|QA/, role: '测试' },
  { keyword: /数据分析|数据/, role: '数据分析' },
  { keyword: /设计|UI|UX/, role: '设计' },
  { keyword: /财务/, role: '财务' },
];
const ROLE_INFER_PATTERNS = [
  /(?:我需要招聘|我们需要招聘|需要招聘|招聘)\s*([^，。；\n]{1,24})/,
  /(?:我需要|我们需要|需要)\s*([^，。；\n]{1,24})(?:岗位|职位|方向|人员)?/,
];
const ROLE_STRIP_TERMS_REGEX = /(一名|一位|一个|若干|岗位|职位|方向|人员|的)/g;

export const SERVER_TIME_ZONE = 'Asia/Shanghai';

export function extractUserText(messages: UIMessage[]): string {
  return messages
    .filter(message => message.role === 'user')
    .flatMap(message => message.parts)
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('\n')
    .trim();
}

export function inferRoleFromText(text: string): string | null {
  const normalized = text.replace(NORMALIZE_WHITESPACE_REGEX, ' ').trim();

  if (!normalized) {
    return null;
  }

  for (const item of ROLE_KEYWORD_MAP) {
    if (item.keyword.test(normalized)) {
      return item.role;
    }
  }

  for (const pattern of ROLE_INFER_PATTERNS) {
    const match = normalized.match(pattern);

    if (!match?.[1]) {
      continue;
    }

    const role = match[1]
      .replace(ROLE_STRIP_TERMS_REGEX, '')
      .trim();

    if (role.length > 0) {
      return role;
    }
  }

  return null;
}

// =====================================================================
// Auto job description presets
// =====================================================================

interface JobDescriptionContext {
  hiringType: 'general' | 'internship' | 'full-time'
  role: string
}

const ROLE_INTERN_KEYWORD_REGEX = /\b(?:internship|intern)\b|实习/i;
const ROLE_INTERN_NORMALIZE_REGEX = /\b(?:internship|intern)\b/gi;
const ROLE_FULL_TIME_KEYWORD_REGEX = /\bfull[- ]?time\b|社招|全职|正式/i;
const ROLE_FULL_TIME_NORMALIZE_REGEX = /\bfull[- ]?time\b/gi;
const ROLE_WHITESPACE_REGEX = /\s+/g;

const internshipExtraRequirements = [
  '具备扎实的基础能力和快速学习能力，能在指导下高质量完成任务',
  '每周可到岗 4 天及以上，连续实习 3 个月及以上优先',
];

const fullTimeExtraRequirements = [
  '具备独立推进模块或项目的能力，对交付结果负责',
  '具备较强的跨团队协作意识和 owner 意识，能适应业务节奏变化',
];

const internshipExtraBonuses = [
  '有高质量项目、竞赛、校园实践、开源贡献或相关实习经历',
  '能尽快到岗、实习周期稳定，有明确的岗位发展意愿',
];

const fullTimeExtraBonuses = [
  '有从 0 到 1 或复杂业务迭代经验，能够沉淀方法论',
  '有跨团队协同、效率优化或业务结果导向的实践经验',
];

function mergeSectionItems(baseItems: string[], extraItems: string[]) {
  return [...baseItems, ...extraItems].slice(0, 5);
}

function formatSection(title: string, items: string[]) {
  return `${title}:\n${items.map(item => `- ${item}`).join('\n')}`;
}

function buildPresetJobDescription(
  context: JobDescriptionContext,
  goal: string,
  responsibilities: string[],
  requirements: string[],
  bonuses: string[],
) {
  let extraRequirements: string[] = [];
  let extraBonuses: string[] = [];

  if (context.hiringType === 'internship') {
    extraRequirements = internshipExtraRequirements;
    extraBonuses = internshipExtraBonuses;
  }
  else if (context.hiringType === 'full-time') {
    extraRequirements = fullTimeExtraRequirements;
    extraBonuses = fullTimeExtraBonuses;
  }

  return [
    `岗位名称: ${context.role}`,
    `岗位目标: ${goal}`,
    formatSection('核心职责', responsibilities),
    formatSection('能力要求', mergeSectionItems(requirements, extraRequirements)),
    formatSection('加分项', mergeSectionItems(bonuses, extraBonuses)),
  ].join('\n');
}

const JOB_DESCRIPTION_PRESETS: Array<{ keywords: RegExp, jd: (context: JobDescriptionContext) => string }> = [
  {
    keywords: /行政/,
    jd: context => buildPresetJobDescription(
      context,
      '保障部门日常行政与协同流程高效运转',
      [
        '协助会议安排、来访接待、办公用品及固定资产管理',
        '处理文档归档、数据录入、报销单据和流程跟进',
        '配合跨部门沟通与活动执行支持',
      ],
      [
        '熟练使用办公软件（Word/Excel/PPT）',
        '做事细致、执行力强、时间管理良好',
        '具备基础沟通协调能力与服务意识',
      ],
      [
        '有行政助理、学生组织事务或活动统筹经验',
        '熟悉流程管理、采购协同或费用报销场景',
      ],
    ),
  },
  {
    keywords: /前端/,
    jd: context => buildPresetJobDescription(
      context,
      '负责 Web 前端页面与交互能力建设，持续提升产品体验、性能与工程效率',
      [
        '参与业务页面、组件库和中后台系统开发，完成需求交付与上线',
        '与产品、设计、后端协作，推动交互方案落地并持续优化体验',
        '关注性能优化、兼容性、可维护性和前端工程化建设',
      ],
      [
        '熟悉 HTML/CSS/JavaScript/TypeScript，理解浏览器渲染机制',
        '熟悉 React、Vue 或同类框架，具备组件化开发经验',
        '具备接口联调、问题排查和基础前端工程化能力',
      ],
      [
        '有复杂项目、可视化、中后台或低代码相关经验',
        '了解性能优化、埋点监控、SSR 或跨端技术方案',
      ],
    ),
  },
  {
    keywords: /后端|服务端|后台/,
    jd: context => buildPresetJobDescription(
      context,
      '负责后端服务与业务系统建设，保障接口质量、稳定性与可扩展性',
      [
        '参与业务接口、服务模块、数据模型和基础中台能力开发',
        '与前端、产品、测试协作推进需求，保障按时上线与稳定运行',
        '持续优化系统性能、可靠性、日志监控和异常排查效率',
      ],
      [
        '熟悉 Java、Go、Python、Node.js 等至少一门后端语言',
        '理解 HTTP、数据库、缓存、消息队列等基础后端知识',
        '具备接口设计、数据建模和问题定位能力',
      ],
      [
        '有高并发、分布式、推荐搜索、风控或平台型项目经验',
        '熟悉云原生、监控告警、容器化或微服务治理',
      ],
    ),
  },
  {
    keywords: /全栈/,
    jd: context => buildPresetJobDescription(
      context,
      '负责从前端到后端的业务交付，提升团队整体研发效率与产品落地速度',
      [
        '独立或协作完成页面开发、接口开发、数据联调和上线支持',
        '参与需求评审、技术方案设计和关键模块实现',
        '持续优化系统性能、代码质量和协作流程',
      ],
      [
        '同时具备前端框架开发能力和后端服务开发能力',
        '熟悉数据库设计、接口联调、权限管理和部署流程',
        '具备较强的问题拆解与跨端协同能力',
      ],
      [
        '有完整产品从 0 到 1 或独立负责模块的经验',
        '熟悉云部署、自动化测试、CI/CD 或工程平台建设',
      ],
    ),
  },
  {
    keywords: /产品/,
    jd: context => buildPresetJobDescription(
      context,
      '通过用户洞察、需求分析和跨团队协作推动产品持续增长',
      [
        '参与需求调研、竞品分析、方案设计和 PRD 撰写',
        '协调设计、研发、运营推进项目，跟踪上线效果并持续优化',
        '关注用户反馈、数据表现和业务目标，支持迭代决策',
      ],
      [
        '具备良好的逻辑思维、结构化表达和文档输出能力',
        '熟悉互联网产品迭代流程，理解用户体验与业务目标平衡',
        '能够进行基础数据分析并提出可执行优化建议',
      ],
      [
        '有中后台、增长、内容、电商或 AI 产品经验',
        '熟悉 Axure、Figma、SQL 或埋点分析工具',
      ],
    ),
  },
  {
    keywords: /运营|增长|用户运营|内容运营/,
    jd: context => buildPresetJobDescription(
      context,
      '通过内容、活动和用户策略提升产品增长、活跃和留存表现',
      [
        '参与用户分层、活动策划、内容运营和数据复盘',
        '与产品、设计、研发协作，推动运营策略落地',
        '持续跟踪关键指标，提出增长或转化优化方案',
      ],
      [
        '具备良好的内容表达、项目推进和跨团队沟通能力',
        '具备基础数据分析能力，能理解转化、留存、活跃等核心指标',
        '对互联网用户行为和常见增长玩法有基本认知',
      ],
      [
        '有社区、短视频、电商、SaaS 或品牌增长相关经验',
        '熟悉 SQL、A/B 实验、埋点分析或自动化运营工具',
      ],
    ),
  },
  {
    keywords: /数据分析|商业分析|数据/,
    jd: context => buildPresetJobDescription(
      context,
      '通过数据分析支持业务决策，建立指标体系并发现增长与效率机会',
      [
        '参与业务数据提取、指标监控、专题分析和报告输出',
        '与产品、运营、研发协作，推动分析结论落地到业务动作',
        '建立和维护核心指标口径，识别异常并跟踪变化原因',
      ],
      [
        '熟悉 SQL、Excel，具备基础统计分析与数据可视化能力',
        '能从业务问题出发拆解分析路径并清晰表达结论',
        '对互联网增长、留存、转化、漏斗等分析框架有基础理解',
      ],
      [
        '熟悉 Python、Tableau、Power BI、Looker 或埋点体系建设',
        '有推荐、电商、广告、内容平台相关分析经验',
      ],
    ),
  },
  {
    keywords: /算法|机器学习|推荐|搜索|NLP|大模型|AI/,
    jd: context => buildPresetJobDescription(
      context,
      '通过算法与机器学习能力提升推荐、搜索、智能交互或业务自动化效果',
      [
        '参与算法建模、特征工程、实验评估和线上效果优化',
        '与产品、数据、工程团队协作推动算法方案落地',
        '跟踪模型效果、数据质量和线上表现，持续迭代优化',
      ],
      [
        '熟悉 Python，掌握常见机器学习或深度学习基础知识',
        '理解模型训练、评估指标、数据处理和实验设计方法',
        '具备阅读论文、复现方案或调优模型的基础能力',
      ],
      [
        '有推荐系统、搜索排序、NLP、CV、LLM 应用或 Agent 相关经验',
        '熟悉 PyTorch、TensorFlow、向量检索、模型服务部署或推理优化',
      ],
    ),
  },
  {
    keywords: /测试|QA|质量/,
    jd: context => buildPresetJobDescription(
      context,
      '保障产品高质量交付，提升测试效率、稳定性和发布信心',
      [
        '参与需求评审、测试用例设计、功能验证和缺陷跟踪',
        '推动自动化测试、接口测试和回归测试体系建设',
        '与研发、产品协作定位问题，推动质量风险提前暴露',
      ],
      [
        '具备扎实的软件测试基础，理解功能、接口、性能等测试方法',
        '熟悉常见调试工具和缺陷管理流程',
        '具备较强的问题定位、风险识别和沟通推进能力',
      ],
      [
        '有自动化测试框架、持续集成、压测或质量平台经验',
        '熟悉 Java、Python、JavaScript 中至少一门语言',
      ],
    ),
  },
  {
    keywords: /设计|UI|UX|交互/,
    jd: context => buildPresetJobDescription(
      context,
      '通过高质量视觉与交互设计提升产品体验和品牌一致性',
      [
        '参与需求理解、信息架构设计、界面视觉设计和交互方案输出',
        '与产品、研发协作推动设计方案落地并跟进效果',
        '建立或维护设计规范、组件体系和体验一致性',
      ],
      [
        '熟悉 Figma、Sketch、Photoshop、Illustrator 等设计工具',
        '具备良好的视觉表达、交互思维和用户体验意识',
        '能清晰说明设计逻辑并与业务目标结合',
      ],
      [
        '有中后台、移动端、品牌视觉、设计系统或动效设计经验',
        '具备可用性测试、数据驱动设计或基础前端实现能力',
      ],
    ),
  },
  {
    keywords: /人事|HR|招聘/,
    jd: context => buildPresetJobDescription(
      context,
      '支持招聘、组织与人才运营工作，提升人才获取和组织协同效率',
      [
        '参与招聘流程执行、候选人沟通、面试安排和人才库维护',
        '协助员工关系、培训、组织活动和基础人事运营工作',
        '配合业务团队理解岗位需求并支持招聘交付',
      ],
      [
        '具备良好的沟通协调、执行推进和信息整理能力',
        '做事细致，能够同时处理多线程事务',
        '对招聘流程、候选人体验和组织支持有基本理解',
      ],
      [
        '有校园招聘、猎头协作、雇主品牌或培训运营经验',
        '熟悉招聘系统、表格分析或基础数据报表能力',
      ],
    ),
  },
  {
    keywords: /市场|品牌|营销/,
    jd: context => buildPresetJobDescription(
      context,
      '通过市场与品牌策略提升产品认知、线索获取和业务增长',
      [
        '参与品牌传播、内容营销、渠道投放和活动策划执行',
        '跟踪投放与转化数据，优化营销策略和资源配置效率',
        '与产品、销售、设计协作推进市场项目落地',
      ],
      [
        '具备内容策划、项目执行和对外沟通能力',
        '对品牌传播、用户增长和渠道转化有基础理解',
        '具备基础数据复盘与方案优化能力',
      ],
      [
        '有 B2B、消费互联网、出海、新媒体或效果投放经验',
        '熟悉主流广告平台、CRM 或营销自动化工具',
      ],
    ),
  },
];

function normalizeRoleLabel(role: string): string {
  return role
    .replace(ROLE_INTERN_NORMALIZE_REGEX, '实习')
    .replace(ROLE_FULL_TIME_NORMALIZE_REGEX, '全职')
    .replace(ROLE_WHITESPACE_REGEX, ' ')
    .trim();
}

function inferHiringType(role: string): JobDescriptionContext['hiringType'] {
  if (ROLE_INTERN_KEYWORD_REGEX.test(role)) {
    return 'internship';
  }

  if (ROLE_FULL_TIME_KEYWORD_REGEX.test(role)) {
    return 'full-time';
  }

  return 'general';
}

export function buildAutoJobDescription(role: string): string {
  const normalizedRole = normalizeRoleLabel(role);
  const context: JobDescriptionContext = {
    hiringType: inferHiringType(normalizedRole),
    role: normalizedRole,
  };

  for (const preset of JOB_DESCRIPTION_PRESETS) {
    if (preset.keywords.test(normalizedRole)) {
      return preset.jd(context);
    }
  }

  return buildPresetJobDescription(
    context,
    '支持团队完成岗位相关业务目标，持续提升执行质量、协作效率与结果产出',
    [
      '参与岗位相关的日常工作、项目协作与需求推进',
      '与上下游团队保持高效沟通，确保任务按计划落地',
      '输出阶段性成果、复盘总结或过程文档，并根据反馈持续优化',
    ],
    [
      '具备岗位相关的基础知识、学习能力和责任心',
      '沟通清晰、执行稳定，能够在反馈中持续改进',
      '具备基础的数据分析、信息整理或项目推进能力',
    ],
    [
      '有相关项目、实习、校园实践或作品经历',
      '能适应互联网团队较快节奏，有较强自驱力与协作意识',
    ],
  );
}

// =====================================================================
// Chat agent tools (uploaded PDF operations)
// =====================================================================

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

export function createAnalyzeResumePdfWithVisionTool({
  availableResumeNames,
  selectResumeFiles,
  uploadedResumePdfs,
}: Pick<PdfToolDependencies, 'availableResumeNames' | 'selectResumeFiles' | 'uploadedResumePdfs'>) {
  return tool({
    description:
      '视觉分析工具：当 extract_resume_pdf_text 返回的文本质量差（乱码、空白、内容过少）或 PDF 简历内容主要为图片时，调用此工具使用视觉模型直接分析 PDF 内容。返回视觉模型提取的简历文本。',
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

      const apiKey = process.env.AI_GATEWAY_API_KEY;

      if (!apiKey) {
        return {
          count: 0,
          error: '未配置 AI_GATEWAY_API_KEY，无法使用视觉分析。',
          resumes: [],
        };
      }

      const modelId = process.env.GOOGLE_VISION_MODEL ?? 'google/gemini-2.5-flash';

      const resumes = await Promise.all(
        selected.map(async (file) => {
          try {
            const pdfBytes = await readPdfBytes(file.url);
            const base64Data = Buffer.from(pdfBytes).toString('base64');

            const { text } = await generateText({
              model: modelId,
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'file',
                      data: base64Data,
                      mediaType: 'application/pdf',
                    },
                    {
                      type: 'text',
                      text: '请完整提取这份 PDF 简历中的所有文字内容，包括图片中的文字。保持原始结构和排版顺序，不要遗漏任何信息。如果存在表格，用文字形式还原。只输出提取的内容，不要添加任何分析或评论。',
                    },
                  ],
                },
              ],
            });

            return {
              excerpt: text,
              filename: file.filename,
              source: 'gemini-vision',
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
