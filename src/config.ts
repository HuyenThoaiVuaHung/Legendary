import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { GameRules, loadGameRules } from './game.rules';

export interface ServerConfig {
  port: number;
  /** One secret per player, in player-index order. */
  playerSecrets: string[];
  adminSecret: string;
  mcSecret: string;
  /** Path of the match state file, relative to the server root. */
  matchDataPath: string;
  /** Parent directory of created rooms' data (`<roomsDir>/<roomId>/`). */
  roomsDir: string;
  /** Login attempts allowed per IP per `loginRateWindowSeconds`. */
  loginRateLimit: number;
  loginRateWindowSeconds: number;
  /** Most created rooms the server keeps at once. */
  maxRooms: number;
  /** Rooms one IP may create per `roomCreateRateWindowSeconds`. */
  roomCreateRateLimit: number;
  roomCreateRateWindowSeconds: number;
  /** Join attempts per IP per `roomJoinRateWindowSeconds` (secret guessing). */
  roomJoinRateLimit: number;
  roomJoinRateWindowSeconds: number;
  /** Directory uploaded media is stored in, relative to the server root. */
  mediaDir: string;
  /** Directory the built Legion frontend is served from. */
  frontendDir: string;
  /** Directory of the bundled Legion brand images, served at /assets. */
  assetsDir: string;
  /** User-provided assets that override the bundled brand images at /assets. */
  assetsOverrideDir: string;
  saveLog: boolean;
  uploadLimitBytes: number;
  /**
   * Hosted mode (VPS): rooms + host accounts on, the legacy secret login and
   * the default room off. Off (default): one venue, exactly as before.
   */
  multiRoom: boolean;
  /** Host usernames allowed to change server-wide defaults (multiRoom). */
  serverAdmins: string[];
  /** Server-side session records (hashed tokens). */
  sessionsPath: string;
  sessionIdleTtlSeconds: number;
  sessionMaxTtlSeconds: number;
  accountsPath: string;
  maxRoomsPerAccount: number;
  /** Signups allowed per IP per `signupRateWindowSeconds`. */
  signupRateLimit: number;
  signupRateWindowSeconds: number;
  /** Game scoring/timing rules, defaults overridden by config's `rules`. */
  rules: GameRules;
}

const CONFIG_FILE = join(__dirname, '..', 'utils', 'config.json');

const DEFAULTS = {
  port: 80,
  playerSecrets: ['123', '234', '345', '456'],
  adminSecret: 'BTC',
  mcSecret: 'MC',
  matchDataPath: 'match_data/match.json',
  mediaDir: 'match_data/media',
  roomsDir: 'match_data/rooms',
  loginRateLimit: 30,
  loginRateWindowSeconds: 60,
  maxRooms: 100,
  roomCreateRateLimit: 5,
  roomCreateRateWindowSeconds: 60 * 60,
  roomJoinRateLimit: 30,
  roomJoinRateWindowSeconds: 60,
  frontendDir: 'Legion',
  assetsDir: 'assets',
  assetsOverrideDir: 'match_data/assets',
  saveLog: false,
  uploadLimitMb: 100,
  multiRoom: false,
  sessionsPath: 'match_data/sessions.json',
  sessionIdleTtlSeconds: 7 * 24 * 60 * 60,
  sessionMaxTtlSeconds: 30 * 24 * 60 * 60,
  accountsPath: 'match_data/accounts.json',
  maxRoomsPerAccount: 5,
  signupRateLimit: 5,
  signupRateWindowSeconds: 60 * 60,
} as const;

const BYTES_PER_MB = 1024 * 1024;

