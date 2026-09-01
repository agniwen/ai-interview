import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../infrastructure/database/database.module.js";
import { JOB_EVALUATION_SNAPSHOT_COMMANDS } from "./job-evaluation-snapshot.commands.js";
import { JobEvaluationSnapshotService } from "./job-evaluation-snapshot.service.js";

@Module({
  exports: [JOB_EVALUATION_SNAPSHOT_COMMANDS],
  imports: [DatabaseModule],
  providers: [
    { provide: JOB_EVALUATION_SNAPSHOT_COMMANDS, useClass: JobEvaluationSnapshotService },
  ],
})
export class JobEvaluationSnapshotModule {}
