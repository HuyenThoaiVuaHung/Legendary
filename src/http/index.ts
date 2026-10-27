/**
 * HTTP assembly: /api router (auth + match + media routes), the /media file
 * endpoint, and the static frontend with its SPA fallback.
 */
import express, { Express, Router } from 'express';
import { join, resolve } from 'path';
import { ServerConfig } from '../config';
import { LogFn } from '../logger';
import { AuthService } from '../services/auth.service';
import { LegionFileService } from '../services/legion-file.service';
import { MediaStore } from '../services/media.store';
import { GameSessionState } from '../state/game.state';
import { MatchStore } from '../state/match.store';
import type { RoomChannel } from '../rooms/room';
import { createAuthRoutes } from './auth.routes';
import { createConfigRoutes } from './config.routes';
import { createMatchRoutes } from './match.routes';
import { createMediaRoutes } from './media.routes';

/** Everything the REST layer may touch, wired once in the composition root. */
export interface ApiDeps {
  /** Broadcast channel of the room the REST layer serves (default room for now). */
  io: RoomChannel;
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
 * Serve /assets, then the built Legion frontend, then the SPA fallback.
 *
 * /assets is layered: a user-provided override dir is tried first, so operators
 * can replace the Legion brand images (logo, icon, placeholder) or add their own
 * assets simply by dropping files there; the bundled brand assets are the
 * defaults behind it. express.static calls next() on a miss, so each layer
 * falls through — and /assets/audio-assets/* (still bundled with the frontend)
 * falls all the way through to the frontend static handler.
 *
 * The GET-only SPA catch-all is registered last so it never shadows /api/*,
 * /media/*, or /assets/* — never use `app.use('*')` before the static handlers.
 */
export function mountFrontend(
  app: Express,
  frontendDir: string,
  assetsDir: string,
  assetsOverrideDir: string,
): void {
  const root = resolve(frontendDir);
  app.use('/assets', express.static(resolve(assetsOverrideDir)));
  app.use('/assets', express.static(resolve(assetsDir)));
  app.use(express.static(root));
  app.get('*', (_req, res) => {
    res.sendFile(join(root, 'index.html'));
  });
}
