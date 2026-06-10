import { applyDecorators } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';

/** Shared offset-pagination query docs (#18) — referenced by every list endpoint. */
export function ApiPagination(sortFields: readonly string[]): MethodDecorator {
  return applyDecorators(
    ApiQuery({
      name: 'page',
      required: false,
      schema: { type: 'integer', minimum: 1, default: 1 },
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    }),
    ApiQuery({
      name: 'sortBy',
      required: false,
      schema: { type: 'string', enum: [...sortFields], default: sortFields[0] },
    }),
    ApiQuery({
      name: 'order',
      required: false,
      schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
    }),
  );
}
