export const resumeParseProviderValues = ["ocr-llm", "aliyun-docmining"] as const;
export type ResumeParseProvider = (typeof resumeParseProviderValues)[number];

export function getResumeParseProvider(env: NodeJS.ProcessEnv = process.env): ResumeParseProvider {
  const value = env.RESUME_PARSE_PROVIDER?.trim() || "ocr-llm";
  if (value === "ocr-llm" || value === "aliyun-docmining") {
    return value;
  }
  throw new Error(`RESUME_PARSE_PROVIDER must be one of: ${resumeParseProviderValues.join(", ")}`);
}

export function isResumeParseCacheSourceCompatible(
  textSource: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const isAliyunResult = textSource === "aliyun-docmining";
  return getResumeParseProvider(env) === "aliyun-docmining" ? isAliyunResult : !isAliyunResult;
}
