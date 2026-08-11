/**
 * Media routes: authenticated uploads (POST /api/media/:kind) and public
 * downloads (GET /media/:kind/:name).
 *
 * Uploads are multipart (field "file"), held in memory, capped at
 * config.uploadLimitBytes, and restricted to image/audio/video mimetypes.
 * Storage and legacy-asset fallback resolution live in MediaStore.
 */
import { Response, Router } from 'express';
import multer from 'multer';
import { resolve } from 'path';
import { ApiError, MediaUploadResponse, Role, UPLOAD_FIELD } from '../contracts/api';
import { ROUND_KINDS } from '../contracts/game';
import { requireAuth } from './middleware';
import type { ApiDeps } from './index';

/** Round kinds plus the catch-all bucket for unclassified assets. */
const MEDIA_KINDS: readonly string[] = [...ROUND_KINDS, 'misc'];

const ALLOWED_MIME_PREFIXES: readonly string[] = ['image/', 'audio/', 'video/'];

function badRequest(res: Response, message: string): void {
  const error: ApiError = { error: message };
  res.status(400).json(error);
}

export function createMediaRoutes(deps: ApiDeps): Router {
  const { auth, media, config } = deps;
  const router = Router();
  const adminOnly = requireAuth(auth, Role.Admin);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.uploadLimitBytes },
  });

  router.post('/api/media/:kind', adminOnly, (req, res) => {
    const kind = req.params.kind;
    if (!MEDIA_KINDS.includes(kind)) {
      badRequest(res, `Unknown media kind: ${kind}`);
      return;
    }
    upload.single(UPLOAD_FIELD)(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          const error: ApiError = { error: 'File too large' };
          res.status(413).json(error);
          return;
        }
        badRequest(res, err instanceof Error ? err.message : String(err));
        return;
      }
      const file = req.file;
      if (!file) {
        badRequest(res, `Missing multipart field "${UPLOAD_FIELD}"`);
        return;
      }
      if (!ALLOWED_MIME_PREFIXES.some((prefix) => file.mimetype.startsWith(prefix))) {
        const error: ApiError = { error: `Unsupported media type: ${file.mimetype}` };
        res.status(415).json(error);
        return;
      }
      const saved: MediaUploadResponse = media.save(kind, file.originalname, file.buffer);
      res.json(saved);
    });
  });

  router.get('/media/:kind/:name', (req, res) => {
    const path = media.resolve(req.params.kind, req.params.name);
    if (path === undefined) {
      const error: ApiError = { error: 'Media not found' };
      res.status(404).json(error);
      return;
    }
    res.sendFile(resolve(path));
  });

  return router;
}
