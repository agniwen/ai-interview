/* oxlint-disable typescript/no-extraneous-class -- Nest modules are declarative classes. */
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../infrastructure/database/database.module.js";
import { RECRUITING_SCOPE_QUERIES } from "./recruiting-scope.queries.js";
import { RecruitingScopeService } from "./recruiting-scope.service.js";

@Module({
  exports: [RECRUITING_SCOPE_QUERIES],
  imports: [DatabaseModule],
  providers: [{ provide: RECRUITING_SCOPE_QUERIES, useClass: RecruitingScopeService }],
})
export class RecruitingScopeModule {}
