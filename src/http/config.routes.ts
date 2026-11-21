/**
 * Public runtime configuration and the admin settings menu.
 *
 * GET  /api/config  — the knobs the frontend needs (game rules, limits).
 * PATCH /api/config — admin edits the room rules live, persists the change,
 * and broadcasts an 'update-config' socket event to the room.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { Router } from 'express';
import { join } from 'path';
import { PublicUi, Role } from '../contracts/api';
import { applyRuleOverrides, GameRules } from '../game.rules';
import { LogLevel } from '../logger';
import { Room } from '../rooms/room';
import { publicUi } from './branding';
import { DEFAULT_ROOM_ID } from '../rooms/room.registry';
import { requireAuth, roomOf } from './middleware';
import type { ApiDeps } from './index';

export interface PublicConfig {
  rules: GameRules;
  ui: PublicUi;
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

export function publicConfig(room: Room, config: ApiDeps['config']): PublicConfig {
  return { rules: room.rules, ui: publicUi(room), playerCount: room.rules.playerCount, uploadLimitBytes: config.uploadLimitBytes };
}

export function createConfigRoutes(deps: ApiDeps): Router {
  const { auth, config, log } = deps;
  const router = Router();
  const adminOnly = requireAuth(auth, Role.Admin);

  router.get('/api/config', (req, res) => {
    const room = roomOf(req);
    res.json(publicConfig(room, config));
  });

  router.patch('/api/config', adminOnly, (req, res) => {
    const room = roomOf(req);
    const patch = (req.body ?? {}) as Partial<GameRules>;
    const changed = applyRuleOverrides(room.rules, patch);
    if (changed.length === 0) {
      res.status(400).json({ error: 'No valid rule fields to update' });
      return;
    }
    if (room.id === DEFAULT_ROOM_ID) {
      persistRules(room.rules, log);
    } else {
      deps.rooms.saveMeta(room);
    }
    log(`Rules updated via settings: ${changed.join(', ')}`);
    room.channel.emit(CONFIG_UPDATE_EVENT, publicConfig(room, config));
    res.json(publicConfig(room, config));
  });

  return router;
}
