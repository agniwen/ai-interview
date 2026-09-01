import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { API_DATABASE } from "../database/database.tokens.js";
import { HttpRequestAuthService } from "../../auth/http-request-auth.service.js";
import { HTTP_DATABASE, HTTP_REQUEST_AUTH } from "./http.ports.js";

@Module({
  exports: [HTTP_REQUEST_AUTH, HTTP_DATABASE],
  imports: [AuthModule, DatabaseModule],
  providers: [
    { provide: HTTP_REQUEST_AUTH, useClass: HttpRequestAuthService },
    { provide: HTTP_DATABASE, useExisting: API_DATABASE },
  ],
})
export class HttpInfrastructureModule {}
