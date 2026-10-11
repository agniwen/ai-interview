import type { JobType } from "bullmq";

interface TimestampedQueueJob {
  timestamp: number;
}

interface QueueJobsReader<TJob> {
  getJobs: (types: JobType[], start: number, end: number, asc: boolean) => Promise<TJob[]>;
}

export function sortQueueJobsNewestFirst<TJob extends TimestampedQueueJob>(
  jobs: readonly TJob[],
): TJob[] {
  return jobs.toSorted((left, right) => right.timestamp - left.timestamp);
}

export function paginateNewestQueueJobs<TJob extends TimestampedQueueJob>(
  jobs: readonly TJob[],
  page: number,
  pageSize: number,
): TJob[] {
  const start = (page - 1) * pageSize;
  return sortQueueJobsNewestFirst(jobs).slice(start, start + pageSize);
}

export async function loadNewestQueueJobsPage<TJob extends TimestampedQueueJob>(
  queue: QueueJobsReader<TJob>,
  types: JobType[],
  page: number,
  pageSize: number,
): Promise<TJob[]> {
  const jobs = await queue.getJobs(types, 0, -1, false);
  return paginateNewestQueueJobs(jobs, page, pageSize);
}
