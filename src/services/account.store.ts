/**
 * Host accounts: username + password, with a one-time recovery code instead
 * of email (no external services).
 *
 * Passwords are hashed with scrypt (node:crypto) and a per-account salt; the
 * parameters are stored with each hash so they can be raised later without
 * breaking existing accounts. Recovery codes are high-entropy random strings,
 * so a plain SHA-256 of them is sufficient.
 */
import { createHash, randomBytes, randomInt, randomUUID, scrypt, ScryptOptions, timingSafeEqual } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { LogFn, LogLevel } from '../logger';

const HASH_SCHEME = 'scrypt';
/** scrypt cost: N = 2^15, r = 8, p = 1 (~32 MiB, tens of ms per hash). */
const SCRYPT_LOG_N = 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_BYTES = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const SALT_BYTES = 16;

export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,32}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Recovery code: 4 groups of 5 typeable characters (~99 bits). */
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RECOVERY_GROUPS = 4;
const RECOVERY_GROUP_LENGTH = 5;

export interface Account {
  id: string;
  username: string;
  passwordHash: string;
  recoveryHash: string;
  createdAt: number;
}

function scryptAsync(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_BYTES, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, {
    N: 2 ** SCRYPT_LOG_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAX_MEMORY,
  });
  return [HASH_SCHEME, SCRYPT_LOG_N, SCRYPT_R, SCRYPT_P, salt.toString('base64'), key.toString('base64')].join('$');
}

async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [scheme, logN, r, p, salt, key] = stored.split('$');
  if (scheme !== HASH_SCHEME || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), {
    N: 2 ** Number(logN),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT_MAX_MEMORY,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function newRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < RECOVERY_GROUPS; g++) {
    let group = '';
    for (let i = 0; i < RECOVERY_GROUP_LENGTH; i++) {
      group += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

/** Case/whitespace/dash-insensitive, so typed codes match what was shown. */
function hashRecoveryCode(code: string): string {
  const normalized = code.replace(/[\s-]+/g, '').toUpperCase();
  return createHash('sha256').update(normalized).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export class AccountStore {
  private readonly accounts = new Map<string, Account>();
  /** A real hash to compare against for unknown usernames (equal timing). */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly path: string,
    private readonly log: LogFn,
  ) {
    this.load();
  }

  get(id: string): Account | undefined {
    return this.accounts.get(id);
  }

  byUsername(username: string): Account | undefined {
    const key = username.toLocaleLowerCase();
    for (const account of this.accounts.values()) {
      if (account.username.toLocaleLowerCase() === key) return account;
    }
    return undefined;
  }

  /** Create an account; null when the username is taken. */
  async create(username: string, password: string): Promise<{ account: Account; recoveryCode: string } | null> {
    if (this.byUsername(username)) return null;
    const recoveryCode = newRecoveryCode();
    const account: Account = {
      id: randomUUID(),
      username,
      passwordHash: await hashPassword(password),
      recoveryHash: hashRecoveryCode(recoveryCode),
      createdAt: Date.now(),
    };
    // Re-check after the await: two signups for one name may race.
    if (this.byUsername(username)) return null;
    this.accounts.set(account.id, account);
    this.persist();
    return { account, recoveryCode };
  }

  /** The account when username + password match; else null. */
  async verifyPassword(username: string, password: string): Promise<Account | null> {
    const account = this.byUsername(username);
    if (!account) {
      // Spend the same work as a real check so timing doesn't reveal names.
      this.dummyHash ??= hashPassword(randomBytes(SALT_BYTES).toString('hex'));
      await passwordMatches(password, await this.dummyHash);
      return null;
    }
    return (await passwordMatches(password, account.passwordHash)) ? account : null;
  }

  /**
   * Reset the password with the recovery code. The code is single-use: a
   * fresh one is issued and returned. Null when the name or code is wrong.
   */
  async recover(username: string, recoveryCode: string, newPassword: string): Promise<{ account: Account; recoveryCode: string } | null> {
    const account = this.byUsername(username);
    if (!account || !safeEqualHex(hashRecoveryCode(recoveryCode), account.recoveryHash)) return null;
    const fresh = newRecoveryCode();
    account.passwordHash = await hashPassword(newPassword);
    account.recoveryHash = hashRecoveryCode(fresh);
    this.persist();
    return { account, recoveryCode: fresh };
  }

  private load(): void {
    if (!existsSync(this.path)) return;
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as Account[];
      for (const account of raw) this.accounts.set(account.id, account);
    } catch (err) {
      // Refuse to silently start empty: that would let names be re-registered.
      this.log(`Accounts file is unreadable: ${String(err)}`, LogLevel.Error);
      throw err;
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify([...this.accounts.values()], null, 2));
    renameSync(tmp, this.path);
  }
}
