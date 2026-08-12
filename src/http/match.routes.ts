/**
 * Match + round REST routes: match state, per-round data, KD control,
 * Excel workbook import, and .legion archive import/export.
 *
 * Every mutation persists through MatchStore and then emits the matching
 * socket push event (wire names preserved from the old monolith) so realtime
 * clients stay in sync.
 */
import { Request, Response, Router } from 'express';
import multer from 'multer';
import { Server } from 'socket.io';
import {
  API_PATHS,
  ApiError,
  Role,
  UPLOAD_FIELD,
  UpdateKdControlRequest,
  UpdateMatchPositionRequest,
  UpdatePlayerRequest,
} from '../contracts/api';
import {
  KdRound,
  MATCH_POSITIONS,
  MatchPosition,
  Player,
  RoundData,
  RoundKind,
  ROUND_KINDS,
  VcnvRound,
} from '../contracts/game';
import { GameRules, PLAYER_COUNT, VCNV_OBSTACLE_INDEX, VCNV_ROW_COUNT } from '../game.rules';
import { LogLevel } from '../logger';
import { ExcelImportService } from '../services/excel-import.service';
import { identityOf, requireAuth } from './middleware';
import type { ApiDeps } from './index';

/** Socket push event per round kind (wire names kept from the old server). */
const ROUND_UPDATE_EVENTS: Readonly<Record<RoundKind, string>> = {
  kd: 'update-kd-data-admin',
  vcnv: 'update-vcnv-data',
  tt: 'update-tangtoc-data',
  vd: 'update-vedich-data',
  chp: 'update-chp-data',
};
/** KD push for non-admin clients: same round, questions stripped. */
const KD_PUBLIC_UPDATE_EVENT = 'update-kd-data';
const KD_GAMEMODE_EVENT = 'update-kd-gamemode';
const MATCH_UPDATE_EVENT = 'update-match-data';

const KD_GAMEMODES: readonly string[] = ['S', 'M'];

/** What non-admin clients may see of the KD round (old get-kd-data). */
function stripKdQuestions(kd: KdRound): Omit<KdRound, 'questions'> {
  const { questions, ...rest } = kd;
  void questions;
  return rest;
}

/** Emit the push event(s) for one round; KD gets its admin + public pair. */
function emitRoundUpdate(io: Server, kind: RoundKind, data: RoundData): void {
  io.emit(ROUND_UPDATE_EVENTS[kind], data);
  if (kind === 'kd') {
    io.emit(KD_PUBLIC_UPDATE_EVENT, stripKdQuestions(data as KdRound));
  }
}

/**
 * Old update-vcnv-data rule: the obstacle's value is derived from how many
 * of the five rows are revealed when the payload is written.
 */
function recomputeObstacleValue(vcnv: VcnvRound, rules: GameRules): void {
  const revealedCount = vcnv.questions
    .slice(0, VCNV_ROW_COUNT)
    .filter((question) => question.isShown).length;
  const obstacle = vcnv.questions[VCNV_OBSTACLE_INDEX];
  if (obstacle !== undefined) {
    obstacle.value = rules.obstacleValueByRevealedCount[revealedCount] ?? obstacle.value;
  }
}

function isRoundKind(value: string): value is RoundKind {
  return (ROUND_KINDS as readonly string[]).includes(value);
}

function badRequest(res: Response, message: string): void {
  const error: ApiError = { error: message };
  res.status(400).json(error);
}

function serverError(res: Response, err: unknown): void {
  const error: ApiError = { error: err instanceof Error ? err.message : String(err) };
  res.status(500).json(error);
}

