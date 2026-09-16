"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SUPPLEMENTED_SECTION_LABELS } from "./ai-job-description";
import type { JobDescriptionSupplementedItem } from "./ai-job-description";

export function JobDescriptionAiSupplementModal({
  applyGeneratedJobDescription,
  pending,
  setPending,
}: {
  applyGeneratedJobDescription: () => void;
  pending: {
    jobDescription: string;
    suggestedName: string;
    supplementedItems: JobDescriptionSupplementedItem[];
  } | null;
  setPending: (
    pending: {
      jobDescription: string;
      suggestedName: string;
      supplementedItems: JobDescriptionSupplementedItem[];
    } | null,
  ) => void;
}) {
  return (
    <Modal
      description="以下内容在原岗位 JD 中不明确，AI 已在新 JD 中补充。请认真核对，确认后仍可直接编辑。"
      footer={
        <>
          <Button onClick={() => setPending(null)} type="button" variant="outline">
            返回修改
          </Button>
          <Button onClick={applyGeneratedJobDescription} type="button">
            确认并采用
          </Button>
        </>
      }
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setPending(null);
        }
      }}
      open={pending !== null}
      size="lg"
      title="请核对 AI 补充内容"
    >
      {pending?.supplementedItems.length ? (
        <ul className="space-y-2">
          {pending.supplementedItems.map((item) => (
            <li
              className="rounded-md border bg-muted/30 px-3 py-2"
              key={`${item.section}-${item.detail}`}
            >
              <span className="font-medium">{SUPPLEMENTED_SECTION_LABELS[item.section]}</span>
              <span className="text-muted-foreground">：{item.detail}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-muted-foreground text-sm">
          未发现明显缺失信息，AI 主要优化了岗位 JD 的结构和表述。
        </div>
      )}
    </Modal>
  );
}
