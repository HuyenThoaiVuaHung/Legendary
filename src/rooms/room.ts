import { Server } from 'socket.io';
import { RoomLink, RoomSecrets, SpectatorMode } from '../contracts/api';
import { GameRules } from '../game.rules';
import { LegionFileService } from '../services/legion-file.service';
import { MediaStore } from '../services/media.store';
import { UiConfigStore } from '../services/ui-config.store';
import { TimerService } from '../services/timer.service';
import { GameSessionState } from '../state/game.state';
import { MatchStore } from '../state/match.store';

/**
 * Where a room broadcasts. `io.to(roomId)` satisfies it, so every existing
 * `io.emit(...)` in the handlers reaches only that room's sockets.
 */
export interface RoomChannel {
  emit(event: string, ...args: unknown[]): boolean;
}

/** Persisted identity of a created room (`<roomsDir>/<id>/room.json`). */
export interface RoomMeta {
  code: string;
  /** Host account that owns the room (created it, or received it). */
  ownerAccountId: string;
  secrets: RoomSecrets;
  spectatorMode: SpectatorMode;
  links: (RoomLink & { tokenHash: string })[];
  /** Username holding each player seat, in seat order; null when free. */
  seats: (string | null)[];
  /** The room's live rules; persisted so settings survive a restart. */
  rules: GameRules;
  createdAt: number;
  lastActiveAt: number;
}

/** Everything one match owns. One instance per room. */
export class Room {
  readonly channel: RoomChannel;
  readonly session = new GameSessionState();
  readonly timer: TimerService;
  readonly legionFiles: LegionFileService;

  constructor(
    readonly id: string,
    io: Server,
    readonly store: MatchStore,
    readonly media: MediaStore,
    readonly rules: GameRules,
    readonly ui: UiConfigStore,
    /** Absent for the default room, whose secrets live in server config. */
    readonly meta?: RoomMeta,
  ) {
    this.channel = io.to(id);
    this.timer = new TimerService(this.channel, store, rules);
    this.legionFiles = new LegionFileService(store, media, ui);
  }

  /** Record activity for a created room. */
  touch(): void {
    if (this.meta) this.meta.lastActiveAt = Date.now();
  }

  /** Earliest idle or maximum lifetime deadline. */
  expiresAt(idleMs: number, maxMs: number): number | null {
    if (!this.meta) return null;
    return Math.min(this.meta.lastActiveAt + idleMs, this.meta.createdAt + maxMs);
  }

  /** Remaining media storage; the default room and zero quota are unlimited. */
  quotaRemaining(quotaBytes: number): number {
    if (!this.meta || quotaBytes === 0) return Infinity;
    return Math.max(0, quotaBytes - this.media.usageBytes());
  }

  /**
   * Seat held by `username` (case-insensitive), or -1. Holding a seat is not
   * proof of identity: only the session that holds it may reclaim it.
   * Only created rooms have seats; the default room uses per-seat secrets.
   */
  seatOf(username: string): number {
    if (!this.meta) return -1;
    const key = username.toLocaleLowerCase();
    return this.meta.seats.findIndex((seat) => seat?.toLocaleLowerCase() === key);
  }

  /** Give `username` the first free seat; null when every seat is taken. */
  claimFreeSeat(username: string): number | null {
    if (!this.meta) return null;
    const free = this.meta.seats.indexOf(null);
    if (free === -1) return null;
    this.meta.seats[free] = username;
    return free;
  }

  /** Free a seat; returns the username that held it, if any. */
  releaseSeat(index: number): string | null {
    if (!this.meta || index < 0 || index >= this.meta.seats.length) return null;
    const holder = this.meta.seats[index] ?? null;
    this.meta.seats[index] = null;
    return holder;
  }

  /** Stop every timer the room owns, silently; used when closing it. */
  dispose(): void {
    this.timer.dispose();
    this.session.clearTimers();
  }
}
