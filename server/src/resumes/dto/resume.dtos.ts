import { FULL_SAMPLE_RESUME, jsonResumeSchema, type JsonResume } from '@cvantage/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

import { zodDto } from '../../common';

export const RESUME_SORT_FIELDS = [
  'createdAt',
  'name',
  'lastAnalyzedAt',
  'analysisStatus',
] as const;

export const createResumeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  jsonResume: jsonResumeSchema,
});

export const updateResumeSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    jsonResume: jsonResumeSchema.optional(),
    version: z.number().int().min(0),
  })
  .refine((v) => v.name !== undefined || v.jsonResume !== undefined, {
    message: 'Provide name and/or jsonResume',
    path: ['name'],
  });

export const listResumesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(RESUME_SORT_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export class CreateResumeDto extends zodDto(createResumeSchema) {
  @ApiProperty({ example: 'Senior Engineer 2026', maxLength: 200 }) name!: string;
  @ApiProperty({
    description: 'json-resume document (all sections optional; placeholders are pruned)',
    example: FULL_SAMPLE_RESUME,
  })
  jsonResume!: JsonResume;
}

export class UpdateResumeDto extends zodDto(updateResumeSchema) {
  @ApiPropertyOptional({ example: 'Senior Engineer 2026 (v2)' }) name?: string;
  @ApiPropertyOptional({ description: 'Full replacement json-resume document' })
  jsonResume?: JsonResume;
  @ApiProperty({
    example: 3,
    description: 'Optimistic-concurrency token from GET (mismatch → 409 with currentVersion)',
  })
  version!: number;
}

export class ListResumesDto extends zodDto(listResumesSchema) {}

const LIST_ITEM_EXAMPLE = {
  id: '665f1c2d3e4f5a6b7c8d9e0f',
  name: 'Senior Engineer 2026',
  source: 'created',
  analysisStatus: 'completed',
  analysisCount: 2,
  lastAnalyzedAt: '2026-06-09T10:00:00.000Z',
  createdAt: '2026-06-01T09:00:00.000Z',
  updatedAt: '2026-06-09T10:00:00.000Z',
};

export class ResumeListItemDto {
  @ApiProperty({ example: LIST_ITEM_EXAMPLE.id }) id!: string;
  @ApiProperty({ example: LIST_ITEM_EXAMPLE.name }) name!: string;
  @ApiProperty({ enum: ['created', 'uploaded'], example: 'created' }) source!: string;
  @ApiProperty({
    enum: ['unanalyzed', 'in_progress', 'completed', 'failed'],
    example: 'completed',
    description: 'Dashboard status badge',
  })
  analysisStatus!: string;
  @ApiProperty({ example: 2 }) analysisCount!: number;
  @ApiPropertyOptional({ example: LIST_ITEM_EXAMPLE.lastAnalyzedAt }) lastAnalyzedAt?: string;
  @ApiProperty({ example: LIST_ITEM_EXAMPLE.createdAt, description: 'Upload/creation date' })
  createdAt!: string;
  @ApiProperty({ example: LIST_ITEM_EXAMPLE.updatedAt }) updatedAt!: string;
}

export class ResumeListDto {
  @ApiProperty({ type: [ResumeListItemDto], example: [LIST_ITEM_EXAMPLE] })
  items!: ResumeListItemDto[];
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) limit!: number;
  @ApiProperty({ example: 42 }) total!: number;
}

export const RESUME_DETAIL_EXAMPLE = {
  ...LIST_ITEM_EXAMPLE,
  version: 3,
  jsonResume: FULL_SAMPLE_RESUME,
};

export class ResumeDetailDto extends ResumeListItemDto {
  @ApiProperty({ example: 3, description: 'Optimistic-concurrency token for PATCH' })
  version!: number;
  @ApiProperty({ description: 'Full json-resume document' }) jsonResume!: JsonResume;
  @ApiPropertyOptional({
    description: 'Raw text extracted from the uploaded file (uploaded resumes only)',
  })
  originalText?: string;
  @ApiPropertyOptional({
    description: 'AI parse progress for uploaded resumes (#35/#42)',
    example: { status: 'completed', modelUsed: 'fake' },
  })
  uploadParse?: unknown;
}