export function loadConfig(): ServerConfig {
  const fileConfig: Partial<Record<string, unknown>> = existsSync(CONFIG_FILE)
    ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
    : {};

  const str = (key: string, fallback: string): string =>
    process.env[`LEGENDARY_${key.toUpperCase()}`] ?? (fileConfig[key] as string) ?? fallback;
  const bool = (key: string, fallback: boolean): boolean => {
    const env = process.env[`LEGENDARY_${key.toUpperCase()}`];
    if (env !== undefined) return env === 'true' || env === '1';
    return Boolean(fileConfig[key] ?? fallback);
  };
  const num = (key: string, fallback: number): number =>
    Number(process.env[`LEGENDARY_${key.toUpperCase()}`] ?? fileConfig[key] ?? fallback);

  return {
    port: num('port', DEFAULTS.port),
    playerSecrets: (fileConfig['playerSecrets'] as string[]) ?? [...DEFAULTS.playerSecrets],
    adminSecret: str('adminSecret', DEFAULTS.adminSecret),
    mcSecret: str('mcSecret', DEFAULTS.mcSecret),
    matchDataPath: str('matchDataPath', DEFAULTS.matchDataPath),
    mediaDir: str('mediaDir', DEFAULTS.mediaDir),
    roomsDir: str('roomsDir', DEFAULTS.roomsDir),
    loginRateLimit: num('loginRateLimit', DEFAULTS.loginRateLimit),
    loginRateWindowSeconds: num('loginRateWindowSeconds', DEFAULTS.loginRateWindowSeconds),
    maxRooms: num('maxRooms', DEFAULTS.maxRooms),
    roomCreateRateLimit: num('roomCreateRateLimit', DEFAULTS.roomCreateRateLimit),
    roomCreateRateWindowSeconds: num(
      'roomCreateRateWindowSeconds',
      DEFAULTS.roomCreateRateWindowSeconds,
    ),
    roomJoinRateLimit: num('roomJoinRateLimit', DEFAULTS.roomJoinRateLimit),
    roomJoinRateWindowSeconds: num('roomJoinRateWindowSeconds', DEFAULTS.roomJoinRateWindowSeconds),
    frontendDir: str('frontendDir', DEFAULTS.frontendDir),
    assetsDir: str('assetsDir', DEFAULTS.assetsDir),
    assetsOverrideDir: str('assetsOverrideDir', DEFAULTS.assetsOverrideDir),
    saveLog: Boolean(fileConfig['saveLog'] ?? DEFAULTS.saveLog),
    uploadLimitBytes: num('uploadLimitMb', DEFAULTS.uploadLimitMb) * BYTES_PER_MB,
    multiRoom: bool('multiRoom', DEFAULTS.multiRoom),
    serverAdmins:
      process.env['LEGENDARY_SERVERADMINS']?.split(',').map((name) => name.trim()).filter(Boolean) ??
      (fileConfig['serverAdmins'] as string[] | undefined) ??
      [],
    sessionsPath: str('sessionsPath', DEFAULTS.sessionsPath),
    sessionIdleTtlSeconds: num('sessionIdleTtlSeconds', DEFAULTS.sessionIdleTtlSeconds),
    sessionMaxTtlSeconds: num('sessionMaxTtlSeconds', DEFAULTS.sessionMaxTtlSeconds),
    accountsPath: str('accountsPath', DEFAULTS.accountsPath),
    maxRoomsPerAccount: num('maxRoomsPerAccount', DEFAULTS.maxRoomsPerAccount),
    signupRateLimit: num('signupRateLimit', DEFAULTS.signupRateLimit),
    signupRateWindowSeconds: num('signupRateWindowSeconds', DEFAULTS.signupRateWindowSeconds),
    rules: loadGameRules(fileConfig['rules'] as Partial<GameRules> | undefined),
  };
}

/** True while any role still uses its shipped default secret. */
export function usesDefaultSecrets(config: ServerConfig): boolean {
  return (
    config.adminSecret === DEFAULTS.adminSecret ||
    config.mcSecret === DEFAULTS.mcSecret ||
    config.playerSecrets.some((secret) => (DEFAULTS.playerSecrets as readonly string[]).includes(secret))
  );
}
