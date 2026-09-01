# Run HTTP and background workloads in one Nest process

`apps/backend` will expose one application entry point and one deployment unit that owns both the standalone HTTP API and all functionality currently hosted by `apps/worker`, including BullMQ consumers, mail ingestion, meeting processing, media subprocesses, and worker diagnostics. This deliberately couples API and background-workload scaling and failure domains in exchange for one package, one bootstrap lifecycle, and one deployable backend; the old `apps/worker` will be retired only after behavior and operational parity are verified.
