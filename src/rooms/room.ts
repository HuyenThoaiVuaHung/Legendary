import { Server } from 'socket.io';
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
  ) {
    this.channel = io.to(id);
    this.timer = new TimerService(this.channel, store, rules);
    this.legionFiles = new LegionFileService(store, media);
  }

  /** Stop every timer the room owns, silently; used when closing it. */
  dispose(): void {
    this.timer.dispose();
    this.session.clearTimers();
  }
}
