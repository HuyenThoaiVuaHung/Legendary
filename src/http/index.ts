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
import { AccountStore } from '../services/account.store';
import { AuthService } from '../services/auth.service';
import { createAccountRoutes } from './account.routes';
import { createAuthRoutes } from './auth.routes';
import { createConfigRoutes } from './config.routes';
import { createMatchRoutes } from './match.routes';
import { createMediaRoutes } from './media.routes';
import { attachRoom, denyDefaultRoom } from './middleware';
import { createRoomRoutes } from './room.routes';

/** Everything the REST layer may touch, wired once in the composition root. */
export interface ApiDeps {
  /** Per-request state (store, media, channel…) comes from `roomOf(req)`. */
  rooms: RoomRegistry;
  auth: AuthService;
  accounts: AccountStore;
  log: LogFn;
  config: ServerConfig;
}

export function createApiRouter(deps: ApiDeps): Router {
  const router = Router();
  const { multiRoom } = deps.config;
  router.use(['/api', '/media', '/rooms'], attachRoom(deps.auth, deps.rooms));
  if (multiRoom) {
    // Hosted: host accounts + rooms; the legacy secret login does not exist.
    router.use(createAccountRoutes(deps, deps.accounts));
    router.use(createRoomRoutes(deps, deps.accounts));
  } else {
    // Single venue: the legacy secret login; no room or account endpoints.
    router.use(createAuthRoutes(deps));
  }
  // In hosted mode the default room is unreachable through any game endpoint.
  router.use(
    ['/api/match', '/api/rounds', '/api/config', '/api/media', '/media'],
    denyDefaultRoom(multiRoom),
  );
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
  // Express 5 path syntax: a named wildcard replaces the bare '*'.
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(join(root, 'index.html'));
  });
}
