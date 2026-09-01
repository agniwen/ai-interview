import type { Queue } from "bullmq";
import {
  buildMeetingPlaybackJobId,
  MEETING_PLAYBACK_JOB_NAME,
} from "@arc/meeting-processing-queue/meeting-playback";
import type { MeetingPlaybackJobData } from "@arc/meeting-processing-queue/meeting-playback";
import {
  MAIL_INGEST_TRIGGER_JOB_NAME,
  mailIngestTriggerJobSchema,
} from "@arc/resume-parse-queue/mail-ingest-trigger";
import type { MailIngestTriggerJobData } from "@arc/resume-parse-queue/mail-ingest-trigger";
import {
  buildResumeParseJobId,
  defaultResumeParseJobOptions,
  RESUME_PARSE_JOB_NAME,
  shouldRemoveExistingResumeParseJob,
} from "@arc/resume-parse-queue/resume-parse";
import type { ResumeParseJobData } from "@arc/resume-parse-queue/resume-parse";
import {
  buildResumeReviewGenerationJobId,
  defaultResumeReviewGenerationJobOptions,
  RESUME_REVIEW_GENERATION_JOB_NAME,
} from "@arc/resume-parse-queue/resume-review-generation";
import type { ResumeReviewGenerationJobData } from "@arc/resume-parse-queue/resume-review-generation";
import {
  buildResumeSemanticIndexJobId,
  RESUME_SEMANTIC_INDEX_JOB_NAME,
} from "@arc/resume-parse-queue/resume-semantic-index";
import type { ResumeSemanticIndexJobData } from "@arc/resume-parse-queue/resume-semantic-index";
import { withCorrelationJobOptions } from "../observability/request-correlation.context.js";

export type MeetingPlaybackProducerQueue = Pick<
  Queue<MeetingPlaybackJobData>,
  "addBulk" | "getJob"
>;
export type MailIngestTriggerProducerQueue = Pick<Queue<MailIngestTriggerJobData>, "add">;
export type ResumeParseProducerQueue = Pick<Queue<ResumeParseJobData>, "addBulk" | "getJob">;
export type ResumeReviewGenerationProducerQueue = Pick<
  Queue<ResumeReviewGenerationJobData>,
  "addBulk" | "getJob"
>;
export type ResumeSemanticIndexProducerQueue = Pick<
  Queue<ResumeSemanticIndexJobData>,
  "addBulk" | "getJob"
>;

async function removeCompletedOrFailedJobs<T>(
  queue: Pick<Queue<T>, "getJob">,
  jobs: { jobId: string }[],
): Promise<void> {
  await Promise.all(
    jobs.map(async ({ jobId }) => {
      const existing = await queue.getJob(jobId);
      if (!existing) {
        return;
      }
      if (shouldRemoveExistingResumeParseJob(await existing.getState())) {
        await existing.remove();
      }
    }),
  );
}

export async function enqueueResumeParseJobsWithQueue(
  queue: ResumeParseProducerQueue,
  jobs: ResumeParseJobData[],
  correlationId?: string,
): Promise<void> {
  if (jobs.length === 0) {
    return;
  }
  const options = defaultResumeParseJobOptions();
  await removeCompletedOrFailedJobs(
    queue,
    jobs.map((data) => ({ jobId: buildResumeParseJobId(data.itemId) })),
  );
  await queue.addBulk(
    jobs.map((data) => ({
      data,
      name: RESUME_PARSE_JOB_NAME,
      opts: withCorrelationJobOptions(
        { ...options, jobId: buildResumeParseJobId(data.itemId) },
        correlationId,
      ),
    })),
  );
}

export async function enqueueResumeSemanticIndexJobsWithQueue(
  queue: ResumeSemanticIndexProducerQueue,
  jobs: ResumeSemanticIndexJobData[],
  correlationId?: string,
): Promise<void> {
  if (jobs.length === 0) {
    return;
  }
  await removeCompletedOrFailedJobs(
    queue,
    jobs.map((data) => ({ jobId: buildResumeSemanticIndexJobId(data) })),
  );
  await queue.addBulk(
    jobs.map((data) => ({
      data,
      name: RESUME_SEMANTIC_INDEX_JOB_NAME,
      opts: withCorrelationJobOptions(
        {
          ...defaultResumeParseJobOptions(),
          jobId: buildResumeSemanticIndexJobId(data),
          removeOnComplete: { count: 2000 },
          removeOnFail: { count: 5000 },
        },
        correlationId,
      ),
    })),
  );
}

export async function enqueueResumeReviewGenerationJobsWithQueue(
  queue: ResumeReviewGenerationProducerQueue,
  jobs: ResumeReviewGenerationJobData[],
  correlationId?: string,
): Promise<void> {
  if (jobs.length === 0) {
    return;
  }
  await Promise.all(
    jobs.map(async (data) => {
      const existing = await queue.getJob(buildResumeReviewGenerationJobId(data));
      if (!existing) {
        return;
      }
      const state = await existing.getState();
      const generationToken = "generationToken" in data ? data.generationToken : undefined;
      if (state === "failed" || (!generationToken && shouldRemoveExistingResumeParseJob(state))) {
        await existing.remove();
      }
    }),
  );
  await queue.addBulk(
    jobs.map((data) => ({
      data,
      name: RESUME_REVIEW_GENERATION_JOB_NAME,
      opts: withCorrelationJobOptions(
        {
          ...defaultResumeReviewGenerationJobOptions(),
          jobId: buildResumeReviewGenerationJobId(data),
        },
        correlationId,
      ),
    })),
  );
}

export async function enqueueMailIngestTriggerWithQueue(
  queue: MailIngestTriggerProducerQueue,
  data: MailIngestTriggerJobData,
  correlationId?: string,
): Promise<void> {
  const payload = mailIngestTriggerJobSchema.parse(data);
  await queue.add(
    MAIL_INGEST_TRIGGER_JOB_NAME,
    payload,
    withCorrelationJobOptions(
      {
        attempts: 3,
        backoff: { delay: 1000, type: "exponential" },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
      correlationId,
    ),
  );
}

export async function enqueueMeetingPlaybackJobsWithQueue(
  queue: MeetingPlaybackProducerQueue,
  jobs: MeetingPlaybackJobData[],
  correlationId?: string,
): Promise<void> {
  if (jobs.length === 0) {
    return;
  }
  await removeCompletedOrFailedJobs(
    queue,
    jobs.map((data) => ({ jobId: buildMeetingPlaybackJobId(data) })),
  );
  await queue.addBulk(
    jobs.map((data) => ({
      data,
      name: MEETING_PLAYBACK_JOB_NAME,
      opts: withCorrelationJobOptions(
        {
          attempts: 5,
          backoff: { delay: 5000, type: "exponential" },
          jobId: buildMeetingPlaybackJobId(data),
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
        correlationId,
      ),
    })),
  );
}
