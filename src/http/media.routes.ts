/**
 * Media routes: authenticated uploads (POST /api/media/:kind) and public
 * downloads (GET /media/:kind/:name).
 *
 * Uploads are multipart (field "file"), held in memory, capped at
 * config.uploadLimitBytes, and restricted to image/audio/video mimetypes.
 * Storage and legacy-asset fallback resolution live in MediaStore.
 */
import { Request, RequestHandler, Response, Router } from 'express';
import multer from 'multer';
import { resolve } from 'path';
import {
  API_PATHS,
  ApiError,
  BRAND_ASSET_KEYS,
  BrandAssetKey,
  MediaUploadResponse,
  Role,
  UPLOAD_FIELD,
} from '../contracts/api';
import { RoundKind, ROUND_KINDS } from '../contracts/game';
import { VCNV_OBSTACLE_INDEX, VCNV_PIECE_COUNT } from '../game.rules';
import { Room } from '../rooms/room';
import { DEFAULT_ROOM_ID } from '../rooms/room.registry';
import { MediaStore } from '../services/media.store';
import { bearerToken, identityOf, param, requireAuth, roomOf } from './middleware';
import type { ApiDeps } from './index';

/** Round kinds plus the catch-all bucket for unclassified assets. */
const MEDIA_KINDS: readonly string[] = [...ROUND_KINDS, 'misc'];

const ALLOWED_MIME_PREFIXES: readonly string[] = ['image/', 'audio/', 'video/'];
/** Extension allow-list — keeps html/svg/js out even with a spoofed mimetype. */
const ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp',
  'mp3', 'wav', 'ogg', 'm4a', 'flac',
  'mp4', 'webm', 'mkv', 'mov',
]);

/** Fixed destinations keep overrides inside the recognised Legion brand set. */
const BRAND_ASSET_PATHS: Readonly<Record<BrandAssetKey, string>> = {
  logo: 'misc/logo.png',
  wordmark: 'misc/legion.png',
  placeholder: 'misc/placeholder.png',
  icon: 'misc/icon.png',
};

function badRequest(res: Response, message: string): void {
  const error: ApiError = { error: message };
  res.status(400).json(error);
}

