import { randomBytes, randomInt } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Server } from 'socket.io';
import { ServerConfig } from '../config';
import { RoomSecrets } from '../contracts/api';
import { RoundKind } from '../contracts/game';
import { GameRules, loadGameRules, PLAYER_COUNT } from '../game.rules';
import { LogFn, LogLevel } from '../logger';
import { MediaStore } from '../services/media.store';
import { MatchStore } from '../state/match.store';
import { Room, RoomMeta } from './room';

/** The implicit room every legacy (room-less) token and socket belongs to. */
export const DEFAULT_ROOM_ID = 'default';

/** 8 random bytes = 16 hex chars: unguessable, filesystem-safe room ids. */
const ROOM_ID_BYTES = 8;
const ROOM_ID_PATTERN = /^[0-9a-f]{16}$/;
const ROOM_META_FILE = 'room.json';
const ROOM_MATCH_FILE = 'match.json';
const ROOM_ROUND_DIR = 'round_data';
const ROOM_MEDIA_DIR = 'media';

/** Typeable codes/secrets: no 0/O, 1/I/L look-alikes. */
const TYPEABLE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;
const PLAYER_SECRET_LENGTH = 6;
const MC_SECRET_LENGTH = 8;
/** Admin secret is copy-pasted, not typed: longer and URL-safe. */
const ADMIN_SECRET_BYTES = 12;

function typeable(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += TYPEABLE_ALPHABET[randomInt(TYPEABLE_ALPHABET.length)];
  return out;
}

/** Normalize user-entered codes: case-insensitive, whitespace ignored. */
export function normalizeRoomCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase();
}

/**
 * Owns every live room. The default room keeps the legacy on-disk layout
 * (config.matchDataPath / config.mediaDir) and the shared config.rules, so a
 * single-venue install behaves exactly as before. Created rooms live under
 * `<roomsDir>/<id>/` with their own rules, secrets and seats, and are
 * restored from disk on startup.
 */
export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();
  private readonly idByCode = new Map<string, string>();

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
    this.restore();
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  byCode(code: string): Room | undefined {
    const id = this.idByCode.get(normalizeRoomCode(code));
    return id === undefined ? undefined : this.rooms.get(id);
  }

  defaultRoom(): Room {
    return this.rooms.get(DEFAULT_ROOM_ID)!;
  }

  list(): Room[] {
    return [...this.rooms.values()];
  }

  /** Number of created (non-default) rooms. */
  createdCount(): number {
    return this.rooms.size - 1;
  }

  /** A new room, or null when the server is at `maxRooms`. */
  create(): Room | null {
    if (this.createdCount() >= this.config.maxRooms) return null;

    let id: string;
    do {
      id = randomBytes(ROOM_ID_BYTES).toString('hex');
    } while (this.rooms.has(id));
    let code: string;
    do {
      code = typeable(ROOM_CODE_LENGTH);
    } while (this.idByCode.has(code));

    const secrets: RoomSecrets = {
      admin: randomBytes(ADMIN_SECRET_BYTES).toString('base64url'),
      mc: typeable(MC_SECRET_LENGTH),
      player: typeable(PLAYER_SECRET_LENGTH),
    };
    const meta: RoomMeta = {
      code,
      secrets,
      seats: Array(PLAYER_COUNT).fill(null),
      // A snapshot of the server rules: per-room edits never leak elsewhere.
      rules: loadGameRules(this.config.rules),
      createdAt: Date.now(),
    };
    const room = this.open(id, meta);
    this.saveMeta(room);
    this.log(`Room ${id} (${code}) created`);
    return room;
  }

  /** Persist a created room's metadata (seats, rules). No-op for default. */
  saveMeta(room: Room): void {
    if (!room.meta) return;
    const dir = this.roomDir(room.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ROOM_META_FILE), JSON.stringify(room.meta, null, 2));
  }

  /**
   * Close a room: stop its timers, disconnect its sockets, forget it, and
   * (by default) delete its data. The default room can never be removed.
   */
  remove(id: string, options: { deleteData?: boolean } = {}): boolean {
    if (id === DEFAULT_ROOM_ID) return false;
    const room = this.rooms.get(id);
    if (!room) return false;
    room.dispose();
    this.io.in(id).disconnectSockets(true);
    this.rooms.delete(id);
    if (room.meta) this.idByCode.delete(room.meta.code);
    if (options.deleteData ?? true) {
      rmSync(this.roomDir(id), { recursive: true, force: true });
    }
    this.log(`Room ${id} closed`);
    return true;
  }

  private open(id: string, meta: RoomMeta): Room {
    const dir = this.roomDir(id);
    const roundFileOf = (kind: RoundKind): string => join(dir, ROOM_ROUND_DIR, `${kind}.json`);
    const store = new MatchStore(join(dir, ROOM_MATCH_FILE), this.log, roundFileOf);
    const room = new Room(
      id,
      this.io,
      store,
      this.mediaStore(join(dir, ROOM_MEDIA_DIR)),
      meta.rules,
      meta,
    );
    this.rooms.set(id, room);
    this.idByCode.set(meta.code, id);
    return room;
  }

  /** Reopen every created room found under roomsDir. */
  private restore(): void {
    if (!existsSync(this.config.roomsDir)) return;
    for (const entry of readdirSync(this.config.roomsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !ROOM_ID_PATTERN.test(entry.name)) continue;
      const metaPath = join(this.roomDir(entry.name), ROOM_META_FILE);
      if (!existsSync(metaPath)) continue;
      try {
        const raw = JSON.parse(readFileSync(metaPath, 'utf8')) as RoomMeta;
        const meta: RoomMeta = {
          ...raw,
          seats: Array.from({ length: PLAYER_COUNT }, (_, i) => raw.seats?.[i] ?? null),
          rules: loadGameRules(raw.rules as Partial<GameRules> | undefined),
        };
        this.open(entry.name, meta);
      } catch (err) {
        this.log(`Skipping unreadable room ${entry.name}: ${String(err)}`, LogLevel.Warn);
      }
    }
    if (this.createdCount() > 0) this.log(`Restored ${this.createdCount()} room(s)`);
  }

  private roomDir(id: string): string {
    return join(this.config.roomsDir, id);
  }

  private mediaStore(mediaDir: string): MediaStore {
    return new MediaStore(mediaDir, this.config.assetsDir, this.config.assetsOverrideDir);
  }
}
