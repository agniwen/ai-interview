import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanInterviewFinalOutcomeSchema } from "@app/db-schema/studio-interviews";
import type { HumanInterviewFinalOutcome } from "@app/db-schema/studio-interviews";
import type { HumanInterviewRoundRecord } from "@app/shared/studio-pipeline-stages";
import { resolveHumanInterviewRoundOutcome } from "@/lib/client/api";
import { invalidateHumanInterviewCandidateQueries } from "@/lib/client/api/query-keys";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

interface OutcomeDialogDependencies {
  save: typeof resolveHumanInterviewRoundOutcome;
  notifyError: (message: string) => void;
  notifySuccess: (message: string) => void;
}
const defaultDependencies: OutcomeDialogDependencies = {
  notifyError: (message) => toast.error(message),
  notifySuccess: (message) => toast.success(message),
  save: resolveHumanInterviewRoundOutcome,
};

export function HumanInterviewOutcomeDialog({
  round,
  slug,
  onClose,
  dependencies = defaultDependencies,
}: {
  round: Pick<HumanInterviewRoundRecord, "id" | "interviewRecordId" | "label">;
  slug: string;
  onClose: () => void;
  dependencies?: OutcomeDialogDependencies;
}) {
  const id = useId();
  const [outcome, setOutcome] = useState<HumanInterviewFinalOutcome | "">("");
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (value: HumanInterviewFinalOutcome) =>
      dependencies.save(slug, round.interviewRecordId, round.id, value),
    onError: (error) => dependencies.notifyError(error.message),
    onSuccess: async () => {
      dependencies.notifySuccess("本轮结论已更新，飞书评价表将自动同步");
      await invalidateHumanInterviewCandidateQueries(queryClient, {
        candidateId: round.interviewRecordId,
        slug,
      });
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>修改本轮结论 · {round.label}</DialogTitle>
          <DialogDescription>
            仅补充历史待定结论，原评价内容保持不变。选择通过后可安排下一轮；飞书评级后会同步标注结论。确认后不能再次修改。
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={id}>本轮结论</FieldLabel>
          <NativeSelect
            id={id}
            value={outcome}
            disabled={mutation.isPending}
            onChange={(event) => {
              const parsed = humanInterviewFinalOutcomeSchema.safeParse(event.target.value);
              if (parsed.success) {
                setOutcome(parsed.data);
              }
            }}
          >
            <NativeSelectOption disabled value="">
              请选择通过或不通过
            </NativeSelectOption>
            <NativeSelectOption value="pass">通过</NativeSelectOption>
            <NativeSelectOption value="fail">不通过</NativeSelectOption>
          </NativeSelect>
        </Field>
        <DialogFooter>
          <Button variant="outline" disabled={mutation.isPending} onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={!outcome || mutation.isPending}
            onClick={() => {
              if (outcome) {
                mutation.mutate(outcome);
              }
            }}
          >
            {mutation.isPending ? "保存中…" : "确认修改"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
