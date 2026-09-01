import type { Response } from "express";
import type { TopLevelBinaryResponse } from "./top-level.ports.js";

function isReadableStream(body: TopLevelBinaryResponse["body"]): body is NodeJS.ReadableStream {
  // SAFETY: The union member is a Node readable precisely when it exposes the stream pipe method.
  return typeof (body as NodeJS.ReadableStream).pipe === "function";
}

export function sendTopLevelBinaryResponse(
  response: Response,
  payload: TopLevelBinaryResponse,
): void {
  for (const [name, value] of Object.entries(payload.headers)) {
    response.setHeader(name, value);
  }
  if (isReadableStream(payload.body)) {
    payload.body.pipe(response);
    return;
  }
  response.send(Buffer.from(payload.body));
}