export function createMatchRoutes(deps: ApiDeps): Router {
  const { io, store, auth, legionFiles, log, config } = deps;
  const router = Router();
  const adminOnly = requireAuth(auth, Role.Admin);
  const anyAuthed = requireAuth(auth);
  const excelImport = new ExcelImportService(store);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.uploadLimitBytes },
  });

  // -------------------------------------------------------------- match state

  router.get(API_PATHS.match, anyAuthed, (_req, res) => {
    res.json(store.getMatch());
  });

  router.patch(API_PATHS.matchPosition, adminOnly, (req, res) => {
    const { position } = (req.body ?? {}) as UpdateMatchPositionRequest;
    if (!(MATCH_POSITIONS as readonly string[]).includes(position)) {
      badRequest(res, `Invalid match position: ${String(position)}`);
      return;
    }
    const match = store.updateMatch((m) => {
      m.position = position as MatchPosition;
    });
    io.emit(MATCH_UPDATE_EVENT, match);
    res.json(match);
  });

  router.patch('/api/match/players/:index', adminOnly, (req, res) => {
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0 || index >= PLAYER_COUNT) {
      badRequest(res, `Invalid player index: ${req.params.index}`);
      return;
    }
    const { player } = (req.body ?? {}) as UpdatePlayerRequest;
    if (typeof player !== 'object' || player === null) {
      badRequest(res, 'Missing player payload');
      return;
    }
    const match = store.updateMatch((m) => {
      m.players[index] = player as Player;
    });
    io.emit(MATCH_UPDATE_EVENT, match);
    res.json(match);
  });

  // --------------------------------------------------------------- round data

  router.get('/api/rounds/:kind', anyAuthed, (req, res) => {
    const kind = req.params.kind;
    if (!isRoundKind(kind)) {
      badRequest(res, `Unknown round kind: ${kind}`);
      return;
    }
    const data = store.round(kind).get();
    if (kind === 'kd' && identityOf(req).roleId !== Role.Admin) {
      res.json(stripKdQuestions(data as KdRound));
      return;
    }
    res.json(data);
  });

  router.put('/api/rounds/:kind', adminOnly, (req, res) => {
    const kind = req.params.kind;
    if (!isRoundKind(kind)) {
      badRequest(res, `Unknown round kind: ${kind}`);
      return;
    }
    const payload = req.body as RoundData | null | undefined;
    if (typeof payload !== 'object' || payload === null) {
      badRequest(res, 'Missing round payload');
      return;
    }
    if (kind === 'vcnv') {
      recomputeObstacleValue(payload as VcnvRound, config.rules);
    }
    const data = store.round(kind).set(payload);
    emitRoundUpdate(io, kind, data);
    res.json(data);
  });

  router.patch('/api/rounds/kd', adminOnly, (req, res) => {
    const { gamemode, activePlayerIndex } = (req.body ?? {}) as UpdateKdControlRequest;
    if (gamemode === undefined && activePlayerIndex === undefined) {
      badRequest(res, 'Provide gamemode and/or activePlayerIndex');
      return;
    }
    if (gamemode !== undefined && !KD_GAMEMODES.includes(gamemode)) {
      badRequest(res, `Invalid gamemode: ${String(gamemode)}`);
      return;
    }
    if (
      activePlayerIndex !== undefined &&
      (!Number.isInteger(activePlayerIndex) ||
        activePlayerIndex < 0 ||
        activePlayerIndex >= PLAYER_COUNT)
    ) {
      badRequest(res, `Invalid activePlayerIndex: ${String(activePlayerIndex)}`);
      return;
    }
    const data = store.round('kd').update((kd) => {
      if (gamemode !== undefined) kd.gamemode = gamemode;
      if (activePlayerIndex !== undefined) kd.activePlayerIndex = activePlayerIndex;
    });
    emitRoundUpdate(io, 'kd', data);
    if (gamemode !== undefined) io.emit(KD_GAMEMODE_EVENT, gamemode);
    res.json(data);
  });

  // ------------------------------------------------------------------ imports

  router.post('/api/match/import-excel', adminOnly, (req, res) => {
    if (typeof req.body !== 'object' || req.body === null) {
      badRequest(res, 'Missing workbook payload');
      return;
    }
    try {
      const rounds = excelImport.import(req.body);
      for (const kind of ROUND_KINDS) {
        const data = store.round(kind).set(rounds[kind]);
        emitRoundUpdate(io, kind, data);
      }
      res.json(rounds);
    } catch (err) {
      log(err, LogLevel.Error);
      badRequest(res, err instanceof Error ? err.message : String(err));
    }
  });

  router.post(
    API_PATHS.importLegion,
    adminOnly,
    (req: Request, res: Response) => {
      upload.single(UPLOAD_FIELD)(req, res, async (err: unknown) => {
        if (err) {
          handleUploadError(res, err);
          return;
        }
        const file = req.file;
        if (!file) {
          badRequest(res, `Missing multipart field "${UPLOAD_FIELD}"`);
          return;
        }
        try {
          const result = await legionFiles.importArchive(file.buffer);
          io.emit(MATCH_UPDATE_EVENT, store.getMatch());
          for (const kind of ROUND_KINDS) {
            emitRoundUpdate(io, kind, store.round(kind).get());
          }
          res.json(result);
        } catch (importErr) {
          log(importErr, LogLevel.Error);
          serverError(res, importErr);
        }
      });
    },
  );

  router.get(API_PATHS.exportLegion, adminOnly, async (_req, res) => {
    try {
      const archive = await legionFiles.exportArchive();
      const safeName = archive.fileName.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'match.legion';
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.send(archive.buffer);
    } catch (err) {
      log(err, LogLevel.Error);
      serverError(res, err);
    }
  });

  return router;
}

function handleUploadError(res: Response, err: unknown): void {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    const error: ApiError = { error: 'File too large' };
    res.status(413).json(error);
    return;
  }
  badRequest(res, err instanceof Error ? err.message : String(err));
}
