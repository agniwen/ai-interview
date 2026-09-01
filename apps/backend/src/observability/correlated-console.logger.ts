/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type -- Overrides must retain Nest ConsoleLogger's public unknown message and structured parameter contracts before adding correlation metadata. */
import { ConsoleLogger } from "@nestjs/common";
import type { LogLevel } from "@nestjs/common";
import { getRequestCorrelationId } from "./request-correlation.context.js";

interface JsonLogOptions {
  context: string;
  errorStack?: unknown;
  logLevel: LogLevel;
  params?: Record<string, unknown>;
  writeStreamType?: "stderr" | "stdout";
}

export class CorrelatedConsoleLogger extends ConsoleLogger {
  protected override getJsonLogObject(message: unknown, options: JsonLogOptions) {
    const logObject = super.getJsonLogObject(message, options);
    const correlationId = getRequestCorrelationId();
    return correlationId ? { ...logObject, correlationId } : logObject;
  }

  protected override formatMessage(
    logLevel: LogLevel,
    message: unknown,
    pidMessage: string,
    formattedLogLevel: string,
    contextMessage: string,
    timestampDiff: string,
    params?: Record<string, unknown>,
  ): string {
    const formatted = super.formatMessage(
      logLevel,
      message,
      pidMessage,
      formattedLogLevel,
      contextMessage,
      timestampDiff,
      params,
    );
    const correlationId = getRequestCorrelationId();
    return correlationId ? `${formatted.trimEnd()} correlationId=${correlationId}\n` : formatted;
  }
}
