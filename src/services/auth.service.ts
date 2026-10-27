/**
 * Credentials → server-side sessions, and bearer token → identity.
 *
 * Tokens are opaque (see SessionStore); nothing is decoded from them. A
 * session is either a room identity (roomId/role/seat, optionally entered by
 * a host account) or a bare account session used for host-only endpoints.
 *
 * The default room keeps the old verify-identity semantics: an unknown or
 * missing secret is never an error — it resolves to a Viewer identity.
 */
import { ServerConfig } from '../config';
import { Role, TokenPayload } from '../contracts/api';
import { SessionRecord, SessionStore } from './session.store';

/** A verified room identity, plus the session it came from. */
export interface RoomIdentity extends TokenPayload {
  sessionId: string;
  /** Set when a host entered the room from their account. */
  accountId?: string;
}

export interface AccountIdentity {
  sessionId: string;
  accountId: string;
}

export class AuthService {
  constructor(
    private readonly config: ServerConfig,
    readonly sessions: SessionStore,
  ) {}

  /**
   * Default-room secret → identity. Player secrets map to Role.Player with
   * their 0-based player index; anything unknown is Viewer.
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

  /** Start a room session; returns its bearer token. */
  issueToken(payload: TokenPayload & { accountId?: string; linkId?: string }): string {
    const session: Omit<SessionRecord, 'createdAt' | 'lastSeenAt'> = { roleId: payload.roleId };
    if (payload.index !== undefined) session.index = payload.index;
    if (payload.roomId !== undefined) session.roomId = payload.roomId;
    if (payload.accountId !== undefined) session.accountId = payload.accountId;
    if (payload.linkId !== undefined) session.linkId = payload.linkId;
    return this.sessions.create(session);
  }

  /** Start a bare host-account session; returns its bearer token. */
  issueAccountToken(accountId: string): string {
    return this.sessions.create({ accountId });
  }

  /** The room identity behind a token; null for unknown/expired/account-only. */
  verifyToken(token?: string): RoomIdentity | null {
    const session = this.sessions.get(token);
    if (!session || session.record.roleId === undefined) return null;
    const { roleId, index, roomId, accountId } = session.record;
    const identity: RoomIdentity = { roleId, sessionId: session.id };
    if (index !== undefined) identity.index = index;
    if (roomId !== undefined) identity.roomId = roomId;
    if (accountId !== undefined) identity.accountId = accountId;
    return identity;
  }

  /** The host account behind a bare account token; null otherwise. */
  verifyAccount(token?: string): AccountIdentity | null {
    const session = this.sessions.get(token);
    if (!session || session.record.accountId === undefined || session.record.roleId !== undefined) {
      return null;
    }
    return { sessionId: session.id, accountId: session.record.accountId };
  }
}
