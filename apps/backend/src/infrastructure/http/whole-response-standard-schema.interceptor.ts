import { StandardSchemaSerializerInterceptor } from "@nestjs/common";

type SerializerParameters = Parameters<StandardSchemaSerializerInterceptor["serialize"]>;
type SerializerResult = Awaited<ReturnType<StandardSchemaSerializerInterceptor["serialize"]>>;

/**
 * Nest applies a response schema to each array element. Our controller metadata
 * stores the complete response schema so the same metadata can generate OpenAPI.
 * Validate the complete array first, while retaining compatibility with Nest's
 * element-schema convention for any existing endpoint that uses it.
 */
export class WholeResponseStandardSchemaInterceptor extends StandardSchemaSerializerInterceptor {
  override async serialize(
    response: SerializerParameters[0],
    schema: SerializerParameters[1],
    validateOptions?: SerializerParameters[2],
  ): Promise<SerializerResult> {
    if (!(schema && Array.isArray(response))) {
      return super.serialize(response, schema, validateOptions);
    }

    try {
      return await this.transformToPlain(response, schema, validateOptions);
    } catch (wholeResponseError) {
      try {
        return await Promise.all(
          response.map((item) => this.transformToPlain(item, schema, validateOptions)),
        );
      } catch {
        throw wholeResponseError;
      }
    }
  }
}
