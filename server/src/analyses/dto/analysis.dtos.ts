import { ApiProperty } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { z } from 'zod';

import { zodDto } from '../../common';
import { AnalysisStatus } from '../../database/schemas/common';

export const createAnalysisSchema = z.object({
  name: z.string().trim().min(1).max(200),
  jobDescription: z.string().trim().min(30).max(50_000),
  resumeId: z
    .string()
    .regex(/^[a-f0-9]{24}$/i, 'resumeId must be a Mongo ObjectId')
    .transform((v) => new Types.ObjectId(v)),
});

export class CreateAnalysisDto extends zodDto(createAnalysisSchema) {
  @ApiProperty({ example: 'Platform Engineer @ Acme', maxLength: 200 })
  declare name: string;

  @ApiProperty({
    description: 'Full job description text. Bounds: 30 to 50,000 characters.',
    example:
      'We are hiring a Senior Platform Engineer to own our NestJS services, MongoDB data layer and CI/CD platform...',
    minLength: 30,
    maxLength: 50_000,
  })
  declare jobDescription: string;

  @ApiProperty({
    description: 'Resume to analyze (must be yours)',
    example: '665f1c2ab79e8e3d4c8a9f01',
  })
  declare resumeId: Types.ObjectId;
}

export const listAnalysesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  resumeId: z
    .string()
    .regex(/^[a-f0-9]{24}$/i)
    .transform((v) => new Types.ObjectId(v))
    .optional(),
  status: z.enum(AnalysisStatus).optional(),
});

export class ListAnalysesDto extends zodDto(listAnalysesSchema) {
  @ApiProperty({ required: false, default: 1, minimum: 1 })
  declare page: number;

  @ApiProperty({ required: false, default: 20, minimum: 1, maximum: 100 })
  declare limit: number;

  @ApiProperty({ required: false, description: 'Only analyses of this resume' })
  declare resumeId?: Types.ObjectId;

  @ApiProperty({ required: false, enum: AnalysisStatus, description: 'Filter by status' })
  declare status?: AnalysisStatus;
}
