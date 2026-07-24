"use client";

import type { StudioCandidateRecord } from "@arc/shared/studio-candidates";
import { useForm } from "@tanstack/react-form";
import type { z } from "zod";
import { dateTimeLocalInputToISOString } from "@/lib/client/datetime-local";
import {
  createDefaultScheduleEntry,
  studioInterviewClientFormSchema,
} from "@arc/db-schema/studio-interviews";

export type InterviewFormValues = z.infer<typeof studioInterviewClientFormSchema>;
export type InterviewFormApi = ReturnType<typeof useInterviewForm>;

interface FieldErrorLike {
  message?: string;
}

export function createInterviewFormValues(): InterviewFormValues {
  return {
    candidateEmail: "",
    candidateName: "",
    candidatePhone: "",
    interviewQuestions: [],
    jobDescriptionId: "",
    notes: "",
    scheduleEntries: [createDefaultScheduleEntry()],
    targetRole: "",
  };
}

export function toInterviewFormValues(
  record: Pick<
    StudioCandidateRecord,
    | "candidateName"
    | "candidateEmail"
    | "candidatePhone"
    | "targetRole"
    | "notes"
    | "jobDescriptionId"
    | "interviewQuestions"
  >,
): InterviewFormValues {
  return {
    candidateEmail: record.candidateEmail ?? "",
    candidateName: record.candidateName,
    candidatePhone: record.candidatePhone ?? "",
    interviewQuestions: record.interviewQuestions ?? [],
    jobDescriptionId: record.jobDescriptionId ?? "",
    notes: record.notes ?? "",
    // 新建面试时默认填入一条空排期；编辑轮次字段走单独的 InterviewEditBody。
    // Default to one blank schedule entry on create; round-field edits use InterviewEditBody.
    scheduleEntries: [createDefaultScheduleEntry()],
    targetRole: record.targetRole ?? "",
  };
}

export function normalizeScheduleEntries(values: InterviewFormValues["scheduleEntries"]) {
  return values.map((entry, index) => ({
    ...entry,
    scheduledAt: dateTimeLocalInputToISOString(entry.scheduledAt ?? ""),
    scheduledEndAt: dateTimeLocalInputToISOString(entry.scheduledEndAt ?? ""),
    sortOrder: index,
  }));
}

export function normalizeInterviewQuestions(values: InterviewFormValues["interviewQuestions"]) {
  return values.map((question, index) => ({
    ...question,
    evaluationFocus: question.evaluationFocus?.trim() || null,
    followUpDirections: question.followUpDirections?.trim() || null,
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
