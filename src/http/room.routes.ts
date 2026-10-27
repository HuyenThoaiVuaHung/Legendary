/**
 * Room lifecycle and room administration (hosted mode only).
 *
 * POST   /api/rooms                  — a logged-in host creates a room
 *                                      (rate-limited per IP, capped per
 *                                      account and per server).
 * POST   /api/rooms/:id/enter        — the owning host gets an admin session.
 * POST   /api/rooms/join             — code [+ secret [+ username]] → session.
 *                                      No secret: spectator. Player secret
 *                                      + username: claims a free seat; a held
 *                                      seat is reclaimable only by the session
 *                                      that holds it. A wrong secret is a 401
 *                                      (counted by the join limiter).
 * DELETE /api/rooms/current          — an admin closes the room.
 * POST   /api/rooms/current/secrets  — rotate one role's secret; that role's
 *                                      sessions are revoked (except the caller).
 * DELETE /api/rooms/current/seats/:i — free a seat; its player is logged out.
 * POST   /api/rooms/current/transfer — the owner hands the room to another host.
 * POST   /api/rooms/current/save-to-bank — the owner saves the current match.
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { Request, Response, Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  API_PATHS,
  ApiError,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  Role,
  RoomInfo,
  RoomSecrets,
  RotateSecretRequest,
  TokenPayload,
  TransferRoomRequest,
} from '../contracts/api';
import { Room } from '../rooms/room';
import { DEFAULT_ROOM_ID } from '../rooms/room.registry';
import { BankStore } from '../services/bank.store';
import { QuotaError } from '../services/legion-file.service';
import { bankError } from './bank.routes';
import { AccountStore } from '../services/account.store';
import { AuthedRequest, accountOf, bearerToken, identityOf, param, requireAccount, requireAuth, roomOf } from './middleware';
import type { ApiDeps } from './index';

const MS_PER_SECOND = 1000;
const USERNAME_MAX_LENGTH = 32;
const ROTATABLE_ROLES: readonly (keyof RoomSecrets)[] = ['admin', 'mc', 'player'];
const ROLE_OF_SECRET: Readonly<Record<keyof RoomSecrets, Role>> = {
  admin: Role.Admin,
  mc: Role.Mc,
  player: Role.Player,
};
/** Same shapes the registry generates (see room.registry.ts). */
const TYPEABLE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SECRET_LENGTH: Readonly<Record<'mc' | 'player', number>> = { mc: 8, player: 6 };
const ADMIN_SECRET_BYTES = 12;

