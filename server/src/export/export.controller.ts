import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';

import { CurrentUser } from '../auth/decorators';
import type { RequestUser } from '../auth/request-user';
import { AppException } from '../common';
import { ApiStandardErrors } from '../common/docs/api-standard-errors.decorator';
import { ObjectIdPipe } from '../common/validation/object-id.pipe';

import { ExportService } from './export.service';
import type { ExportFormat } from './export.service';

const formatSchema = z.enum(['docx', 'pdf']);

/** Resume export endpoints (issue #81 / 9.4). */
@ApiTags('Resumes')
@Controller('resumes')
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  @Get(':id/export')
  @ApiOperation({
    summary: 'Export a resume as DOCX or PDF',
    description:
      'Streams the rendered file for download. DOCX maps every json-resume ' +
      'section with print typography (docx package); PDF renders a dedicated ' +
      'print template via headless chromium. Owner only - foreign ids are an ' +
      'existence-hiding 404 and deleted resumes are 410. Renders are cached ' +
      'per resume version for 10 minutes and concurrency-limited ' +
      '(EXPORT_CONCURRENCY). PDF requires PUPPETEER_EXECUTABLE_PATH on the ' +
      'deployment; otherwise it responds 503.',
  })
  @ApiParam({ name: 'id', description: 'Resume identifier', example: '665f1c2db79e8e3d4c8a9f05' })
  @ApiQuery({ name: 'format', enum: ['docx', 'pdf'], example: 'pdf' })
  @ApiProduces(
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  @ApiOkResponse({
    description:
      'The file stream. Content-Disposition carries the slugged resume name, e.g. `attachment; filename="backend-resume.pdf"`.',
    schema: { example: '(binary file stream)' },
  })
  @ApiStandardErrors(400, 401, 404, 410, 503)
  async export(
    @CurrentUser() user: RequestUser,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
    @Query('format') formatRaw: string,
    @Res() res: Response,
  ): Promise<void> {
    const parsed = formatSchema.safeParse(formatRaw);
    if (!parsed.success) {
      throw new AppException(400, 'Bad Request', 'format must be docx or pdf', {
        received: formatRaw ?? null,
      });
    }
    const format: ExportFormat = parsed.data;
    const out = await this.exports.export(new Types.ObjectId(user.id), id, format);
    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    res.setHeader('Content-Length', String(out.buffer.length));
    res.end(out.buffer);
  }
}
