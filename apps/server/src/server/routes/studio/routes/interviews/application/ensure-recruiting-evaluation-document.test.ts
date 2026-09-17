import { describe, expect, it, vi } from "vitest";
import { ensureRecruitingEvaluationDocument } from "./ensure-recruiting-evaluation-document";

describe("recruiting-record evaluation document", () => {
  it("creates a document without any AI conversation and reuses it for the next round", async () => {
    let document: { documentId: string; documentUrl: string; providerId: "feishu" } | null = null;
    const dependencies = {
      create: vi.fn(() =>
        Promise.resolve({
          documentId: "human-first",
          documentUrl: "https://feishu.cn/docx/human-first",
          providerId: "feishu" as const,
        }),
      ),
      load: () => Promise.resolve(document),
      save: (value: NonNullable<typeof document>) => {
        document = value;
        return Promise.resolve();
      },
      withLock: <T>(run: () => Promise<T>) => run(),
    };
    expect(await ensureRecruitingEvaluationDocument(dependencies)).toMatchObject({
      documentId: "human-first",
    });
    expect(await ensureRecruitingEvaluationDocument(dependencies)).toMatchObject({
      documentId: "human-first",
    });
    expect(dependencies.create).toHaveBeenCalledTimes(1);
  });
  it("uses the record document regardless of which notification produced it", async () => {
    const create = vi.fn();
    const document = {
      documentId: "ai-report",
      documentUrl: "https://feishu.cn/docx/ai-report",
      providerId: "feishu" as const,
    };
    expect(
      await ensureRecruitingEvaluationDocument({
        create,
        load: () => Promise.resolve(document),
        save: vi.fn(),
        withLock: (run) => run(),
      }),
    ).toEqual(document);
    expect(create).not.toHaveBeenCalled();
  });
});
