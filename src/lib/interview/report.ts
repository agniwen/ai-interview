import type {
  ResumeParserResult,
  ResumeParserStructured,
} from "@/server/agents/resume-parser-agent";

// =====================================================================
// 把简历解析结果渲染成中文 Markdown 报告。
// Renders the resume parser result into a human-readable Chinese Markdown report.
// 纯函数，无副作用，可在前端 / skill API / 后续工作流复用。
// Pure function with no side effects — reusable across web UI, skill API, and downstream workflows.
// =====================================================================

const PLACEHOLDER = "未提供";

function safe(value: string | null | undefined): string {
  if (!value) {
    return PLACEHOLDER;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : PLACEHOLDER;
}

function bullet(label: string, value: string | null | undefined): string {
  return `- **${label}**：${safe(value)}`;
}

function renderList(items: readonly string[]): string {
  if (items.length === 0) {
    return `_${PLACEHOLDER}_`;
  }
  return items.map((item) => `- ${item}`).join("\n");
}

function renderInline(items: readonly string[]): string {
  if (items.length === 0) {
    return PLACEHOLDER;
  }
  return items.join(" / ");
}

function renderWorkExperiences(items: ResumeParserStructured["workExperiences"]): string {
  if (items.length === 0) {
    return `_${PLACEHOLDER}_`;
  }
  return items
    .map((item, index) => {
      const header = [safe(item.company), safe(item.role), safe(item.period)]
        .filter((s) => s !== PLACEHOLDER)
        .join(" · ");
      const title = header.length > 0 ? header : `经历 ${index + 1}`;
      const summary = safe(item.summary);
      return `### ${index + 1}. ${title}\n\n${summary}`;
    })
    .join("\n\n");
}

function renderProjectExperiences(items: ResumeParserStructured["projectExperiences"]): string {
  if (items.length === 0) {
    return `_${PLACEHOLDER}_`;
  }
  return items
    .map((item, index) => {
      const header = [safe(item.name), safe(item.role), safe(item.period)]
        .filter((s) => s !== PLACEHOLDER)
        .join(" · ");
      const title = header.length > 0 ? header : `项目 ${index + 1}`;
      const lines: string[] = [`### ${index + 1}. ${title}`, "", safe(item.summary)];
      if (item.techStack.length > 0) {
        lines.push("", `**技术栈**：${item.techStack.join("、")}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

function renderTimelineSignals(timeline: ResumeParserStructured["timelineSummary"]): string {
  const lines: string[] = [
    bullet("当前状态", timeline.currentStatus),
    bullet(
      "估算工作年限",
      timeline.estimatedExperienceYears === null ? null : `${timeline.estimatedExperienceYears} 年`,
    ),
  ];
  if (timeline.dateRanges.length > 0) {
    lines.push(`- **时间区间**：${timeline.dateRanges.join("、")}`);
  }
  if (timeline.riskSignals.length > 0) {
    lines.push("", "> ⚠️ **时间线风险信号**", "");
    for (const signal of timeline.riskSignals) {
      lines.push(`> - ${signal}`);
    }
  }
  return lines.join("\n");
}

export function renderProfileReport(result: ResumeParserResult): string {
  const s = result.structured;
  const headline = [safe(s.degree), safe(s.major)].filter((v) => v !== PLACEHOLDER).join(" · ");
  const sections: string[] = [`# 候选人简历报告：${safe(s.name)}`];

  if (headline.length > 0) {
    sections.push(`> ${headline}`);
  }

  // 基本信息 / Basic info
  sections.push("## 基本信息");
  sections.push(
    [
      bullet("姓名", s.name),
      bullet("性别", s.gender),
      bullet("年龄", s.age === null ? null : `${s.age} 岁`),
      bullet("邮箱", s.email),
      bullet("电话", s.phone),
      bullet("学历", s.degree),
      bullet("专业", s.major),
      bullet("毕业院校", renderInline(s.schools)),
      bullet("毕业年份", s.graduationYear),
      bullet("工作年限", s.workYears === null ? null : `${s.workYears} 年`),
    ].join("\n"),
  );

  // 求职方向 / Target roles
  sections.push("## 求职方向");
  sections.push(renderList(s.targetRoles));

  // 技能 / Skills
  sections.push("## 技能");
  sections.push(renderList(s.skills));

  // 个人优势 / Personal strengths
  sections.push("## 个人优势");
  sections.push(renderList(s.personalStrengths));

  // 工作经历 / Work experiences
  sections.push("## 工作经历");
  sections.push(renderWorkExperiences(s.workExperiences));

  // 项目经历 / Project experiences
  sections.push("## 项目经历");
  sections.push(renderProjectExperiences(s.projectExperiences));

  // 时间线信号 / Timeline signals
  sections.push("## 时间线分析");
  sections.push(renderTimelineSignals(s.timelineSummary));

  // 链接 / Links
  if (s.links.length > 0) {
    sections.push("## 链接");
    sections.push(renderList(s.links));
  }

  // 元数据 / Metadata
  const sourceLabel = result.textSource === "vision" ? "视觉模型 (Gemini)" : "PDF 文本提取";
  sections.push("---");
  sections.push(
    `_文件：${result.filename} · 页数：${result.pageCount} · 文本来源：${sourceLabel}_`,
  );

  return sections.join("\n\n");
}
