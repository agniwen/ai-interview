import type { InterviewQuestion, ResumeProfile } from '@/lib/interview/types';
import type { ScheduleEntryStatus } from '@/lib/studio-interviews';

export interface InterviewScheduleEntry {
  id: string
  interviewRecordId: string
  roundLabel: string
  status: ScheduleEntryStatus
  scheduledAt: string | Date | null
  notes: string | null
  sortOrder: number
  conversationId: string | null
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
  currentRoundId: string | null
  currentRoundLabel: string | null
  currentRoundStatus: ScheduleEntryStatus | null
  currentRoundTime: string | Date | null
}

export function buildInterviewLink(id: string, roundId?: string) {
  return roundId ? `/interview/${id}/${roundId}` : `/interview/${id}`;
}

export function sortScheduleEntries<T extends { sortOrder: number }>(entries: T[]) {
  return entries.toSorted((left, right) => left.sortOrder - right.sortOrder);
}

export function pickCurrentScheduleEntry<T extends { sortOrder: number, status: string, scheduledAt: string | Date | null }>(entries: T[]) {
  const sorted = sortScheduleEntries(entries);

  // Pick first pending or in_progress round (by sortOrder)
  const activeEntry = sorted.find(entry => entry.status === 'pending' || entry.status === 'in_progress');

  if (activeEntry) {
    return activeEntry;
  }

  // All rounds are completed — return the last completed round
  return sorted[sorted.length - 1] ?? null;
}

export function buildCandidateInterviewView(record: {
  id: string
  candidateName: string
  targetRole: string | null
  status: string
  resumeProfile: ResumeProfile | null
  interviewQuestions: InterviewQuestion[]
}, scheduleEntries: InterviewScheduleEntry[], roundId: string): CandidateInterviewView {
  const currentEntry = scheduleEntries.find(e => e.id === roundId) ?? null;

  return {
    id: record.id,
    candidateName: record.candidateName,
    targetRole: record.targetRole,
    status: record.status,
    resumeProfile: record.resumeProfile,
    interviewQuestions: record.interviewQuestions,
    currentRoundId: currentEntry?.id ?? null,
    currentRoundLabel: currentEntry?.roundLabel ?? null,
    currentRoundStatus: (currentEntry?.status as ScheduleEntryStatus) ?? null,
    currentRoundTime: currentEntry?.scheduledAt ?? null,
  };
}
