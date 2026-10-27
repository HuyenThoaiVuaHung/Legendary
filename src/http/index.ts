/**
 * HTTP assembly: /api router (auth + rooms + match + media routes), the
 * /media file endpoints, and the static frontend with its SPA fallback.
 *
 * Every /api, /media and /rooms request first passes attachRoom, so route
 * handlers act on `roomOf(req)` — the room named by the caller's token.
 */
import express, { Express, Router } from 'express';
import { join, resolve } from 'path';
import { ServerConfig } from '../config';
import { LogFn } from '../logger';
import { RoomRegistry } from '../rooms/room.registry';
import { AuthService } from '../services/auth.service';
import { createAuthRoutes } from './auth.routes';
import { createConfigRoutes } from './config.routes';
import { createMatchRoutes } from './match.routes';
import { createMediaRoutes } from './media.routes';
import { attachRoom } from './middleware';
import { createRoomRoutes } from './room.routes';

/** Everything the REST layer may touch, wired once in the composition root. */
export interface ApiDeps {
  /** Per-request state (store, media, channel…) comes from `roomOf(req)`. */
  rooms: RoomRegistry;
  auth: AuthService;
  log: LogFn;
  config: ServerConfig;
}

export function createApiRouter(deps: ApiDeps): Router {
  const router = Router();
  router.use(['/api', '/media', '/rooms'], attachRoom(deps.auth, deps.rooms));
  router.use(createAuthRoutes(deps));
  router.use(createRoomRoutes(deps));
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
