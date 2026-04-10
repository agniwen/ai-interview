'use client';

import type { StudioInterviewFormValues, StudioInterviewRecord } from '@/lib/studio-interviews';
import { useForm } from '@tanstack/react-form';
import {
  createDefaultScheduleEntry,
  getScheduleEntryDateValue,
  studioInterviewFormSchema,
} from '@/lib/studio-interviews';

export type InterviewFormValues = StudioInterviewFormValues;
export type InterviewFormApi = ReturnType<typeof useInterviewForm>;

interface FieldErrorLike {
  message?: string
}

export function createInterviewFormValues(): InterviewFormValues {
  return {
    candidateName: '',
    candidateEmail: '',
    targetRole: '',
    notes: '',
    status: 'ready',
    scheduleEntries: [createDefaultScheduleEntry()],
  };
}

export function toInterviewFormValues(record: Pick<StudioInterviewRecord, 'candidateName' | 'candidateEmail' | 'targetRole' | 'notes' | 'status' | 'scheduleEntries'>): InterviewFormValues {
  return {
    candidateName: record.candidateName,
    candidateEmail: record.candidateEmail ?? '',
    targetRole: record.targetRole ?? '',
    notes: record.notes ?? '',
    status: record.status,
    scheduleEntries: record.scheduleEntries.map((entry, index) => ({
      id: entry.id,
      roundLabel: entry.roundLabel,
      scheduledAt: getScheduleEntryDateValue(entry.scheduledAt),
      notes: entry.notes ?? '',
      sortOrder: entry.sortOrder ?? index,
    })),
  };
}

export function normalizeScheduleEntries(values: InterviewFormValues['scheduleEntries']) {
  return values.map((entry, index) => ({
    ...entry,
    sortOrder: index,
  }));
}

export function useInterviewForm({
  defaultValues,
  onSubmit,
}: {
  defaultValues: InterviewFormValues
  onSubmit: (value: InterviewFormValues) => Promise<void> | void
}) {
  return useForm({
    defaultValues,
    validators: {
      onSubmit: studioInterviewFormSchema,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });
}

export function toFieldErrors(errors: unknown[] | undefined): FieldErrorLike[] | undefined {
  const mappedErrors = (errors ?? []).flatMap((error) => {
    if (!error) {
      return [];
    }

    if (typeof error === 'string') {
      return [{ message: error }];
    }

    if (Array.isArray(error)) {
      return error.flatMap(item => toFieldErrors([item]) ?? []);
    }

    if (typeof error === 'object' && 'message' in error) {
      const message = typeof error.message === 'string' ? error.message : undefined;
      return [{ message }];
    }

    return [];
  });

  return mappedErrors.length > 0 ? mappedErrors : undefined;
}

export function hasFieldErrors(errors: unknown[] | undefined) {
  return !!toFieldErrors(errors)?.length;
}
