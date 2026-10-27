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
  /**
   * Express 'trust proxy': false (default), a hop count, or address/subnet
   * names ('loopback', '10.0.0.0/8'). `true` is refused: it would trust any
   * client-sent X-Forwarded-For and defeat every per-IP limit.
   */
  trustProxy: false | number | string;
  /** Live socket connections allowed per client IP (IPv6 grouped by /56). */
  maxSocketsPerIp: number;
  /** Media bytes a created room may store (0 = unlimited). */
  roomMediaQuotaBytes: number;
  /** A created room with no activity for this long is deleted. */
  roomIdleTtlSeconds: number;
  /** Hard lifetime of a created room, regardless of activity. */
  roomMaxTtlSeconds: number;
  roomSweepIntervalSeconds: number;
  /** Warn a room's sockets ('room-expiring') this long before it expires. */
  roomExpiryWarningSeconds: number;
  /** Server-side session records (hashed tokens). */
  sessionsPath: string;
  sessionIdleTtlSeconds: number;
  sessionMaxTtlSeconds: number;
  accountsPath: string;
  bankDir: string;
  bankMaxItemsPerAccount: number;
  bankMaxBytesPerAccount: number;
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
  maxSocketsPerIp: 20,
  roomMediaQuotaBytes: 1024 * 1024 * 1024,
  roomIdleTtlSeconds: 24 * 60 * 60,
  roomMaxTtlSeconds: 7 * 24 * 60 * 60,
  roomSweepIntervalSeconds: 5 * 60,
  roomExpiryWarningSeconds: 60 * 60,
  sessionsPath: 'match_data/sessions.json',
  sessionIdleTtlSeconds: 7 * 24 * 60 * 60,
  sessionMaxTtlSeconds: 30 * 24 * 60 * 60,
  accountsPath: 'match_data/accounts.json',
  bankDir: 'match_data/bank',
  bankMaxItemsPerAccount: 50,
  bankMaxBytesPerAccount: 500 * 1024 * 1024,
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
    trustProxy: parseTrustProxy(process.env['LEGENDARY_TRUSTPROXY'] ?? fileConfig['trustProxy']),
    maxSocketsPerIp: num('maxSocketsPerIp', DEFAULTS.maxSocketsPerIp),
    roomMediaQuotaBytes: num('roomMediaQuotaBytes', DEFAULTS.roomMediaQuotaBytes),
    roomIdleTtlSeconds: num('roomIdleTtlSeconds', DEFAULTS.roomIdleTtlSeconds),
    roomMaxTtlSeconds: num('roomMaxTtlSeconds', DEFAULTS.roomMaxTtlSeconds),
    roomSweepIntervalSeconds: num('roomSweepIntervalSeconds', DEFAULTS.roomSweepIntervalSeconds),
    roomExpiryWarningSeconds: num('roomExpiryWarningSeconds', DEFAULTS.roomExpiryWarningSeconds),
    sessionsPath: str('sessionsPath', DEFAULTS.sessionsPath),
    sessionIdleTtlSeconds: num('sessionIdleTtlSeconds', DEFAULTS.sessionIdleTtlSeconds),
    sessionMaxTtlSeconds: num('sessionMaxTtlSeconds', DEFAULTS.sessionMaxTtlSeconds),
    accountsPath: str('accountsPath', DEFAULTS.accountsPath),
    bankDir: str('bankDir', DEFAULTS.bankDir),
    bankMaxItemsPerAccount: num('bankMaxItemsPerAccount', DEFAULTS.bankMaxItemsPerAccount),
    bankMaxBytesPerAccount: num('bankMaxBytesPerAccount', DEFAULTS.bankMaxBytesPerAccount),
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

/**
 * Parse the trust-proxy setting from env (string) or config.json (any).
 * Unset/'false' → false; digits → hop count; other strings pass through.
 * `true` is refused outright (see ServerConfig.trustProxy).
 */
function parseTrustProxy(raw: unknown): false | number | string {
  if (raw === undefined || raw === null || raw === false || raw === 'false' || raw === '') return false;
  if (raw === true || raw === 'true') {
    throw new Error(
      'trustProxy: true is unsafe (clients could spoof their IP). Use a hop count such as 1, ' +
        "or the proxy's address, e.g. 'loopback'.",
    );
  }
  if (typeof raw === 'number') return raw;
  const text = String(raw).trim();
  return /^\d+$/.test(text) ? Number(text) : text;
}
