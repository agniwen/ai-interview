import type { InterviewQuestion, ResumeProfile } from '@/lib/interview/types';

export interface InterviewScheduleEntry {
  id: string
  interviewRecordId: string
  roundLabel: string
  scheduledAt: string | Date | null
  notes: string | null
  sortOrder: number
  createdAt: string | Date
  updatedAt: string | Date
}

export interface CandidateInterviewView {
  id: string
  candidateName: string
  targetRole: string | null
  status: string
  resumeProfile: ResumeProfile | null
  interviewQuestions: InterviewQuestion[]
  currentRoundLabel: string | null
  currentRoundTime: string | Date | null
}

export function buildInterviewLink(id: string) {
  return `/interview/${id}`;
}

export function sortScheduleEntries<T extends { sortOrder: number }>(entries: T[]) {
  return entries.toSorted((left, right) => left.sortOrder - right.sortOrder);
}

export function pickCurrentScheduleEntry<T extends { sortOrder: number } & { scheduledAt: string | Date | null }>(entries: T[]) {
  const sorted = sortScheduleEntries(entries);
  const now = Date.now();

  const upcomingEntry = sorted.find((entry) => {
    if (!entry.scheduledAt) {
      return false;
    }

    return new Date(entry.scheduledAt).getTime() >= now;
  });

  return upcomingEntry ?? sorted[0] ?? null;
}

export function buildCandidateInterviewView(record: {
  id: string
  candidateName: string
  targetRole: string | null
  status: string
  resumeProfile: ResumeProfile | null
  interviewQuestions: InterviewQuestion[]
}, scheduleEntries: InterviewScheduleEntry[]): CandidateInterviewView {
  const currentEntry = pickCurrentScheduleEntry(scheduleEntries);

  return {
    id: record.id,
    candidateName: record.candidateName,
    targetRole: record.targetRole,
    status: record.status,
    resumeProfile: record.resumeProfile,
    interviewQuestions: record.interviewQuestions,
    currentRoundLabel: currentEntry?.roundLabel ?? null,
    currentRoundTime: currentEntry?.scheduledAt ?? null,
  };
}
