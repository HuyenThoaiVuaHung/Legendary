/**
 * Room lifecycle: create, join by code, close.
 *
 * POST   /api/rooms         — anyone (rate-limited) creates a room and gets
 *                             its secrets plus an admin token.
 * POST   /api/rooms/join    — code [+ secret [+ username]] → a room token.
 *                             No secret: spectator. Player secret: needs a
 *                             username, which claims or reclaims a seat.
 *                             A wrong secret is a 401 (and counts against
 *                             the join rate limit), never a silent viewer.
 * DELETE /api/rooms/current — an admin closes their own (created) room.
 */
import { createHash, timingSafeEqual } from 'crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  API_PATHS,
  ApiError,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  Role,
  TokenPayload,
} from '../contracts/api';
import { DEFAULT_ROOM_ID } from '../rooms/room.registry';
import { requireAuth, roomOf } from './middleware';
import type { ApiDeps } from './index';

const MS_PER_SECOND = 1000;
const USERNAME_MAX_LENGTH = 32;

/** Constant-time string equality (hashing first equalizes the lengths). */
function secretMatches(given: string, expected: string): boolean {
  const digest = (value: string): Buffer => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

export function createRoomRoutes(deps: ApiDeps): Router {
  const { rooms, auth, config, log } = deps;
  const router = Router();

  const limiter = (limit: number, windowSeconds: number, message: string) =>
    rateLimit({
      windowMs: windowSeconds * MS_PER_SECOND,
      limit,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: message },
    });
  const createLimiter = limiter(
    config.roomCreateRateLimit,
    config.roomCreateRateWindowSeconds,
    'Too many rooms created, try again later',
  );
  const joinLimiter = limiter(
    config.roomJoinRateLimit,
    config.roomJoinRateWindowSeconds,
    'Too many join attempts, try again later',
  );

  router.post(API_PATHS.rooms, createLimiter, (_req, res) => {
    const room = rooms.create();
    if (!room?.meta) {
      const error: ApiError = { error: 'Server is at its room limit' };
      res.status(503).json(error);
      return;
    }
    const payload: TokenPayload = { roleId: Role.Admin, roomId: room.id };
    const response: CreateRoomResponse = {
      roomId: room.id,
      code: room.meta.code,
      secrets: room.meta.secrets,
      token: auth.issueToken(payload),
      roleId: Role.Admin,
    };
    res.status(201).json(response);
  });

  router.post(API_PATHS.joinRoom, joinLimiter, (req, res) => {
    const body = (req.body ?? {}) as JoinRoomRequest;
    const room = typeof body.code === 'string' ? rooms.byCode(body.code) : undefined;
    if (!room?.meta) {
      const error: ApiError = { error: 'No room with that code' };
      res.status(404).json(error);
      return;
    }
    const { secrets } = room.meta;
    const secret = typeof body.secret === 'string' ? body.secret.trim() : '';

    let payload: TokenPayload;
    if (secret === '') {
      payload = { roleId: Role.Viewer, roomId: room.id };
    } else if (secretMatches(secret, secrets.admin)) {
      payload = { roleId: Role.Admin, roomId: room.id };
    } else if (secretMatches(secret, secrets.mc)) {
      payload = { roleId: Role.Mc, roomId: room.id };
    } else if (secretMatches(secret, secrets.player)) {
      const username = typeof body.username === 'string' ? body.username.trim() : '';
      if (username === '' || username.length > USERNAME_MAX_LENGTH) {
        const error: ApiError = {
          error: `A username of 1–${USERNAME_MAX_LENGTH} characters is required`,
        };
        res.status(400).json(error);
        return;
      }
      const seat = room.claimSeat(username);
      if (seat === null) {
        const error: ApiError = { error: 'All player seats are taken' };
        res.status(409).json(error);
        return;
      }
      rooms.saveMeta(room);
      log(`Room ${room.id}: ${username} holds seat ${seat}`);
      payload = { roleId: Role.Player, index: seat, roomId: room.id };
    } else {
      const error: ApiError = { error: 'Wrong secret' };
      res.status(401).json(error);
      return;
    }

    const response: JoinRoomResponse = {
      token: auth.issueToken(payload),
      roleId: payload.roleId,
      roomId: room.id,
    };
    if (payload.index !== undefined) response.index = payload.index;
    res.json(response);
  });

  router.delete(API_PATHS.currentRoom, requireAuth(auth, Role.Admin), (req, res) => {
    const room = roomOf(req);
    if (room.id === DEFAULT_ROOM_ID) {
      const error: ApiError = { error: 'The default room cannot be closed' };
      res.status(400).json(error);
      return;
    }
    rooms.remove(room.id);
    res.status(204).end();
  });

  return router;
}
