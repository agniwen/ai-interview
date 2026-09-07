import type { InitialInterviewSnapshot } from "@app/shared/human-initial-interview";
import type { InitialInterviewScope } from "../dao";
import { InitialInterviewError } from "../errors";

export interface ImportRecordedInitialInterviewInput extends InitialInterviewScope {
  actorId: string;
  memberRole: string;
  meetingId: string;
  requestId: string;
  overwriteDocumentId: string | null;
}

export interface ImportRecordedInitialInterviewDependencies {
  withLock<T>(scope: InitialInterviewScope, run: () => Promise<T>): Promise<T>;
  findExisting(
    input: ImportRecordedInitialInterviewInput,
  ): Promise<{ recruitingRecordId: string } | null>;
  checkOverwrite(input: ImportRecordedInitialInterviewInput): Promise<void>;
  capture(input: ImportRecordedInitialInterviewInput): Promise<InitialInterviewSnapshot>;
  persist(
    input: ImportRecordedInitialInterviewInput,
    snapshot: InitialInterviewSnapshot,
  ): Promise<void>;
  cleanup(snapshot: InitialInterviewSnapshot): Promise<void>;
  enqueue(organizationId: string, versionId: string): Promise<void>;
}

export function importRecordedInitialInterview(
  input: ImportRecordedInitialInterviewInput,
  dependencies: ImportRecordedInitialInterviewDependencies,
) {
  return dependencies.withLock(input, async () => {
    const existing = await dependencies.findExisting(input);
    if (existing) {
      if (existing.recruitingRecordId !== input.recruitingRecordId) {
        throw new InitialInterviewError("此生成请求已用于其他招聘记录，请重新发起。");
      }
      return { id: input.requestId };
    }
    await dependencies.checkOverwrite(input);
    const snapshot = await dependencies.capture(input);
    try {
      await dependencies.persist(input, snapshot);
    } catch (error) {
      await dependencies.cleanup(snapshot);
      throw error;
    }
    // A persisted queued version is the outbox; recovery dispatches it after a Redis outage.
    await dependencies.enqueue(input.organizationId, input.requestId);
    return { id: input.requestId };
  });
}
