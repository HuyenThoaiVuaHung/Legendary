/**
 * Hosted account archive bank: list/upload at /api/bank and download,
 * rename, or delete an owned item at /api/bank/:id.
 */
import { Response, Router } from 'express';
import multer from 'multer';
import { API_PATHS, ApiError, UPLOAD_FIELD } from '../contracts/api';
import { BankNameError, BankQuotaError, BankStore } from '../services/bank.store';
import { inspectLegionArchive } from '../services/legion-file.service';
import { accountOf, param, requireAccount } from './middleware';
import type { ApiDeps } from './index';

const ARCHIVE_NAME_PATTERN = /\.(legion|lg)$/i;
const UNSAFE_DOWNLOAD_NAME = /[^a-zA-Z0-9._-]+/g;
const BANK_ITEM_ROUTE = '/api/bank/:id';
const MISSING_ITEM = 'No such bank item';
const FALLBACK_DOWNLOAD_NAME = 'match';
const ARCHIVE_EXTENSION = '.legion';
const BAD_REQUEST = 400;
const QUOTA_EXCEEDED = 413;
const SERVER_ERROR = 500;

function fail(res: Response, status: number, message: string): void {
  const error: ApiError = { error: message };
  res.status(status).json(error);
}

/** Translate bank validation and quota errors to API responses. */
export function bankError(res: Response, err: unknown): void {
  const status =
    err instanceof BankQuotaError
      ? QUOTA_EXCEEDED
      : err instanceof BankNameError ? BAD_REQUEST : SERVER_ERROR;
  const error: ApiError = { error: err instanceof Error ? err.message : String(err) };
  res.status(status).json(error);
}

/** Create the account-authenticated bank routes. */
export function createBankRoutes(deps: ApiDeps, bank: BankStore): Router {
  const router = Router();
  const hostOnly = requireAccount(deps.auth);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: deps.config.uploadLimitBytes },
  });
  router.get(API_PATHS.bank, hostOnly, (req, res) => {
    const id = accountOf(req).accountId;
    res.json({
      items: bank.list(id),
      usedBytes: bank.usage(id),
      maxBytes: bank.maxBytes,
      maxItems: bank.maxItems,
    });
  });
  router.post(API_PATHS.bank, hostOnly, (req, res) => {
    upload.single(UPLOAD_FIELD)(req, res, async (err: unknown) => {
      if (err) {
        const tooLarge = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE';
        fail(
          res,
          tooLarge ? QUOTA_EXCEEDED : BAD_REQUEST,
          tooLarge ? 'File too large' : String(err),
        );
        return;
      }
      const file = req.file;
      if (!file || !ARCHIVE_NAME_PATTERN.test(file.originalname)) {
        fail(res, 400, 'A .legion or .lg file is required');
        return;
      }
      let matchName: string;
      try {
        ({ matchName } = await inspectLegionArchive(file.buffer));
      } catch (error) {
        fail(res, 400, error instanceof Error ? error.message : String(error));
        return;
      }
      try {
        const name = req.body?.name === undefined ? matchName : req.body.name;
        res.status(201).json(bank.add(accountOf(req).accountId, name, matchName, file.buffer));
      } catch (error) {
        bankError(res, error);
      }
    });
  });
  router.get(BANK_ITEM_ROUTE, hostOnly, (req, res) => {
    const accountId = accountOf(req).accountId;
    const id = param(req, 'id');
    const item = bank.get(accountId, id);
    const data = bank.read(accountId, id);
    if (!item || !data) {
      fail(res, 404, MISSING_ITEM);
      return;
    }
    const safeName = item.name.replace(UNSAFE_DOWNLOAD_NAME, '_') || FALLBACK_DOWNLOAD_NAME;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}${ARCHIVE_EXTENSION}"`);
    res.send(data);
  });
  router.patch(BANK_ITEM_ROUTE, hostOnly, (req, res) => {
    try {
      const item = bank.rename(accountOf(req).accountId, param(req, 'id'), req.body?.name);
      if (!item) {
        fail(res, 404, MISSING_ITEM);
        return;
      }
      res.json(item);
    } catch (error) {
      bankError(res, error);
    }
  });
  router.delete(BANK_ITEM_ROUTE, hostOnly, (req, res) => {
    if (!bank.remove(accountOf(req).accountId, param(req, 'id'))) {
      fail(res, 404, MISSING_ITEM);
      return;
    }
    res.status(204).end();
  });
  return router;
}
