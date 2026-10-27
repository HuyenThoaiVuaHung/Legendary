import { Server } from 'socket.io';
import { RoomSecrets } from '../contracts/api';
import { GameRules } from '../game.rules';
import { LegionFileService } from '../services/legion-file.service';
import { MediaStore } from '../services/media.store';
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
  secrets: RoomSecrets;
  /** Username holding each player seat, in seat order; null when free. */
  seats: (string | null)[];
  /** The room's live rules; persisted so settings survive a restart. */
  rules: GameRules;
  createdAt: number;
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
    /** Absent for the default room, whose secrets live in server config. */
    readonly meta?: RoomMeta,
  ) {
    this.channel = io.to(id);
    this.timer = new TimerService(this.channel, store, rules);
    this.legionFiles = new LegionFileService(store, media);
  }

  /**
   * Seat for `username`: the seat it already holds (usernames compare
   * case-insensitively), else the first free one, else null when full.
   * Only created rooms have seats; the default room uses per-seat secrets.
   */
  claimSeat(username: string): number | null {
    if (!this.meta) return null;
    const key = username.toLocaleLowerCase();
    const seats = this.meta.seats;
    const held = seats.findIndex((seat) => seat?.toLocaleLowerCase() === key);
    if (held !== -1) return held;
    const free = seats.indexOf(null);
    if (free === -1) return null;
    seats[free] = username;
    return free;
  }

  /** Stop every timer the room owns, silently; used when closing it. */
  dispose(): void {
    this.timer.dispose();
    this.session.clearTimers();
  }
}
