"use client";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { dateTimeLocalInputToISOString } from "@/lib/client/datetime-local";
import { studioInterviewClientFormSchema } from "@app/db-schema/studio-interviews";

export type InterviewFormValues = z.infer<typeof studioInterviewClientFormSchema>;
export type InterviewFormApi = ReturnType<typeof useInterviewForm>;

interface FieldErrorLike {
  message?: string;
}

type InterviewFieldMeta = Partial<Record<string, { errors?: unknown[] }>>;

const fieldErrorMessageSchema = z.object({ message: z.string().optional() });
const fieldErrorArraySchema = z.array(z.unknown());

export function normalizeScheduleEntries(values: InterviewFormValues["scheduleEntries"]) {
  return values.map((entry, index) => ({
    ...entry,
    scheduledAt: dateTimeLocalInputToISOString(entry.scheduledAt ?? ""),
    scheduledEndAt: dateTimeLocalInputToISOString(entry.scheduledEndAt ?? ""),
    sortOrder: index,
  }));
}

function useInterviewForm({
  defaultValues,
  onSubmit,
  onSubmitInvalid,
}: {
  defaultValues: InterviewFormValues;
  onSubmit: (value: InterviewFormValues) => Promise<void> | void;
  onSubmitInvalid?: (errorMap: InterviewFieldMeta) => void;
}) {
  return useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
    onSubmitInvalid: ({ formApi }) => {
      onSubmitInvalid?.(formApi.store.state.fieldMeta);
    },
    validators: {
      onSubmit: studioInterviewClientFormSchema,
    },
  });
}

export function toFieldErrors(errors: unknown[] | undefined): FieldErrorLike[] | undefined {
  // oxlint-disable-next-line promise/prefer-await-to-callbacks -- synchronous flatMap callback, not a node-style callback
  const mappedErrors = (errors ?? []).flatMap((error) => {
    if (!error) {
      return [];
    }

    const messageResult = z.string().safeParse(error);
    if (messageResult.success) {
      return [{ message: messageResult.data }];
    }

    const arrayResult = fieldErrorArraySchema.safeParse(error);
    if (arrayResult.success) {
      return arrayResult.data.flatMap((item) => toFieldErrors([item]) ?? []);
    }

    const objectResult = fieldErrorMessageSchema.safeParse(error);
    if (objectResult.success) {
      return [{ message: objectResult.data.message }];
    }

    return [];
  });

  return mappedErrors.length > 0 ? mappedErrors : undefined;
}

export function hasFieldErrors(errors: unknown[] | undefined) {
  return !!toFieldErrors(errors)?.length;
}
