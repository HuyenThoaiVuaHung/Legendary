/**
 * Server-side sessions: the token a client holds is an opaque random string;
 * everything it grants lives here. Revoking is deleting the record.
 *
 * Tokens are never stored — only their SHA-256 — so a leaked sessions file
 * cannot be replayed. Records persist to disk, so a restart logs nobody out.
 * Expiry is sliding (idle TTL) with a hard cap (max TTL).
 */
import { createHash, randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { Role } from '../contracts/api';
import { LogFn, LogLevel } from '../logger';

/** 32 random bytes: 256-bit, unguessable bearer tokens. */
const TOKEN_BYTES = 32;
/** Persist a refreshed lastSeenAt at most this often per session. */
const TOUCH_PERSIST_INTERVAL_MS = 10 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export interface SessionRecord {
  /** Room sessions: the identity inside one room. */
  roomId?: string;
  roleId?: Role;
  /** Player seat (0-based); only with Role.Player. */
  index?: number;
  /** Account sessions, and room sessions a host entered from their account. */
  accountId?: string;
  createdAt: number;
  lastSeenAt: number;
}

export type NewSession = Omit<SessionRecord, 'createdAt' | 'lastSeenAt'>;

export interface Session {
  /** Stable id (the token's hash); safe to log and to keep on sockets. */
  id: string;
  record: SessionRecord;
}

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly lastPersistedTouch = new Map<string, number>();

  constructor(
    private readonly path: string,
    private readonly idleTtlMs: number,
    private readonly maxTtlMs: number,
    private readonly log: LogFn,
    private readonly now: () => number = Date.now,
  ) {
    this.load();
    setInterval(() => this.sweep(), SWEEP_INTERVAL_MS).unref();
  }

  /** Create a session; returns the bearer token (shown to the client once). */
  create(session: NewSession): string {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const now = this.now();
    this.sessions.set(hashToken(token), { ...session, createdAt: now, lastSeenAt: now });
    this.persist();
    return token;
  }

  /** The live session for a token, refreshing its idle timer; else null. */
  get(token?: string): Session | null {
    if (!token) return null;
    const id = hashToken(token);
    const record = this.sessions.get(id);
    if (!record) return null;
    const now = this.now();
    if (this.isExpired(record, now)) {
      this.sessions.delete(id);
      this.persist();
      return null;
    }
    record.lastSeenAt = now;
    if (now - (this.lastPersistedTouch.get(id) ?? 0) >= TOUCH_PERSIST_INTERVAL_MS) {
      this.lastPersistedTouch.set(id, now);
      this.persist();
    }
    return { id, record };
  }

  revoke(id: string): boolean {
    const existed = this.sessions.delete(id);
    if (existed) this.persist();
    return existed;
  }

  /** Revoke every session matching `predicate`; returns the revoked ids. */
  revokeWhere(predicate: (record: SessionRecord, id: string) => boolean): Set<string> {
    const revoked = new Set<string>();
    for (const [id, record] of this.sessions) {
      if (predicate(record, id)) revoked.add(id);
    }
    for (const id of revoked) this.sessions.delete(id);
    if (revoked.size > 0) this.persist();
    return revoked;
  }

  private isExpired(record: SessionRecord, now: number): boolean {
    return now - record.lastSeenAt > this.idleTtlMs || now - record.createdAt > this.maxTtlMs;
  }

  private sweep(): void {
    const now = this.now();
    this.revokeWhere((record) => this.isExpired(record, now));
  }

  private load(): void {
    if (!existsSync(this.path)) return;
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, SessionRecord>;
      const now = this.now();
      for (const [id, record] of Object.entries(raw)) {
        if (!this.isExpired(record, now)) this.sessions.set(id, record);
      }
    } catch (err) {
      this.log(`Could not read sessions file, starting empty: ${String(err)}`, LogLevel.Warn);
    }
  }

  /** Write-then-rename, so a crash mid-write never truncates the file. */
  private persist(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.sessions)));
    renameSync(tmp, this.path);
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
