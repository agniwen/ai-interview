/**
 * 岗位描述（JD）的两种来源：选择已有的岗位 / 直接输入自定义文本。
 * Two sources of a job description: pick an existing record, or paste custom text.
 *
 * 通过判别联合 `mode` 字段在运行时区分。
 * Discriminated by the `mode` field at runtime.
 */

/** 选择库内已有岗位 / Pick an existing job description record. */
export interface JobDescriptionSelectConfig {
  mode: "select";
  jobDescriptionId: string;
  name: string;
  departmentName: string | null;
  prompt: string;
}

/** 自由输入岗位描述 / Free-form custom job description text. */
export interface JobDescriptionCustomConfig {
  mode: "custom";
  text: string;
}

export type JobDescriptionConfig = JobDescriptionSelectConfig | JobDescriptionCustomConfig;

/**
 * 把 JD 配置展开为最终给 LLM 使用的纯文本。
 * Flatten a JD config into the plain text fed to the LLM.
 */
export function deriveJobDescriptionText(config: JobDescriptionConfig | null): string {
  if (!config) {
    return "";
  }
  if (config.mode === "custom") {
    return config.text.trim();
  }
  const heading = config.departmentName
    ? `在招岗位：${config.name}（${config.departmentName}）`
    : `在招岗位：${config.name}`;
  return `${heading}\n\n${config.prompt}`.trim();
}

/**
 * 取一个用于 UI 展示的简短标签。
 * Build a short label for UI display purposes.
 */
export function getJobDescriptionLabel(config: JobDescriptionConfig | null): string | null {
  if (!config) {
    return null;
  }
  if (config.mode === "custom") {
    return config.text.trim() ? "自定义 JD" : null;
  }
  return config.name;
}
