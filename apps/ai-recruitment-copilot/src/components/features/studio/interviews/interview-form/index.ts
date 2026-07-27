"use client";
import { useForm } from "@tanstack/react-form";
import type { z } from "zod";
import { dateTimeLocalInputToISOString } from "@/lib/client/datetime-local";
import { studioInterviewClientFormSchema } from "@arc/db-schema/studio-interviews";

export type InterviewFormValues = z.infer<typeof studioInterviewClientFormSchema>;
export type InterviewFormApi = ReturnType<typeof useInterviewForm>;

interface FieldErrorLike {
  message?: string;
}

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
  onSubmitInvalid?: (errorMap: Record<string, unknown>) => void;
}) {
  return useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
    onSubmitInvalid: ({ formApi }) => {
      onSubmitInvalid?.(formApi.store.state.fieldMeta as Record<string, unknown>);
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

    if (typeof error === "string") {
      return [{ message: error }];
    }

    if (Array.isArray(error)) {
      return error.flatMap((item) => toFieldErrors([item]) ?? []);
    }

    if (typeof error === "object" && "message" in error) {
      const message = typeof error.message === "string" ? error.message : undefined;
      return [{ message }];
    }

    return [];
  });

  return mappedErrors.length > 0 ? mappedErrors : undefined;
}

export function hasFieldErrors(errors: unknown[] | undefined) {
  return !!toFieldErrors(errors)?.length;
}
