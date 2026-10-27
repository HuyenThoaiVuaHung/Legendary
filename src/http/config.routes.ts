/**
 * Public runtime configuration and the admin settings menu.
 *
 * GET  /api/config  — the knobs the frontend needs (game rules, limits).
 * PATCH /api/config — admin edits the game rules live: the shared rules object
 * is mutated in place (so running handlers pick it up immediately), the change
 * is persisted to utils/config.json, and an 'update-config' socket event is
 * broadcast so every client refreshes.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { Router } from 'express';
import { join } from 'path';
import { Role } from '../contracts/api';
import { applyRuleOverrides, GameRules } from '../game.rules';
import { LogLevel } from '../logger';
import { requireAuth } from './middleware';
import type { ApiDeps } from './index';

export interface PublicConfig {
  rules: GameRules;
  playerCount: number;
  uploadLimitBytes: number;
}

const CONFIG_UPDATE_EVENT = 'update-config';
const CONFIG_FILE = join(__dirname, '..', '..', 'utils', 'config.json');

function persistRules(rules: GameRules, log: ApiDeps['log']): void {
  try {
    const existing = existsSync(CONFIG_FILE)
      ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
      : {};
    existing.rules = rules;
    writeFileSync(CONFIG_FILE, JSON.stringify(existing, null, 2));
  } catch (err) {
    log(`Could not persist rules to config.json: ${String(err)}`, LogLevel.Warn);
  }
}

export function createConfigRoutes(deps: ApiDeps): Router {
  const { io, auth, config, log } = deps;
  const router = Router();
  const adminOnly = requireAuth(auth, Role.Admin);

  const publicConfig = (): PublicConfig => ({
    rules: config.rules,
    playerCount: config.rules.playerCount,
    uploadLimitBytes: config.uploadLimitBytes,
  });

  router.get('/api/config', (_req, res) => {
    res.json(publicConfig());
  });

  router.patch('/api/config', adminOnly, (req, res) => {
    const patch = (req.body ?? {}) as Partial<GameRules>;
    const changed = applyRuleOverrides(config.rules, patch);
    if (changed.length === 0) {
      res.status(400).json({ error: 'No valid rule fields to update' });
      return;
    }
    persistRules(config.rules, log);
    log(`Rules updated via settings: ${changed.join(', ')}`);
    io.emit(CONFIG_UPDATE_EVENT, publicConfig());
    res.json(publicConfig());
  });

  return router;
}
