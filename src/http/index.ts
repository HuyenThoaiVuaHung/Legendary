/**
 * HTTP assembly: /api router (auth + match + media routes), the /media file
 * endpoint, and the static frontend with its SPA fallback.
 */
import express, { Express, Router } from 'express';
import { join, resolve } from 'path';
import { Server } from 'socket.io';
import { ServerConfig } from '../config';
import { LogFn } from '../logger';
import { AuthService } from '../services/auth.service';
import { LegionFileService } from '../services/legion-file.service';
import { MediaStore } from '../services/media.store';
import { GameSessionState } from '../state/game.state';
import { MatchStore } from '../state/match.store';
import { createAuthRoutes } from './auth.routes';
import { createConfigRoutes } from './config.routes';
import { createMatchRoutes } from './match.routes';
import { createMediaRoutes } from './media.routes';

/** Everything the REST layer may touch, wired once in the composition root. */
export interface ApiDeps {
  io: Server;
  store: MatchStore;
  session: GameSessionState;
  auth: AuthService;
  media: MediaStore;
  legionFiles: LegionFileService;
  log: LogFn;
  config: ServerConfig;
}

export function createApiRouter(deps: ApiDeps): Router {
  const router = Router();
  router.use(createAuthRoutes(deps));
  router.use(createConfigRoutes(deps));
  router.use(createMatchRoutes(deps));
  router.use(createMediaRoutes(deps));
  return router;
}

/**
 * Serve the built Legion frontend. Static assets are registered first; the
 * SPA fallback is a GET-only catch-all registered after them (and after the
 * API router in the composition root), so it never shadows /api/* or
 * /media/* — never use `app.use('*')` before the static handler.
 */
export function mountFrontend(app: Express, frontendDir: string): void {
  const root = resolve(frontendDir);
  app.use(express.static(root));
  app.get('*', (_req, res) => {
    res.sendFile(join(root, 'index.html'));
  });
}
