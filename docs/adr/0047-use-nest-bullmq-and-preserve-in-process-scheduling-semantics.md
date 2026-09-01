# Use Nest BullMQ and preserve in-process scheduling semantics

`apps/backend` will use `@nestjs/bullmq` for queue registration, producers, consumers, events, and shutdown, while `@nestjs/schedule`, `SchedulerRegistry`, and Nest lifecycle hooks replace the worker's manual timers and startup recovery. Polling and recovery will retain the existing process-local scheduling, manual-run, database lease and claim, and deterministic job-ID behavior rather than introducing Redis-persisted repeatable or scheduled jobs that would change operational semantics.
