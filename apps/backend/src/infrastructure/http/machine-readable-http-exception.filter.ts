import { Catch, HttpException } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { HttpAdapterHost } from "@nestjs/core";
import { z } from "zod";

const httpErrorBodySchema = z.looseObject({
  error: z.string().optional(),
  errorCode: z.string().optional(),
  message: z.union([z.number(), z.string(), z.array(z.string())]),
  statusCode: z.number(),
});
type HttpErrorBody = z.infer<typeof httpErrorBodySchema>;

@Catch(HttpException)
export class MachineReadableHttpExceptionFilter implements ExceptionFilter<HttpException> {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: HttpException, host: ArgumentsHost): void {
    const adapter = this.adapterHost.httpAdapter;
    const response = host.switchToHttp().getResponse();
    const exceptionResponse = exception.getResponse();
    const parsedBody = httpErrorBodySchema.safeParse(exceptionResponse);
    const parsedMessage = z.string().safeParse(exceptionResponse);
    const body: HttpErrorBody = parsedBody.success
      ? parsedBody.data
      : {
          message: parsedMessage.success ? parsedMessage.data : exception.message,
          statusCode: exception.getStatus(),
        };

    if (exception.errorCode && !body.errorCode) {
      body.errorCode = exception.errorCode;
    }
    adapter.reply(response, body, exception.getStatus());
  }
}
