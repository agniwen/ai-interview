import { Module, RequestMethod } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { API_DATABASE } from "../infrastructure/database/database.tokens.js";
import type { Database } from "../infrastructure/database/database.tokens.js";
import { DatabaseModule } from "../infrastructure/database/database.module.js";
import { BackendConfigModule } from "../config/backend-config.module.js";
import { BackendConfigService } from "../config/backend-config.service.js";
import { AuthSessionMiddleware } from "./auth-session.middleware.js";
import { AUTH_MEMBER_JOINED_NOTIFIER, BACKEND_AUTH } from "./auth.tokens.js";
import { createBackendAuth } from "./better-auth.factory.js";
import { FeishuMemberJoinedNotifier } from "./member-joined-notifier.js";
import type { AuthMemberJoinedNotifier } from "./member-joined-notifier.js";
import { RequiredAuthGuard } from "./required-auth.guard.js";

@Module({
  exports: [BACKEND_AUTH, RequiredAuthGuard],
  imports: [BackendConfigModule, DatabaseModule],
  providers: [
    {
      inject: [API_DATABASE, AUTH_MEMBER_JOINED_NOTIFIER, BackendConfigService],
      provide: BACKEND_AUTH,
      useFactory(
        database: Database,
        notifier: AuthMemberJoinedNotifier,
        config: BackendConfigService,
      ) {
        return createBackendAuth(database, notifier, {
          BETTER_AUTH_SECRET: config.get("BETTER_AUTH_SECRET"),
          BETTER_AUTH_TRUSTED_ORIGINS: config.get("BETTER_AUTH_TRUSTED_ORIGINS"),
          BETTER_AUTH_URL: config.get("BETTER_AUTH_URL"),
          FEISHU_APP_ID: config.get("FEISHU_APP_ID"),
          FEISHU_APP_ID2: config.get("FEISHU_APP_ID2"),
          FEISHU_APP_SECRET: config.get("FEISHU_APP_SECRET"),
          FEISHU_APP_SECRET2: config.get("FEISHU_APP_SECRET2"),
          GOOGLE_CLIENT_ID: config.get("GOOGLE_CLIENT_ID"),
          GOOGLE_CLIENT_SECRET: config.get("GOOGLE_CLIENT_SECRET"),
          NODE_ENV: config.get("NODE_ENV"),
          TRUSTED_ORIGINS: config.get("TRUSTED_ORIGINS"),
        });
      },
    },
    {
      inject: [API_DATABASE, BackendConfigService],
      provide: AUTH_MEMBER_JOINED_NOTIFIER,
      useFactory(database: Database, config: BackendConfigService): AuthMemberJoinedNotifier {
        return new FeishuMemberJoinedNotifier(database, {
          BETTER_AUTH_URL: config.get("BETTER_AUTH_URL"),
          FEISHU_APP_ID: config.get("FEISHU_APP_ID"),
          FEISHU_APP_ID2: config.get("FEISHU_APP_ID2"),
          FEISHU_APP_SECRET: config.get("FEISHU_APP_SECRET"),
          FEISHU_APP_SECRET2: config.get("FEISHU_APP_SECRET2"),
          NEXT_PUBLIC_BASE_URL: config.get("NEXT_PUBLIC_BASE_URL"),
        });
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
        { method: RequestMethod.ALL, path: "public/auth/*splat" },
        { method: RequestMethod.ALL, path: "system/health/*splat" },
      )
      .forRoutes(
        { method: RequestMethod.ALL, path: "workspaces/*splat" },
        { method: RequestMethod.ALL, path: "public/*splat" },
        { method: RequestMethod.ALL, path: "system/*splat" },
      );
  }
}
