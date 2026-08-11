/**
 * REST auth middleware: Bearer-token verification and role gating.
 */
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiError, Role, TokenPayload } from '../contracts/api';
import { AuthService } from '../services/auth.service';

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

/** Express request carrying the verified token identity. */
export interface AuthedRequest extends Request {
  identity?: TokenPayload;
}

/** The identity requireAuth stored on the request; Viewer when absent. */
export function identityOf(req: Request): TokenPayload {
  return (req as AuthedRequest).identity ?? VIEWER_IDENTITY;
}

function bearerToken(req: Request): string | undefined {
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
