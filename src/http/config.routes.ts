/**
 * Public runtime configuration: the knobs the frontend needs to stay in sync
 * with the server (game rules, player count, upload limit). Never exposes
 * secrets, paths, or the JWT key.
 */
import { Router } from 'express';
import { GameRules } from '../game.rules';
import type { ApiDeps } from './index';

export interface PublicConfig {
  rules: GameRules;
  playerCount: number;
  uploadLimitBytes: number;
}

export function createConfigRoutes(deps: ApiDeps): Router {
  const { config } = deps;
  const router = Router();

  router.get('/api/config', (_req, res) => {
    const body: PublicConfig = {
      rules: config.rules,
      playerCount: config.rules.playerCount,
      uploadLimitBytes: config.uploadLimitBytes,
    };
    res.json(body);
  });

  return router;
}
