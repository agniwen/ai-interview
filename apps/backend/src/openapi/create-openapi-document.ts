import type { INestApplication } from "@nestjs/common";
import { ModulesContainer } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { OpenAPIObject, SchemaObject } from "@nestjs/swagger";
import { z } from "zod";

const HTTP_METHODS = ["delete", "get", "head", "options", "patch", "post", "put", "trace"] as const;

interface StandardSchemaWithJsonSchema {
  "~standard": {
    jsonSchema?: {
      output(options: { target: "openapi-3.0" }): SchemaObject;
    };
  };
}

const NEST_ERROR_SCHEMA: SchemaObject = {
  additionalProperties: false,
  properties: {
    error: { type: "string" },
    errorCode: { type: "string" },
    message: { oneOf: [{ type: "string" }, { items: { type: "string" }, type: "array" }] },
    statusCode: { type: "integer" },
  },
  required: ["message", "statusCode"],
  type: "object",
};

function responseSchemasByOperationId(app: INestApplication): Map<string, object> {
  const result = new Map<string, object>();
  for (const nestModule of app.get(ModulesContainer).values()) {
    for (const wrapper of nestModule.controllers.values()) {
      // SAFETY: Nest controller metatypes expose their method-bearing prototype at runtime.
      const prototype = wrapper.metatype?.prototype as object | undefined;
      if (!prototype) {
        continue;
      }
      for (const property of Object.getOwnPropertyNames(prototype)) {
        const handlerValue = Object.getOwnPropertyDescriptor(prototype, property)?.value;
        const handlerResult = z.function().safeParse(handlerValue);
        if (!handlerResult.success) {
          continue;
        }
        // SAFETY: z.function() has just established that this original descriptor value is callable;
        // retaining the original value is required because decorators attach metadata to its identity.
        const handler = handlerValue as object;
        // SAFETY: Swagger's decorator stores ApiOperation metadata under this stable metadata key.
        const operation = Reflect.getMetadata("swagger/apiOperation", handler) as
          | { operationId?: string }
          | undefined;
        // SAFETY: Nest's serializer decorator stores its options under this stable metadata key.
        const serializer = Reflect.getMetadata("class_serializer:options", handler) as
          | { schema?: StandardSchemaWithJsonSchema }
          | undefined;
        const operationId = operation?.operationId;
        const converter = serializer?.schema?.["~standard"].jsonSchema;
        if (operationId && converter) {
          try {
            result.set(operationId, converter.output({ target: "openapi-3.0" }));
          } catch (error) {
            throw new Error(`Cannot generate the OpenAPI response schema for ${operationId}`, {
              cause: error,
            });
          }
        }
      }
    }
  }
  return result;
}

function enrichResponseSchemas(app: INestApplication, document: OpenAPIObject): OpenAPIObject {
  const schemas = responseSchemasByOperationId(app);
  for (const path of Object.values(document.paths)) {
    if (!path) {
      continue;
    }
    for (const method of HTTP_METHODS) {
      const operation = path[method];
      if (!operation) {
        continue;
      }
      const schema = operation.operationId ? schemas.get(operation.operationId) : undefined;
      if (schema) {
        for (const [status, response] of Object.entries(operation.responses)) {
          if (/^2\d\d$/.test(status) && response && !("$ref" in response)) {
            response.content ??= {};
            response.content["application/json"] = { schema };
          }
        }
      }
      operation.responses.default ??= {
        content: { "application/json": { schema: NEST_ERROR_SCHEMA } },
        description: "Nest standard error envelope",
      };
    }
  }
  return document;
}

export function createBackendOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle("ARC Backend API")
    .setDescription("Standalone ARC backend API")
    .setVersion("1.0.0")
    .build();
  return enrichResponseSchemas(app, SwaggerModule.createDocument(app, config));
}
