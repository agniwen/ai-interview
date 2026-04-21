export interface JobDescriptionSelectConfig {
  mode: "select";
  jobDescriptionId: string;
  name: string;
  departmentName: string | null;
  prompt: string;
}

export interface JobDescriptionCustomConfig {
  mode: "custom";
  text: string;
}

export type JobDescriptionConfig = JobDescriptionSelectConfig | JobDescriptionCustomConfig;

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

export function getJobDescriptionLabel(config: JobDescriptionConfig | null): string | null {
  if (!config) {
    return null;
  }
  if (config.mode === "custom") {
    return config.text.trim() ? "自定义 JD" : null;
  }
  return config.name;
}
