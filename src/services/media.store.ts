import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { basename, isAbsolute, join, resolve } from 'path';

/** 3 random bytes = 6-char hex prefix keeping uploaded names collision-free. */
const RANDOM_PREFIX_BYTES = 3;
/** Used when sanitizing leaves nothing usable of the original name. */
const FALLBACK_FILE_NAME = 'file';
/** Characters invalid on common filesystems, plus ASCII control characters. */
const UNSAFE_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

/** Question-media roots inside the backend assets dir, tried in order. */
const LEGACY_ASSET_ROOTS = [
  'picture-questions',
  'audio-questions',
  'video-questions',
] as const;

/**
 * Subdirectory for VCNV obstacle pieces. Its leading underscore keeps it out
 * of the round-kind namespace, and the public /media route refuses to serve
 * it — pieces are reachable only through the reveal-gated obstacle route.
 */
const OBSTACLE_DIR = '_obstacle';

/**
 * Owns all media files on disk. Uploads land in `<mediaDir>/<kind>/`;
 * reads fall back to the legacy asset folders bundled with the frontend
 * so pre-rewrite question files keep working.
 */
export class MediaStore {
  constructor(
    private readonly mediaDir: string,
    /** Backend static assets dir (holds the picture/audio/video-questions roots). */
    private readonly assetsDir: string,
  ) {}

  /**
   * Store an uploaded file under a sanitized, random-prefixed name.
   * Returns the final file name and its public URL.
   */
  save(
    kind: string,
    originalName: string,
    buffer: Buffer,
  ): { fileName: string; url: string } {
    const prefix = randomBytes(RANDOM_PREFIX_BYTES).toString('hex');
    const fileName = `${prefix}-${sanitizeFileName(originalName)}`;
    this.write(kind, fileName, buffer);
    return { fileName, url: `/media/${kind}/${fileName}` };
  }

  /**
   * Store a file under its exact (sanitized) name, without a random prefix.
   * Used by .legion import, where the question data references the archive's
   * original file names verbatim. Returns the name actually written.
   */
  saveWithName(kind: string, fileName: string, buffer: Buffer): string {
    const safeName = sanitizeFileName(fileName);
    this.write(kind, safeName, buffer);
    return safeName;
  }

  /**
   * Absolute path of an existing media file, or undefined. Tries the managed
   * media dir first, then the legacy frontend asset folders. Rejects any
   * kind/name that could escape those directories.
   */
  resolve(kind: string, name: string): string | undefined {
    if (!isSafePathSegment(kind) || !isSafePathSegment(name)) return undefined;
    const candidates = [
      join(this.mediaDir, kind, name),
      ...LEGACY_ASSET_ROOTS.map((root) => join(this.assetsDir, root, kind, name)),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) return resolve(candidate);
    }
    return undefined;
  }

  /**
   * Store a VCNV obstacle piece in the protected directory (never served by
   * the public /media route). Returns the random-prefixed file name.
   */
  saveObstaclePiece(originalName: string, buffer: Buffer): string {
    const prefix = randomBytes(RANDOM_PREFIX_BYTES).toString('hex');
    const fileName = `${prefix}-${sanitizeFileName(originalName)}`;
    this.write(OBSTACLE_DIR, fileName, buffer);
    return fileName;
  }

  /** Absolute path of a protected obstacle piece, or undefined. */
  resolveObstaclePiece(name: string): string | undefined {
    if (!isSafePathSegment(name)) return undefined;
    const candidate = join(this.mediaDir, OBSTACLE_DIR, name);
    return existsSync(candidate) ? resolve(candidate) : undefined;
  }

  private write(kind: string, fileName: string, buffer: Buffer): void {
    if (!isSafePathSegment(kind)) {
      throw new Error(`Invalid media kind: ${kind}`);
    }
    const dir = join(this.mediaDir, kind);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, fileName), buffer);
  }
}

/**
 * Strip any path components (either separator style) and characters that are
 * unsafe in file names, keeping UTF-8 letters intact (Vietnamese names
 * survive unchanged).
 */
export function sanitizeFileName(originalName: string): string {
  const base = basename(String(originalName).replace(/\\/g, '/'));
  const cleaned = base.replace(UNSAFE_NAME_CHARS, '').trim();
  if (cleaned === '' || cleaned === '.' || cleaned === '..') return FALLBACK_FILE_NAME;
  return cleaned;
}

/** True when the value is a single, traversal-free path segment. */
function isSafePathSegment(segment: string): boolean {
  return (
    segment !== '' &&
    segment !== '.' &&
    segment !== '..' &&
    !segment.includes('/') &&
    !segment.includes('\\') &&
    !segment.includes('\u0000') &&
    !isAbsolute(segment)
  );
}
