/**
 * Secret → role resolution and JWT issue/verify.
 *
 * Mirrors the old verify-identity semantics: an unknown or missing secret is
 * never an error — it resolves to a Viewer identity, so login cannot fail.
 */
import { sign, verify } from 'jsonwebtoken';
import { ServerConfig } from '../config';
import { Role, TokenPayload } from '../contracts/api';

const JWT_ALGORITHM = 'HS256';

export class AuthService {
  constructor(private readonly config: ServerConfig) {}

  /**
   * Resolve a shared secret to a token payload. Player secrets map to
   * Role.Player with their 0-based player index; anything unknown is Viewer.
   */
  resolveRole(secret?: string): TokenPayload {
    if (secret !== undefined) {
      const playerIndex = this.config.playerSecrets.indexOf(secret);
      if (playerIndex !== -1) return { roleId: Role.Player, index: playerIndex };
      if (secret === this.config.adminSecret) return { roleId: Role.Admin };
      if (secret === this.config.mcSecret) return { roleId: Role.Mc };
    }
    return { roleId: Role.Viewer };
  }

  issueToken(payload: TokenPayload): string {
    const claims: TokenPayload = { roleId: payload.roleId };
    if (payload.index !== undefined) claims.index = payload.index;
    if (payload.roomId !== undefined) claims.roomId = payload.roomId;
    return sign(claims, this.config.jwtSecret, {
      algorithm: JWT_ALGORITHM,
      expiresIn: this.config.tokenTtlSeconds,
    });
  }

  /** Null on a missing, malformed, expired, or wrongly-signed token. */
  verifyToken(token?: string): TokenPayload | null {
    if (!token) return null;
    try {
      const decoded = verify(token, this.config.jwtSecret, {
        algorithms: [JWT_ALGORITHM],
      });
      if (typeof decoded === 'string') return null;
      const claims = decoded as Record<string, unknown>;
      const roleId = claims['roleId'];
      if (typeof roleId !== 'number' || !(roleId in Role)) return null;
      const payload: TokenPayload = { roleId: roleId as Role };
      const index = claims['index'];
      if (typeof index === 'number') payload.index = index;
      const roomId = claims['roomId'];
      if (typeof roomId === 'string') payload.roomId = roomId;
      return payload;
    } catch {
      return null;
    }
  }
}