/** Constant-time string equality (hashing first equalizes the lengths). */
function secretMatches(given: string, expected: string): boolean {
  const digest = (value: string): Buffer => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

function newSecret(role: keyof RoomSecrets): string {
  if (role === 'admin') return randomBytes(ADMIN_SECRET_BYTES).toString('base64url');
  let out = '';
  for (let i = 0; i < SECRET_LENGTH[role]; i++) {
    out += TYPEABLE_ALPHABET[randomInt(TYPEABLE_ALPHABET.length)];
  }
  return out;
}

function fail(res: Response, status: number, message: string): void {
  const error: ApiError = { error: message };
  res.status(status).json(error);
}

/** Created rooms only: the default room has no meta, secrets, or seats. */
function createdRoomOf(req: Request, res: Response): (Room & { meta: NonNullable<Room['meta']> }) | null {
  const room = roomOf(req);
  if (room.id === DEFAULT_ROOM_ID || !room.meta) {
    fail(res, 400, 'Not available for the default room');
    return null;
  }
  return room as Room & { meta: NonNullable<Room['meta']> };
}

export function createRoomRoutes(deps: ApiDeps, accounts: AccountStore, bank: BankStore): Router {
  const { rooms, auth, config, log } = deps;
  const router = Router();
  const adminOnly = requireAuth(auth, Role.Admin);
  const hostOnly = requireAccount(auth);

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

  router.post(API_PATHS.rooms, hostOnly, createLimiter, async (req, res) => {
    const { accountId } = accountOf(req);
    if (rooms.ownedBy(accountId).length >= config.maxRoomsPerAccount) {
      fail(res, 409, `A host may own at most ${config.maxRoomsPerAccount} rooms`);
      return;
    }
    const room = rooms.create(accountId);
    if (!room?.meta) {
      fail(res, 503, 'Server is at its room limit');
      return;
    }
    const bankItemId = req.body?.bankItemId;
    if (bankItemId !== undefined) {
      const archive = typeof bankItemId === 'string' ? bank.read(accountId, bankItemId) : undefined;
      if (!archive) {
        rooms.remove(room.id);
        fail(res, 404, 'No such bank item');
        return;
      }
      try {
        await room.legionFiles.importArchive(archive, {
          maxMediaBytes: room.quotaRemaining(config.roomMediaQuotaBytes),
        });
      } catch (err) {
        rooms.remove(room.id);
        if (err instanceof QuotaError) {
          fail(res, 413, 'Room storage is full');
          return;
        }
        fail(res, 400, err instanceof Error ? err.message : String(err));
        return;
      }
    }
    const response: CreateRoomResponse = {
      roomId: room.id,
      code: room.meta.code,
      ownerAccountId: accountId,
      secrets: room.meta.secrets,
      token: auth.issueToken({ roleId: Role.Admin, roomId: room.id, accountId }),
      roleId: Role.Admin,
    };
    res.status(201).json(response);
  });

  router.post('/api/rooms/:roomId/enter', hostOnly, (req, res) => {
    const { accountId } = accountOf(req);
    const room = rooms.get(param(req, 'roomId'));
    if (!room?.meta || room.meta.ownerAccountId !== accountId) {
      // Same answer for "missing" and "not yours": don't confirm room ids.
      fail(res, 404, 'No such room');
      return;
    }
    const response: JoinRoomResponse = {
      token: auth.issueToken({ roleId: Role.Admin, roomId: room.id, accountId }),
      roleId: Role.Admin,
      roomId: room.id,
    };
    res.json(response);
  });

  router.post(API_PATHS.joinRoom, joinLimiter, (req, res) => {
    const body = (req.body ?? {}) as JoinRoomRequest;
    const room = typeof body.code === 'string' ? rooms.byCode(body.code) : undefined;
    if (!room?.meta) {
      fail(res, 404, 'No room with that code');
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
        fail(res, 400, `A username of 1–${USERNAME_MAX_LENGTH} characters is required`);
        return;
      }
      const held = room.seatOf(username);
      let seat: number | null;
      if (held !== -1) {
        // Only the session already holding this seat may reclaim it.
        const current = auth.verifyToken(bearerToken(req));
        const ownsSeat =
          current?.roomId === room.id && current.roleId === Role.Player && current.index === held;
        if (!ownsSeat) {
          fail(res, 409, 'That username already holds a seat; ask the room admin to release it');
          return;
        }
        auth.sessions.revoke(current.sessionId);
        seat = held;
      } else {
        seat = room.claimFreeSeat(username);
        if (seat === null) {
          fail(res, 409, 'All player seats are taken');
          return;
        }
        rooms.saveMeta(room);
        log(`Room ${room.id}: ${username} holds seat ${seat}`);
      }
      payload = { roleId: Role.Player, index: seat, roomId: room.id };
    } else {
      fail(res, 401, 'Wrong secret');
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

  router.post(API_PATHS.saveToBank, adminOnly, async (req, res) => {
    const room = createdRoomOf(req, res);
    if (!room) return;
    const accountId = (req as AuthedRequest).identity?.accountId;
    if (!accountId || accountId !== room.meta.ownerAccountId) {
      fail(res, 403, 'Only the room owner can save to the bank');
      return;
    }
    const { name, bankItemId } = req.body ?? {};
    if (bankItemId !== undefined && typeof bankItemId !== 'string') {
      fail(res, 404, 'No such bank item');
      return;
    }
    try {
      const archive = await room.legionFiles.exportArchive();
      const matchName = room.store.getMatch().matchName;
      if (bankItemId !== undefined) {
        const item = bank.replace(accountId, bankItemId, matchName, archive.buffer);
        if (!item) {
          fail(res, 404, 'No such bank item');
          return;
        }
        res.json(item);
      } else {
        const item = bank.add(
          accountId,
          name === undefined ? matchName : name,
          matchName,
          archive.buffer,
        );
        res.status(201).json(item);
      }
    } catch (err) {
      bankError(res, err);
    }
  });

  router.get(API_PATHS.currentRoom, requireAuth(auth), (req, res) => {
    const room = createdRoomOf(req, res);
    if (!room) return;
    const info: RoomInfo = {
      roomId: room.id,
      code: room.meta.code,
      expiresAt: room.expiresAt(config.roomIdleTtlSeconds * MS_PER_SECOND, config.roomMaxTtlSeconds * MS_PER_SECOND),
      seats: room.meta.seats,
      ownerAccountId: room.meta.ownerAccountId,
      mediaBytes: room.media.usageBytes(),
      mediaQuotaBytes: config.roomMediaQuotaBytes,
    };
    if (identityOf(req).roleId === Role.Admin) info.secrets = room.meta.secrets;
    res.json(info);
  });

  router.delete(API_PATHS.currentRoom, adminOnly, (req, res) => {
    const room = createdRoomOf(req, res);
    if (!room) return;
    rooms.remove(room.id);
    res.status(204).end();
  });

  router.post(API_PATHS.rotateSecret, adminOnly, (req, res) => {
    const room = createdRoomOf(req, res);
    if (!room) return;
    const { role } = (req.body ?? {}) as RotateSecretRequest;
    if (!ROTATABLE_ROLES.includes(role)) {
      fail(res, 400, `role must be one of: ${ROTATABLE_ROLES.join(', ')}`);
      return;
    }
    room.meta.secrets[role] = newSecret(role);
    rooms.saveMeta(room);
    const callerSession = (req as AuthedRequest).identity?.sessionId;
    const roleId = ROLE_OF_SECRET[role];
    const revoked = rooms.revokeSessions(
      room.id,
      // Host-entered admin sessions come from the account, not the secret.
      (record) => record.roleId === roleId && !(role === 'admin' && record.accountId !== undefined),
      callerSession,
    );
    log(`Room ${room.id}: rotated ${role} secret, revoked ${revoked} session(s)`);
    res.json(room.meta.secrets);
  });

  router.delete('/api/rooms/current/seats/:index', adminOnly, (req, res) => {
    const room = createdRoomOf(req, res);
    if (!room) return;
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0 || index >= room.meta.seats.length) {
      fail(res, 400, `Seat index out of range: ${req.params.index}`);
      return;
    }
    const holder = room.releaseSeat(index);
    rooms.saveMeta(room);
    rooms.revokeSessions(room.id, (record) => record.roleId === Role.Player && record.index === index);
    log(`Room ${room.id}: released seat ${index}${holder ? ` (${holder})` : ''}`);
    res.status(204).end();
  });

  router.post(API_PATHS.transferRoom, adminOnly, (req, res) => {
    const room = createdRoomOf(req, res);
    if (!room) return;
    const callerAccount = (req as AuthedRequest).identity?.accountId;
    if (callerAccount !== room.meta.ownerAccountId) {
      fail(res, 403, 'Only the room owner can transfer it');
      return;
    }
    const { username } = (req.body ?? {}) as TransferRoomRequest;
    const target = typeof username === 'string' ? accounts.byUsername(username) : undefined;
    if (!target) {
      fail(res, 404, 'No host with that username');
      return;
    }
    if (rooms.ownedBy(target.id).length >= config.maxRoomsPerAccount) {
      fail(res, 409, 'That host already owns the maximum number of rooms');
      return;
    }
    const previousOwner = room.meta.ownerAccountId;
    room.meta.ownerAccountId = target.id;
    rooms.saveMeta(room);
    // The previous owner's account-entered admin sessions end with ownership.
    rooms.revokeSessions(room.id, (record) => record.accountId === previousOwner);
    log(`Room ${room.id}: ownership transferred to ${target.username}`);
    res.status(204).end();
  });

  return router;
}
