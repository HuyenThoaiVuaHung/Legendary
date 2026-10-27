import { randomBytes } from 'crypto';
import { join } from 'path';
import { Server } from 'socket.io';
import { ServerConfig } from '../config';
import { RoundKind } from '../contracts/game';
import { loadGameRules } from '../game.rules';
import { LogFn } from '../logger';
import { MediaStore } from '../services/media.store';
import { MatchStore } from '../state/match.store';
import { Room } from './room';

/** The implicit room every legacy (room-less) token and socket belongs to. */
export const DEFAULT_ROOM_ID = 'default';

/** 8 random bytes = 16 hex chars: unguessable, filesystem-safe room ids. */
const ROOM_ID_BYTES = 8;
const ROOM_MATCH_FILE = 'match.json';
const ROOM_ROUND_DIR = 'round_data';
const ROOM_MEDIA_DIR = 'media';

/**
 * Owns every live room. The default room keeps the legacy on-disk layout
 * (config.matchDataPath / config.mediaDir) and the shared config.rules, so a
 * single-venue install behaves exactly as before. Created rooms live under
 * `<roomsDir>/<id>/` with their own copy of the rules.
 */
export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly io: Server,
    private readonly config: ServerConfig,
    private readonly log: LogFn,
  ) {
    const store = new MatchStore(config.matchDataPath, log);
    this.rooms.set(
      DEFAULT_ROOM_ID,
      new Room(DEFAULT_ROOM_ID, io, store, this.mediaStore(config.mediaDir), config.rules),
    );
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  defaultRoom(): Room {
    return this.rooms.get(DEFAULT_ROOM_ID)!;
  }

  list(): Room[] {
    return [...this.rooms.values()];
  }

  create(): Room {
    let id: string;
    do {
      id = randomBytes(ROOM_ID_BYTES).toString('hex');
    } while (this.rooms.has(id));

    const dir = join(this.config.roomsDir, id);
    const roundFileOf = (kind: RoundKind): string => join(dir, ROOM_ROUND_DIR, `${kind}.json`);
    const store = new MatchStore(join(dir, ROOM_MATCH_FILE), this.log, roundFileOf);
    const room = new Room(
      id,
      this.io,
      store,
      this.mediaStore(join(dir, ROOM_MEDIA_DIR)),
      // A snapshot of the server rules: per-room edits never leak elsewhere.
      loadGameRules(this.config.rules),
    );
    this.rooms.set(id, room);
    this.log(`Room ${id} created`);
    return room;
  }

  /** Close a room: stop its timers and forget it. The default room stays. */
  remove(id: string): boolean {
    if (id === DEFAULT_ROOM_ID) return false;
    const room = this.rooms.get(id);
    if (!room) return false;
    room.dispose();
    this.rooms.delete(id);
    this.log(`Room ${id} closed`);
    return true;
  }

  private mediaStore(mediaDir: string): MediaStore {
    return new MediaStore(mediaDir, this.config.assetsDir, this.config.assetsOverrideDir);
  }
}
