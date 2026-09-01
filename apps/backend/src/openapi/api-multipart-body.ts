import { ApiBody } from "@nestjs/swagger";
import type { SchemaObject } from "@nestjs/swagger";

interface StandardSchemaWithJsonSchema {
  "~standard": {
    jsonSchema?: {
      input(options: { target: "openapi-3.0" }): SchemaObject;
    };
  };
}

interface MultipartBodyOptions {
  fileField?: string;
  schema?: StandardSchemaWithJsonSchema;
}

export const MULTIPART_BODY_SCHEMA_METADATA = "arc/openapiMultipartBodySchema";

export function ApiMultipartBody({ fileField, schema }: MultipartBodyOptions): MethodDecorator {
  const converter = schema?.["~standard"].jsonSchema;
  const bodySchema = converter
    ? converter.input({ target: "openapi-3.0" })
    : { properties: {}, type: "object" as const };
  const properties = { ...bodySchema.properties };
  const required = [...(bodySchema.required ?? [])];

  if (fileField) {
    properties[fileField] = { format: "binary", type: "string" };
    if (!required.includes(fileField)) {
      required.push(fileField);
    }
  }

  const multipartSchema: SchemaObject = {
    ...bodySchema,
    properties,
    type: "object",
  };
  if (required.length) {
    multipartSchema.required = required;
  }
  const apiBody = ApiBody({
    required: true,
    schema: multipartSchema,
  });

  return (target, propertyKey, descriptor) => {
    apiBody(target, propertyKey, descriptor);
    if (!descriptor.value) {
      throw new TypeError("ApiMultipartBody can only decorate methods");
    }
    // SAFETY: MethodDecorator invocation guarantees descriptor.value is the decorated method.
    Reflect.defineMetadata(
      MULTIPART_BODY_SCHEMA_METADATA,
      multipartSchema,
      descriptor.value as object,
    );
  };
}
