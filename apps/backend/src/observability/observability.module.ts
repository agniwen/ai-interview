import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { SentryGlobalFilter, SentryModule } from "@sentry/nestjs/setup";

@Module({
  imports: [SentryModule.forRoot()],
  providers: [{ provide: APP_FILTER, useClass: SentryGlobalFilter }],
})
export class ObservabilityModule {}
