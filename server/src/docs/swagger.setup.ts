import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

import { ErrorEnvelopeDto } from '../common/docs/error-envelope.dto';
import { AppConfigService } from '../config';

export const API_TAGS: ReadonlyArray<{ name: string; description: string }> = [
  { name: 'health', description: 'Liveness/readiness probes consumed by Docker and Railway' },
  { name: 'auth', description: 'Registration, login and (from #23) token lifecycle' },
  { name: 'users', description: 'Authenticated self-service: profile and password' },
  // Tags register here as their modules land: auth (#21), users (#27),
  // resumes (#31), analyses (#43), notifications (#48), admin (#52), export (#81).
];

/**
 * Swagger/OpenAPI wiring (issue #18 / 1.9).
 * - UI at /api/docs, raw spec at /api/docs-json and /api/docs-yaml
 * - gated by SWAGGER_ENABLED (defaults: on outside production)
 * - bearer + cookie auth schemes for the Phase 2 endpoints
 * - the documentation contract itself is enforced by docs.spec.ts
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('CVantage API')
    .setDescription(
      'AI-powered resume analysis platform. Every error response uses the shared ' +
        'ErrorEnvelope schema; list endpoints share the offset pagination parameters.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Access token' },
      'bearer',
    )
    .addCookieAuth('cvantage.access', {
      type: 'apiKey',
      in: 'cookie',
      description: 'httpOnly access-token cookie (browser clients)',
    });
  for (const tag of API_TAGS) builder.addTag(tag.name, tag.description);

  return SwaggerModule.createDocument(app, builder.build(), {
    extraModels: [ErrorEnvelopeDto],
  });
}

export function setupSwagger(app: INestApplication): OpenAPIObject | undefined {
  const config = app.get(AppConfigService);
  if (!config.core.swaggerEnabled) return undefined;

  const document = buildOpenApiDocument(app);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    yamlDocumentUrl: 'api/docs-yaml',
    customSiteTitle: 'CVantage API Docs',
  });
  return document;
}