export function createMediaRoutes(deps: ApiDeps): Router {
  const { auth, accounts, config } = deps;
  const router = Router();
  const adminOnly = requireAuth(auth, Role.Admin);
  const anyRole = requireAuth(auth);
  const serverAdmins = new Set(config.serverAdmins.map((name) => name.toLocaleLowerCase()));
  // Hosted mode: server-wide branding belongs to the operators listed in
  // config.serverAdmins, never to a room admin. Single venue: room admin.
  const brandGuard: RequestHandler = config.multiRoom
    ? (req, res, next) => {
        const identity = auth.verifyAccount(bearerToken(req));
        const account = identity ? accounts.get(identity.accountId) : undefined;
        if (!account) {
          const error: ApiError = { error: 'Host login required' };
          res.status(401).json(error);
          return;
        }
        if (!serverAdmins.has(account.username.toLocaleLowerCase())) {
          const error: ApiError = { error: 'Only server admins can change server-wide branding' };
          res.status(403).json(error);
          return;
        }
        next();
      }
    : adminOnly;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.uploadLimitBytes },
  });

  const validateUpload = (req: import('express').Request, res: Response): Express.Multer.File | null => {
    const file = req.file;
    if (!file) {
      badRequest(res, `Missing multipart field "${UPLOAD_FIELD}"`);
      return null;
    }
    const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (
      !ALLOWED_MIME_PREFIXES.some((prefix) => file.mimetype.startsWith(prefix)) ||
      !ALLOWED_EXTENSIONS.has(extension)
    ) {
      const error: ApiError = { error: `Unsupported media type: ${file.mimetype} (.${extension})` };
      res.status(415).json(error);
      return null;
    }
    return file;
  };

  const validateBrandAssetUpload = (
    req: import('express').Request,
    res: Response,
  ): Express.Multer.File | null => {
    const file = validateUpload(req, res);
    if (!file) return null;
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (file.mimetype !== 'image/png' || extension !== 'png') {
      const error: ApiError = { error: 'Ảnh phải là PNG.' };
      res.status(415).json(error);
      return null;
    }
    return file;
  };

  const handleMulterError = (err: unknown, res: Response): boolean => {
    if (!err) return false;
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      const error: ApiError = { error: 'File too large' };
      res.status(413).json(error);
    } else {
      badRequest(res, err instanceof Error ? err.message : String(err));
    }
    return true;
  };

  const mediaUrl = (room: Room, kind: RoundKind | 'misc', fileName: string): string =>
    room.id === DEFAULT_ROOM_ID
      ? API_PATHS.mediaFile(kind, fileName)
      : API_PATHS.roomMediaFile(room.id, kind, fileName);

  router.post('/api/media/:kind', adminOnly, (req, res) => {
    const room = roomOf(req);
    const kind = param(req, 'kind');
    if (!MEDIA_KINDS.includes(kind)) {
      badRequest(res, `Unknown media kind: ${kind}`);
      return;
    }
    upload.single(UPLOAD_FIELD)(req, res, (err: unknown) => {
      if (handleMulterError(err, res)) return;
      const file = validateUpload(req, res);
      if (!file) return;
      const saved = room.media.save(kind, file.originalname, file.buffer);
      const response: MediaUploadResponse = {
        fileName: saved.fileName,
        url: mediaUrl(room, kind as RoundKind | 'misc', saved.fileName),
      };
      res.json(response);
    });
  });

  // Brand assets have server-owned destinations and override the bundled
  // defaults at /assets. PNG-only keeps URLs and declared content types stable.
  router.post('/api/assets/:key', brandGuard, (req, res) => {
    const room = roomOf(req);
    if (room.id !== DEFAULT_ROOM_ID) {
      const error: ApiError = { error: 'Brand assets can only be changed by the server admin' };
      res.status(403).json(error);
      return;
    }
    const key = param(req, 'key') as BrandAssetKey;
    if (!(BRAND_ASSET_KEYS as readonly string[]).includes(key)) {
      badRequest(res, `Unknown brand asset: ${req.params.key}`);
      return;
    }
    upload.single(UPLOAD_FIELD)(req, res, (err: unknown) => {
      if (handleMulterError(err, res)) return;
      const file = validateBrandAssetUpload(req, res);
      if (!file) return;
      const fileName = room.media.saveBrandAsset(BRAND_ASSET_PATHS[key], file.buffer);
      const response: MediaUploadResponse = { fileName, url: `/assets/${fileName}` };
      res.json(response);
    });
  });

  // Obstacle pieces are uploaded to the protected store and never exposed by
  // the public /media route below.
  router.post('/api/media/obstacle-piece', adminOnly, (req, res) => {
    const room = roomOf(req);
    upload.single(UPLOAD_FIELD)(req, res, (err: unknown) => {
      if (handleMulterError(err, res)) return;
      const file = validateUpload(req, res);
      if (!file) return;
      const fileName = room.media.saveObstaclePiece(file.originalname, file.buffer);
      const response: MediaUploadResponse = {
        fileName,
        url: `/api/media/obstacle/${fileName}`,
      };
      res.json(response);
    });
  });

  // Reveal-gated obstacle piece: piece i is served only once VCNV row i is
  // open, so players cannot reassemble the hidden obstacle early. Admin and MC
  // (the control/broadcast screens) may always fetch every piece.
  router.get('/api/media/obstacle/:index', anyRole, (req, res) => {
    const room = roomOf(req);
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0 || index >= VCNV_PIECE_COUNT) {
      badRequest(res, `Obstacle piece index out of range: ${req.params.index}`);
      return;
    }
    const role = identityOf(req).roleId;
    const privileged = role === Role.Admin || role === Role.Mc;
    const round = room.store.round('vcnv').get();
    if (!privileged && round.questions[index]?.isOpen !== true) {
      const error: ApiError = { error: 'Obstacle piece not yet revealed' };
      res.status(403).json(error);
      return;
    }
    const fileName = round.questions[VCNV_OBSTACLE_INDEX]?.imagePieceFiles?.[index];
    const path = fileName ? room.media.resolveObstaclePiece(fileName) : undefined;
    if (path === undefined) {
      const error: ApiError = { error: 'Obstacle piece not found' };
      res.status(404).json(error);
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path);
  });

  const serveMedia = (req: Request, res: Response, media: MediaStore): void => {
    // Only the public kinds may be served here; the protected obstacle store
    // is reachable exclusively through the reveal-gated route above.
    if (!MEDIA_KINDS.includes(param(req, 'kind'))) {
      const error: ApiError = { error: 'Media not found' };
      res.status(404).json(error);
      return;
    }
    const path = media.resolve(param(req, 'kind'), param(req, 'name'));
    if (path === undefined) {
      const error: ApiError = { error: 'Media not found' };
      res.status(404).json(error);
      return;
    }
    // Media is user-uploaded: never let the browser sniff it into an
    // executable same-origin document.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(resolve(path));
  };

  router.get('/media/:kind/:name', (req, res) => {
    serveMedia(req, res, deps.rooms.defaultRoom().media);
  });

  router.get('/rooms/:roomId/media/:kind/:name', (req, res) => {
    const room = deps.rooms.get(param(req, 'roomId'));
    if (!room || room.id === DEFAULT_ROOM_ID) {
      const error: ApiError = { error: 'Media not found' };
      res.status(404).json(error);
      return;
    }
    serveMedia(req, res, room.media);
  });

  return router;
}
