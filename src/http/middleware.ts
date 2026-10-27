/**
 * REST auth middleware: Bearer-token verification and role gating.
 */
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiError, Role, TokenPayload } from '../contracts/api';
import { Room } from '../rooms/room';
import { DEFAULT_ROOM_ID, RoomRegistry } from '../rooms/room.registry';
import { AccountIdentity, AuthService } from '../services/auth.service';

const BEARER_PREFIX = 'Bearer ';

/**
 * Privilege ordering. The Role enum's numeric codes are wire ids inherited
 * from the old protocol (0 player, 1 admin, …), not a privilege scale.
 */
const ROLE_RANK: Readonly<Record<Role, number>> = {
  [Role.Viewer]: 0,
  [Role.Player]: 1,
  [Role.Mc]: 2,
  [Role.Admin]: 3,
};

const VIEWER_IDENTITY: TokenPayload = { roleId: Role.Viewer };

/** Express request carrying the verified token identity and its room. */
export interface AuthedRequest extends Request {
  identity?: TokenPayload & { sessionId?: string; accountId?: string };
  room?: Room;
  account?: AccountIdentity;
}

/** The identity requireAuth stored on the request; Viewer when absent. */
export function identityOf(req: Request): TokenPayload {
  return (req as AuthedRequest).identity ?? VIEWER_IDENTITY;
}

export function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header || !header.startsWith(BEARER_PREFIX)) return undefined;
  return header.slice(BEARER_PREFIX.length);
}

/**
 * Verify the Bearer token and store its payload as `req.identity`.
 *
 * - With `minRole`: a missing/invalid token is a 401 and a valid token below
 *   the required rank is a 403 (both JSON ApiError). Admin-only guard:
 *   `requireAuth(auth, Role.Admin)`.
 * - Without `minRole`: public/viewer-friendly — a missing or invalid token
 *   degrades to a Viewer identity and the request proceeds.
 */
export function requireAuth(auth: AuthService, minRole?: Role): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const payload = auth.verifyToken(bearerToken(req));
    if (minRole !== undefined) {
      if (!payload) {
        const error: ApiError = { error: 'Missing or invalid token' };
        res.status(401).json(error);
        return;
      }
      if (ROLE_RANK[payload.roleId] < ROLE_RANK[minRole]) {
        const error: ApiError = { error: 'Insufficient role' };
        res.status(403).json(error);
        return;
      }
    }
    (req as AuthedRequest).identity = payload ?? VIEWER_IDENTITY;
    next();
  };
}

/**
 * Resolve the caller's room from its token (no token, or a room-less token,
 * means the default room) and store it as `req.room`. A token for a room
 * that no longer exists is a 404 — never silently the default room.
 * Mounted once in front of every /api and /media route.
 */
export function attachRoom(auth: AuthService, rooms: RoomRegistry): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const payload = auth.verifyToken(bearerToken(req));
    const room = rooms.get(payload?.roomId ?? DEFAULT_ROOM_ID);
    if (!room) {
      const error: ApiError = { error: 'Unknown room' };
      res.status(404).json(error);
      return;
    }
    rooms.touch(room);
    (req as AuthedRequest).room = room;
    next();
  };
}

/** The room attachRoom resolved for this request. */
export function roomOf(req: Request): Room {
  const room = (req as AuthedRequest).room;
  if (!room) throw new Error('roomOf() called on a route not behind attachRoom');
  return room;
}

/**
 * Host-only endpoints: require a bare account session (from account login)
 * and store it as `req.account`. 401 otherwise.
 */
export function requireAccount(auth: AuthService): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const account = auth.verifyAccount(bearerToken(req));
    if (!account) {
      const error: ApiError = { error: 'Host login required' };
      res.status(401).json(error);
      return;
    }
    (req as AuthedRequest).account = account;
    next();
  };
}

/** The account requireAccount resolved for this request. */
export function accountOf(req: Request): AccountIdentity {
  const account = (req as AuthedRequest).account;
  if (!account) throw new Error('accountOf() called on a route not behind requireAccount');
  return account;
}

/**
 * Hosted mode: the default room is not reachable — every game endpoint needs
 * a created room's session. Single-venue mode passes everything through.
 */
export function denyDefaultRoom(multiRoom: boolean): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (multiRoom && roomOf(req).id === DEFAULT_ROOM_ID) {
      const error: ApiError = { error: 'Join a room first' };
      res.status(404).json(error);
      return;
    }
    next();
  };
}

/**
 * A named route parameter as a string. Express 5 types params as
 * `string | string[]` because wildcards capture several segments; none of
 * our parameters are wildcards, so an array here would be a routing bug.
 */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value.join('/') : (value ?? '');
}
