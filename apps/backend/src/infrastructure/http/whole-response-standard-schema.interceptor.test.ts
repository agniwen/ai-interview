import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { WholeResponseStandardSchemaInterceptor } from "./whole-response-standard-schema.interceptor.js";

describe("WholeResponseStandardSchemaInterceptor", () => {
  const interceptor = new WholeResponseStandardSchemaInterceptor(new Reflector());

  it("validates an array response against a top-level array schema", async () => {
    const response = [{ id: "batch-1" }];

    await expect(
      interceptor.serialize(response, z.array(z.object({ id: z.string() }))),
    ).resolves.toEqual(response);
  });

  it("keeps compatibility with Nest element schemas for array responses", async () => {
    const response = [{ id: "batch-1" }];

    await expect(interceptor.serialize(response, z.object({ id: z.string() }))).resolves.toEqual(
      response,
    );
  });
});
