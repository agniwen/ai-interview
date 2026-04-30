"use client";

import type { StudioInterviewRecord } from "@/lib/studio-interviews";
import { useForm } from "@tanstack/react-form";
import type { z } from "zod";
import {
  createDefaultScheduleEntry,
  getScheduleEntryDateValue,
  studioInterviewClientFormSchema,
} from "@/lib/studio-interviews";

export type InterviewFormValues = z.infer<typeof studioInterviewClientFormSchema>;
export type InterviewFormApi = ReturnType<typeof useInterviewForm>;

interface FieldErrorLike {
  message?: string;
}

export function createInterviewFormValues(): InterviewFormValues {
  return {
    candidateEmail: "",
    candidateName: "",
    interviewQuestions: [],
    jobDescriptionId: "",
    notes: "",
    scheduleEntries: [createDefaultScheduleEntry()],
    status: "ready",
    targetRole: "",
  };
}

export function toInterviewFormValues(
  record: Pick<
    StudioInterviewRecord,
    | "candidateName"
    | "candidateEmail"
    | "targetRole"
    | "notes"
    | "status"
    | "scheduleEntries"
    | "jobDescriptionId"
    | "interviewQuestions"
  >,
): InterviewFormValues {
  return {
    candidateEmail: record.candidateEmail ?? "",
    candidateName: record.candidateName,
    interviewQuestions: record.interviewQuestions ?? [],
    jobDescriptionId: record.jobDescriptionId ?? "",
    notes: record.notes ?? "",
    scheduleEntries: record.scheduleEntries.map((entry, index) => ({
      allowTextInput: entry.allowTextInput ?? false,
      id: entry.id,
      notes: entry.notes ?? "",
      roundLabel: entry.roundLabel,
      scheduledAt: getScheduleEntryDateValue(entry.scheduledAt),
      sortOrder: entry.sortOrder ?? index,
    })),
    status: record.status,
    targetRole: record.targetRole ?? "",
  };
}

export function normalizeScheduleEntries(values: InterviewFormValues["scheduleEntries"]) {
  return values.map((entry, index) => ({
    ...entry,
    sortOrder: index,
  }));
}

export function normalizeInterviewQuestions(values: InterviewFormValues["interviewQuestions"]) {
  return values.map((question, index) => ({
    ...question,
    order: index + 1,
    question: question.question.trim(),
  }));
}

export function useInterviewForm({
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
