import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Swagger model for the shared error envelope (#14). Every 4xx/5xx response
 * in the API references this schema (see ApiStandardErrors).
 */
export class ErrorEnvelopeDto {
  @ApiProperty({ example: 404 }) statusCode!: number;
  @ApiProperty({ example: 'Not Found', description: 'Machine-readable error name' })
  error!: string;
  @ApiProperty({
    example: 'Resume not found',
    description: 'Human-readable; generic for 5xx in production',
  })
  message!: string;
  @ApiPropertyOptional({
    description: 'Structured context — validation field issues, conflict info, etc.',
    example: [{ path: 'work[0].startDate', message: 'Date must be YYYY, YYYY-MM or YYYY-MM-DD' }],
  })
  details?: unknown;
  @ApiPropertyOptional({ example: '0d9af7a3-6a39-4c2e-9f5e-1c2d3e4f5a6b' }) requestId?: string;
  @ApiProperty({ example: '2026-06-10T12:34:56.789Z' }) timestamp!: string;
  @ApiProperty({ example: '/api/v1/resumes/665f1c2d3e4f5a6b7c8d9e0f' }) path!: string;
}
