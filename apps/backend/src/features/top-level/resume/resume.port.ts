export const TOP_LEVEL_RESUME_PORT = Symbol("TOP_LEVEL_RESUME_PORT");

export interface ResumeModelOption {
  id: string;
  label: string;
  provider: "alibaba" | "deepseek" | "moonshot" | "zhipu" | "minimax" | "other";
}

export interface TopLevelResumePort {
  generateTitle(input: { hasFiles: boolean; text: string }): Promise<string>;
}
