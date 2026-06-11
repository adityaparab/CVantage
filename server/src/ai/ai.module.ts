import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AiModel, AiModelSchema } from '../database/schemas/ai-model.schema';

import { AiModelsService } from './ai-models.service';
import { AnonymizationService } from './anonymize.service';
import { CryptoService } from './crypto.service';
import { FakeLlmProvider } from './fake-llm.provider';
import { LlmService } from './llm.service';

/**
 * AI platform foundation (issue #38 / 4.1): key crypto + model registry.
 * LlmService (#39/#40), the job runner (#41) and the pipelines (#42/#43)
 * mount here as Phase 4 progresses.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: AiModel.name, schema: AiModelSchema }])],
  providers: [CryptoService, AiModelsService, FakeLlmProvider, LlmService, AnonymizationService],
  exports: [CryptoService, AiModelsService, LlmService, AnonymizationService],
})
export class AiModule {}
