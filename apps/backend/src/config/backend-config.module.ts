import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BackendConfigService } from "./backend-config.service.js";
import { backendEnvironmentSchema } from "./backend-environment.schema.js";

@Global()
@Module({
  exports: [BackendConfigService],
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV || "development"}.local`,
        `.env.${process.env.NODE_ENV || "development"}`,
        ".env.local",
        ".env",
      ],
      isGlobal: true,
      skipProcessEnv: true,
      validationSchema: backendEnvironmentSchema,
    }),
  ],
  providers: [BackendConfigService],
})
export class BackendConfigModule {}
