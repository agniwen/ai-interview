# Allow background workloads to be disabled per backend replica

`apps/backend` will keep one entry point and one deployable artifact, but background consumers and schedulers can be disabled per replica with runtime configuration while HTTP remains available. A single-instance deployment enables all workloads by default; HTTP-only replicas can disable background work so scaling request capacity does not implicitly multiply BullMQ concurrency, mail ingestion, notification polling, media processing, or other background activity.
