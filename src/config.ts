import { randomBytes } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface ServerConfig {
  port: number;
  /** One secret per player, in player-index order. */
  playerSecrets: string[];
  adminSecret: string;
  mcSecret: string;
  /** Path of the match state file, relative to the server root. */
  matchDataPath: string;
  /** Directory uploaded media is stored in, relative to the server root. */
  mediaDir: string;
  /** Directory the built Legion frontend is served from. */
  frontendDir: string;
  saveLog: boolean;
  uploadLimitBytes: number;
  tokenTtlSeconds: number;
  /** HMAC secret for tokens; random per boot unless pinned in config/env. */
  jwtSecret: string;
}

const CONFIG_FILE = join(__dirname, '..', 'utils', 'config.json');

const DEFAULTS = {
  port: 80,
  playerSecrets: ['123', '234', '345', '456'],
  adminSecret: 'BTC',
  mcSecret: 'MC',
  matchDataPath: 'match_data/match.json',
  mediaDir: 'match_data/media',
  frontendDir: 'Legion',
  saveLog: false,
  uploadLimitMb: 100,
  tokenTtlSeconds: 24 * 60 * 60,
} as const;

const BYTES_PER_MB = 1024 * 1024;
const JWT_SECRET_RANDOM_BYTES = 32;

export function loadConfig(): ServerConfig {
  const fileConfig: Partial<Record<string, unknown>> = existsSync(CONFIG_FILE)
    ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
    : {};

  const str = (key: string, fallback: string): string =>
    process.env[`LEGENDARY_${key.toUpperCase()}`] ?? (fileConfig[key] as string) ?? fallback;
  const num = (key: string, fallback: number): number =>
    Number(process.env[`LEGENDARY_${key.toUpperCase()}`] ?? fileConfig[key] ?? fallback);

  return {
    port: num('port', DEFAULTS.port),
    playerSecrets: (fileConfig['playerSecrets'] as string[]) ?? [...DEFAULTS.playerSecrets],
    adminSecret: str('adminSecret', DEFAULTS.adminSecret),
    mcSecret: str('mcSecret', DEFAULTS.mcSecret),
    matchDataPath: str('matchDataPath', DEFAULTS.matchDataPath),
    mediaDir: str('mediaDir', DEFAULTS.mediaDir),
    frontendDir: str('frontendDir', DEFAULTS.frontendDir),
    saveLog: Boolean(fileConfig['saveLog'] ?? DEFAULTS.saveLog),
    uploadLimitBytes: num('uploadLimitMb', DEFAULTS.uploadLimitMb) * BYTES_PER_MB,
    tokenTtlSeconds: num('tokenTtlSeconds', DEFAULTS.tokenTtlSeconds),
    jwtSecret: str('jwtSecret', randomBytes(JWT_SECRET_RANDOM_BYTES).toString('hex')),
  };
}
