/** Per-account archive storage, metadata, and quota enforcement. */
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BankItem } from '../contracts/api';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME_LENGTH = 80;
const INDEX_FILE = 'index.json';
const ARCHIVE_EXTENSION = '.legion';
const TEMP_SUFFIX = '.tmp';

/** The account has exceeded an item or byte quota. */
export class BankQuotaError extends Error {}
/** The supplied bank item name is invalid. */
export class BankNameError extends Error {}

/** Stores each host's archives and index in a separate directory. */
export class BankStore {
  constructor(
    private readonly root: string,
    readonly maxItems: number,
    readonly maxBytes: number,
  ) {}

  private dir(accountId: string): string {
    if (!UUID_PATTERN.test(accountId)) throw new Error('Invalid account id');
    return join(this.root, accountId);
  }

  /** List an account's indexed items. */
  list(accountId: string): BankItem[] {
    const path = join(this.dir(accountId), INDEX_FILE);
    if (!existsSync(path)) return [];
    const items = JSON.parse(readFileSync(path, 'utf8')) as BankItem[];
    return items.filter((item) => UUID_PATTERN.test(item.id));
  }

  /** Find an item owned by this account. */
  get(accountId: string, id: string): BankItem | undefined {
    if (!UUID_PATTERN.test(id)) return undefined;
    return this.list(accountId).find((item) => item.id === id);
  }

  /** Read an owned archive, or return undefined if it is absent. */
  read(accountId: string, id: string): Buffer | undefined {
    if (!this.get(accountId, id)) return undefined;
    const path = join(this.dir(accountId), `${id}${ARCHIVE_EXTENSION}`);
    return existsSync(path) ? readFileSync(path) : undefined;
  }

  /** Sum the indexed archive sizes. */
  usage(accountId: string): number {
    return this.list(accountId).reduce((total, item) => total + item.sizeBytes, 0);
  }

  /** Add an archive after validating its name and the account's quotas. */
  add(accountId: string, name: string, matchName: string, buffer: Buffer): BankItem {
    const safeName = this.name(name);
    const items = this.list(accountId);
    this.checkQuota(items, buffer.length, true);
    const now = Date.now();
    const item: BankItem = {
      id: randomUUID(),
      name: safeName,
      matchName,
      sizeBytes: buffer.length,
      createdAt: now,
      updatedAt: now,
    };
    this.writeArchive(accountId, item.id, buffer);
    this.persist(accountId, [...items, item]);
    return item;
  }

  /** Replace an owned archive, checking the change in byte usage. */
  replace(accountId: string, id: string, matchName: string, buffer: Buffer): BankItem | undefined {
    if (!UUID_PATTERN.test(id)) return undefined;
    const items = this.list(accountId);
    const item = items.find((entry) => entry.id === id);
    if (!item) return undefined;
    this.checkQuota(items, buffer.length - item.sizeBytes, false);
    this.writeArchive(accountId, id, buffer);
    item.matchName = matchName;
    item.sizeBytes = buffer.length;
    item.updatedAt = Date.now();
    this.persist(accountId, items);
    return item;
  }

  /** Rename an owned item. */
  rename(accountId: string, id: string, name: string): BankItem | undefined {
    if (!UUID_PATTERN.test(id)) return undefined;
    const items = this.list(accountId);
    const item = items.find((entry) => entry.id === id);
    if (!item) return undefined;
    item.name = this.name(name);
    item.updatedAt = Date.now();
    this.persist(accountId, items);
    return item;
  }

  /** Remove an owned item and its archive. */
  remove(accountId: string, id: string): boolean {
    if (!UUID_PATTERN.test(id)) return false;
    const items = this.list(accountId);
    if (!items.some((item) => item.id === id)) return false;
    this.persist(accountId, items.filter((item) => item.id !== id));
    rmSync(join(this.dir(accountId), `${id}${ARCHIVE_EXTENSION}`), { force: true });
    return true;
  }

  private name(value: string): string {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > MAX_NAME_LENGTH) {
      throw new BankNameError(`Name must contain 1–${MAX_NAME_LENGTH} characters`);
    }
    return value.trim();
  }

  private checkQuota(items: BankItem[], delta: number, adding: boolean): void {
    const usedBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);
    if ((adding && items.length >= this.maxItems) || usedBytes + delta > this.maxBytes) {
      throw new BankQuotaError('Bank quota exceeded');
    }
  }

  private writeArchive(accountId: string, id: string, buffer: Buffer): void {
    const dir = this.dir(accountId);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${id}${ARCHIVE_EXTENSION}`);
    writeFileSync(`${path}${TEMP_SUFFIX}`, buffer);
    renameSync(`${path}${TEMP_SUFFIX}`, path);
  }

  private persist(accountId: string, items: BankItem[]): void {
    const dir = this.dir(accountId);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, INDEX_FILE);
    writeFileSync(`${path}${TEMP_SUFFIX}`, JSON.stringify(items));
    renameSync(`${path}${TEMP_SUFFIX}`, path);
  }
}
