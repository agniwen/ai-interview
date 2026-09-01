import type { Response } from "express";
import type { HttpBinaryResponse } from "./http.ports.js";

function isReadableStream(body: HttpBinaryResponse["body"]): body is NodeJS.ReadableStream {
  // SAFETY: The union member is a Node readable precisely when it exposes the stream pipe method.
  return typeof (body as NodeJS.ReadableStream).pipe === "function";
}

export function sendHttpBinaryResponse(response: Response, payload: HttpBinaryResponse): void {
  for (const [name, value] of Object.entries(payload.headers)) {
    response.setHeader(name, value);
  }
  if (isReadableStream(payload.body)) {
    payload.body.pipe(response);
    return;
  }
  response.send(Buffer.from(payload.body));
}
