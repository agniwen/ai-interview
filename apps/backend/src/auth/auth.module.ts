import { Global, Module, RequestMethod } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { API_DATABASE } from "../infrastructure/database/database.tokens.js";
import type { Database } from "../infrastructure/database/database.tokens.js";
import { AuthSessionMiddleware } from "./auth-session.middleware.js";
import { AUTH_MEMBER_JOINED_NOTIFIER, BACKEND_AUTH } from "./auth.tokens.js";
import { createBackendAuth } from "./better-auth.factory.js";
import { FeishuMemberJoinedNotifier } from "./member-joined-notifier.js";
import type { AuthMemberJoinedNotifier } from "./member-joined-notifier.js";
import { RequiredAuthGuard } from "./required-auth.guard.js";

@Global()
@Module({
  exports: [BACKEND_AUTH, RequiredAuthGuard],
  providers: [
    {
      inject: [API_DATABASE, AUTH_MEMBER_JOINED_NOTIFIER],
      provide: BACKEND_AUTH,
      useFactory(database: Database, notifier: AuthMemberJoinedNotifier) {
        return createBackendAuth(database, notifier);
      },
    },
    {
      inject: [API_DATABASE],
      provide: AUTH_MEMBER_JOINED_NOTIFIER,
      useFactory(database: Database): AuthMemberJoinedNotifier {
        return new FeishuMemberJoinedNotifier(database);
      },
    },
    AuthSessionMiddleware,
    RequiredAuthGuard,
  ],
})
export class AuthModule implements NestModule {
  // oxlint-disable-next-line class-methods-use-this -- Nest calls module middleware configuration through this interface.
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuthSessionMiddleware)
      .exclude(
        { method: RequestMethod.ALL, path: "api/auth/*splat" },
        { method: RequestMethod.ALL, path: "api/health" },
        { method: RequestMethod.ALL, path: "api/ready" },
      )
      .forRoutes({ method: RequestMethod.ALL, path: "api/*splat" });
  }
}
