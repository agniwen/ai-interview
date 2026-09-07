import type { FeishuProviderId } from "../../../../../integrations/feishu/provider";

export interface RecruitingEvaluationDocument {
  documentId: string;
  documentUrl: string;
  providerId: FeishuProviderId;
}

export function ensureRecruitingEvaluationDocument(dependencies: {
  withLock<T>(run: () => Promise<T>): Promise<T>;
  load(): Promise<RecruitingEvaluationDocument | null>;
  create(): Promise<RecruitingEvaluationDocument>;
  save(document: RecruitingEvaluationDocument): Promise<void>;
}): Promise<RecruitingEvaluationDocument> {
  return dependencies.withLock(async () => {
    const existing = await dependencies.load();
    if (existing) {
      return existing;
    }
    const created = await dependencies.create();
    await dependencies.save(created);
    return created;
  });
}
