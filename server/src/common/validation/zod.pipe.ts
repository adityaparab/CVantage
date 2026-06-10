import { Injectable, PipeTransform, UnprocessableEntityException } from '@nestjs/common';
import type { ArgumentMetadata, Type } from '@nestjs/common';
import { ZodError, type ZodType } from 'zod';

/** DTO classes carry their zod schema; created via zodDto(schema). */
export interface ZodDtoClass extends Type<object> {
  zodSchema: ZodType;
}

/**
 * Creates a DTO class bound to a zod schema:
 *   class CreateResumeDto extends zodDto(createResumeSchema) {}
 * The global ZodValidationPipe validates and *replaces* the payload with
 * the parsed (coerced, stripped) value.
 */
export function zodDto<T extends ZodType>(schema: T): ZodDtoClass {
  class ZodDtoBase {
    static zodSchema = schema;
  }
  return ZodDtoBase as ZodDtoClass;
}

export function formatZodIssues(error: ZodError): { path: string; message: string }[] {
  return error.issues.map((i) => ({
    path: i.path
      .map((seg) => (typeof seg === 'number' ? `[${seg}]` : seg))
      .join('.')
      .replace(/\.\[/g, '['),
    message: i.message,
  }));
}

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const metatype = metadata.metatype as ZodDtoClass | undefined;
    const schema = metatype?.zodSchema;
    if (!schema) return value; // not a zod DTO — pass through untouched

    const result = schema.safeParse(value);
    if (!result.success) {
      throw new UnprocessableEntityException({
        error: 'Validation Failed',
        message: 'Request validation failed',
        details: formatZodIssues(result.error),
      });
    }
    return result.data;
  }
}
