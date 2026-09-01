import { Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { SentryGlobalFilter, SentryModule } from "@sentry/nestjs/setup";
import { RequestCorrelationMiddleware } from "./request-correlation.middleware.js";

@Module({
  imports: [SentryModule.forRoot()],
  providers: [{ provide: APP_FILTER, useClass: SentryGlobalFilter }],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    void this;
    consumer.apply(RequestCorrelationMiddleware).forRoutes("*");
  }
}
