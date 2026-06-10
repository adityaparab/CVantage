import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';

/**
 * SPA serving (issue #84 / 10.1, per CLAUDE.md): the server owns
 * frontend/dist in production - one port for everything.
 *  - hashed assets: Cache-Control: public, max-age=31536000, immutable
 *  - index.html: no-cache (deploys take effect immediately)
 *  - any non-/api GET without a file match -> index.html (deep links)
 *  - unknown /api/** stays a JSON 404 envelope (the global filter)
 *  - missing real files under /assets -> true 404, never the shell
 */
export function mountSpa(app: NestExpressApplication, distDir?: string): boolean {
  const dist = resolve(distDir ?? join(__dirname, '..', '..', '..', 'frontend', 'dist'));
  const indexHtml = join(dist, 'index.html');
  if (!existsSync(indexHtml)) return false; // dev mode: Vite serves the client

  const httpApp = app.getHttpAdapter().getInstance() as express.Express;

  httpApp.use(
    express.static(dist, {
      index: false, // index.html handled below with its own cache policy
      setHeaders: (res, filePath) => {
        if (/\.(?:js|css|woff2?|png|svg|jpg|jpeg|webp|ico)$/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  httpApp.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api')) return next(); // JSON 404 envelope
    if (req.path.startsWith('/assets/')) return next(); // real 404 for missing assets
    res.setHeader('Cache-Control', 'no-cache');
    return res.sendFile(indexHtml);
  });

  return true;
}
