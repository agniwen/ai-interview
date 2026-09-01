export const RESUME_UTILITY_PORT = Symbol("RESUME_UTILITY_PORT");

export interface ResumeModelOption {
  id: string;
  label: string;
  provider: "alibaba" | "deepseek" | "moonshot" | "zhipu" | "minimax" | "other";
}

export interface ResumeUtilityPort {
  generateTitle(input: { hasFiles: boolean; text: string }): Promise<string>;
}
