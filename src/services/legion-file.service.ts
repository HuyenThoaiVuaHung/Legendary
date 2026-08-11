import AdmZip from 'adm-zip';
import { randomUUID } from 'crypto';
import { LegionImportResponse } from '../contracts/api';
import {
  ChpRound,
  KdQuestion,
  KdQuestionType,
  KdRound,
  MatchPosition,
  RoundKind,
  ROUND_KINDS,
  TtQuestion,
  TtRound,
  VcnvQuestion,
  VcnvRound,
  VdQuestion,
  VdQuestionType,
  VdRound,
} from '../contracts/game';
import {
  CHP_CORRECT_POINTS,
  KD_CORRECT_POINTS,
  OBSTACLE_VALUE_BY_REVEALED_COUNT,
  PLAYER_COUNT,
  VCNV_OBSTACLE_INDEX,
  VCNV_ROW_COUNT,
  VCNV_ROW_POINTS,
} from '../game.rules';
import { MatchStore } from '../state/match.store';
import { MediaStore, sanitizeFileName } from './media.store';

// ---------------------------------------------------------------------------
// Editor (.legion) format — external contract owned by the Legion editor.
// These are the only places (besides state/legacy.adapter.ts) where non-
// canonical field names may appear (see PLAN: migration rules).
// ---------------------------------------------------------------------------

/** Numeric enum used by the editor's question JSON. */
enum EditorQuestionType {
  Text = 0,
  Image = 1,
  Audio = 2,
  Video = 3,
}

interface EditorQuestion {
  question: string;
  answer: string;
  type: EditorQuestionType;
  value: number;
  mediaSrcName?: string;
  secondaryMediaSrcName?: string;
}

interface EditorPlayer {
  name: string;
  score: number;
  isReady: boolean;
}

interface EditorMatchData {
  matchName: string;
  matchVersion: number;
  matchPos: number;
  players: EditorPlayer[];
}

interface EditorKdQuestionData {
  /** Keyed by O24ControlType; values are IQuestion[] or IQuestion[][]. */
  o24Questions?: Record<string, EditorQuestion[] | EditorQuestion[][]>;
  o23Questions?: EditorQuestion[][];
}

interface EditorVcnvQuestionData {
  questions: EditorQuestion[];
  cnv: string;
  cnvMediaSrcNames?: string[];
}

interface EditorQuestionBank {
  kd?: EditorKdQuestionData;
  vcnv?: EditorVcnvQuestionData;
  tt?: { questions: EditorQuestion[] };
  vd?: { questions: EditorQuestion[][] };
  chp?: { questions: EditorQuestion[] };
}

interface EditorData {
  uiConfig?: unknown;
  matchData: EditorMatchData;
  questionBank: EditorQuestionBank;
  uid?: string;
  dateModified?: number;
}

// ---------------------------------------------------------------------------
// Format constants
// ---------------------------------------------------------------------------

const EDITOR_DATA_ENTRY = 'editorData.json';
const MAX_ARCHIVE_ENTRIES = 1000;
const MAX_ARCHIVE_TOTAL_BYTES = 1024 * 1024 * 1024; // 1 GiB decompressed
/** Media folders a .legion archive may contain, mirrored as media kinds. */
const MEDIA_FOLDERS = [...ROUND_KINDS, 'misc'] as const;
type MediaFolder = (typeof MEDIA_FOLDERS)[number];

/** Round files an import writes; persisted paths are relative to server root. */
const IMPORTED_ROUND_DIR = 'match_data/round_data';
const importedRoundFile = (kind: RoundKind): string =>
  `${IMPORTED_ROUND_DIR}/imported_${kind}.json`;

/** A freshly imported match starts at the home screen. */
const IMPORT_START_POSITION: MatchPosition = 'H';
/** matchVersion the export declares (the current editor format). */
const EXPORT_MATCH_VERSION = 24;
/** Editor MatchPosition.IDLE — exports always start idle. */
const EDITOR_MATCH_POS_IDLE = 0;
/** Sentinel: no TT question is active yet. */
const NO_ACTIVE_QUESTION = -1;
/** Editor requires a point value on every question; TT scores by placement. */
const NO_STATIC_VALUE = 0;
/** Minimal valid IInterfaceConfig for exported archives (Pallette.RED). */
const DEFAULT_UI_CONFIG = { darkMode: false, pallette: 0, miscImageSrcNames: {} };
const EXPORT_FALLBACK_NAME = 'match';

const KD_TYPE_BY_EDITOR: Record<EditorQuestionType, KdQuestionType> = {
  [EditorQuestionType.Text]: 'N',
  [EditorQuestionType.Image]: 'P',
  [EditorQuestionType.Audio]: 'A',
  [EditorQuestionType.Video]: 'N',
};

const VD_TYPE_BY_EDITOR: Record<EditorQuestionType, VdQuestionType> = {
  [EditorQuestionType.Text]: 'N',
  [EditorQuestionType.Image]: 'I',
  [EditorQuestionType.Audio]: 'A',
  [EditorQuestionType.Video]: 'V',
};

const EDITOR_TYPE_BY_VD: Record<VdQuestionType, EditorQuestionType> = {
  N: EditorQuestionType.Text,
  I: EditorQuestionType.Image,
  A: EditorQuestionType.Audio,
  V: EditorQuestionType.Video,
};

const EDITOR_TYPE_BY_KD: Record<KdQuestionType, EditorQuestionType> = {
  N: EditorQuestionType.Text,
  P: EditorQuestionType.Image,
  A: EditorQuestionType.Audio,
};

/**
 * Imports and exports the editor's `.legion`/`.lg` archives (a ZIP holding
 * editorData.json plus per-kind media folders), converting between the
 * editor's question bank and the canonical round contracts.
 */
export class LegionFileService {
  constructor(
    private readonly store: MatchStore,
    private readonly media: MediaStore,
  ) {}

  /**
   * Unpack an archive: extract media into the media store, convert the
   * question bank into fresh round files, and reset the match state.
   * The caller (HTTP route) is responsible for emitting the update-* pushes.
   */
  importArchive(buffer: Buffer): LegionImportResponse {
    const zip = new AdmZip(buffer);
    const editorData = readEditorData(zip);
    const mediaCounts = this.extractMedia(zip);

    const matchName = editorData.matchData.matchName ?? '';
    const importedPlayers = editorData.matchData.players ?? [];

    this.store.updateMatch((match) => {
      match.matchName = matchName;
      match.position = IMPORT_START_POSITION;
      match.pausedTimerSeconds = 0;
      match.players = Array.from({ length: PLAYER_COUNT }, (_, index) => ({
        id: index + 1,
        name: importedPlayers[index]?.name ?? match.players[index]?.name ?? '',
        score: 0,
        isReady: false,
      }));
      for (const kind of ROUND_KINDS) {
        match.roundFiles[kind] = importedRoundFile(kind);
      }
    });

    const bank = editorData.questionBank;
    this.store.round('kd').set(mapKdRound(bank.kd));
    this.store.round('vcnv').set(mapVcnvRound(bank.vcnv));
    this.store.round('tt').set(mapTtRound(bank.tt?.questions ?? []));
    this.store.round('vd').set(mapVdRound(bank.vd?.questions ?? []));
    this.store.round('chp').set(mapChpRound(bank.chp?.questions ?? []));

    return { matchName, mediaCounts };
  }

  /**
   * Best-effort inverse of importArchive: rebuild editorData.json from the
   * current canonical data and bundle every referenced media file that still
   * exists on disk.
   */
  exportArchive(): { fileName: string; buffer: Buffer } {
    const match = this.store.getMatch();
    const kd = this.store.round('kd').get();
    const vcnv = this.store.round('vcnv').get();
    const tt = this.store.round('tt').get();
    const vd = this.store.round('vd').get();
    const chp = this.store.round('chp').get();

    const obstacle = vcnv.questions.find((q) => q.type === 'CNV');
    const vcnvRows = vcnv.questions.filter((q) => q.type !== 'CNV');

    const editorData: EditorData = {
      uid: randomUUID(),
      dateModified: Date.now(),
      uiConfig: DEFAULT_UI_CONFIG,
      matchData: {
        matchName: match.matchName,
        matchVersion: EXPORT_MATCH_VERSION,
        matchPos: EDITOR_MATCH_POS_IDLE,
        players: match.players.map((p) => ({
          name: p.name,
          score: p.score,
          isReady: p.isReady,
        })),
      },
      questionBank: {
        kd: {
          o24Questions: {
            multiplayer: kd.questions.multiplayer.map(kdToEditor),
            singleplayer: kd.questions.singleplayer.map((pool) => pool.map(kdToEditor)),
          },
        },
        vcnv: {
          questions: vcnvRows.map(vcnvToEditor),
          cnv: obstacle?.answer ?? '',
          cnvMediaSrcNames: obstacle?.imageFile ? [obstacle.imageFile] : [],
        },
        tt: { questions: tt.questions.map(ttToEditor) },
        vd: { questions: vd.questionPools.map((pool) => pool.map(vdToEditor)) },
        chp: {
          questions: chp.questions.map((q) => ({
            question: q.question,
            answer: q.answer,
            type: EditorQuestionType.Text,
            value: CHP_CORRECT_POINTS,
          })),
        },
      },
    };

    const zip = new AdmZip();
    zip.addFile(EDITOR_DATA_ENTRY, Buffer.from(JSON.stringify(editorData)));
    this.addMediaFiles(zip, collectReferencedMedia({ kd, vcnv, tt, vd }));

    const baseName = sanitizeFileName(match.matchName);
    const fileName = `${baseName === 'file' ? EXPORT_FALLBACK_NAME : baseName}.legion`;
    return { fileName, buffer: zip.toBuffer() };
  }

  // ------------------------------------------------------------------ media

  private extractMedia(zip: AdmZip): Partial<Record<MediaFolder, number>> {
    const counts: Partial<Record<MediaFolder, number>> = {};
    let extractedEntries = 0;
    let extractedBytes = 0;
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || entry.entryName === EDITOR_DATA_ENTRY) continue;
      const segments = entry.entryName.replace(/\\/g, '/').split('/').filter(Boolean);
      if (segments.length < 2) continue;
      const folder = segments[0] as MediaFolder;
      if (!MEDIA_FOLDERS.includes(folder)) continue;
      // Zip-bomb guard: bound decompressed output, not just the upload size.
      if (extractedEntries + 1 > MAX_ARCHIVE_ENTRIES) {
        throw new Error(`Archive has more than ${MAX_ARCHIVE_ENTRIES} media entries`);
      }
      const data = entry.getData();
      if (extractedBytes + data.length > MAX_ARCHIVE_TOTAL_BYTES) {
        throw new Error('Archive decompresses past the allowed total media size');
      }
      extractedEntries += 1;
      extractedBytes += data.length;
      const name = segments[segments.length - 1];
      this.media.saveWithName(folder, name, data);
      counts[folder] = (counts[folder] ?? 0) + 1;
    }
    return counts;
  }

  private addMediaFiles(zip: AdmZip, referenced: Map<RoundKind, Set<string>>): void {
    for (const [kind, names] of referenced) {
      for (const name of names) {
        const path = this.media.resolve(kind, name);
        if (path) zip.addLocalFile(path, kind, name);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// editorData parsing
// ---------------------------------------------------------------------------

function readEditorData(zip: AdmZip): EditorData {
  const entry = zip.getEntry(EDITOR_DATA_ENTRY);
  if (!entry) {
    throw new Error(`Invalid .legion file: missing ${EDITOR_DATA_ENTRY}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(entry.getData().toString('utf8'));
  } catch {
    throw new Error(`Invalid .legion file: ${EDITOR_DATA_ENTRY} is not valid JSON`);
  }
  const data = parsed as Partial<EditorData> | null;
  if (!data || typeof data !== 'object' || !data.matchData || !data.questionBank) {
    throw new Error(
      `Invalid .legion file: ${EDITOR_DATA_ENTRY} must contain matchData and questionBank`,
    );
  }
  return data as EditorData;
}

// ---------------------------------------------------------------------------
// Editor question bank → canonical rounds
// ---------------------------------------------------------------------------

function mapKdRound(src: EditorKdQuestionData | undefined): KdRound {
  const { singleplayer, multiplayer } = splitKdPools(src);
  return {
    questions: {
      singleplayer: singleplayer.map((pool) => pool.map(editorToKd)),
      multiplayer: multiplayer.map(editorToKd),
    },
    gamemode: 'S',
    activePlayerIndex: 0,
  };
}

/**
 * The editor keys o24Questions by its O24ControlType enum, whose runtime
 * values are not part of this repo. Prefer o23Questions and the literal
 * singleplayer/multiplayer keys, then fall back to detecting each pool by
 * shape (singleplayer is a nested array, multiplayer is flat).
 */
function splitKdPools(src: EditorKdQuestionData | undefined): {
  singleplayer: EditorQuestion[][];
  multiplayer: EditorQuestion[];
} {
  let singleplayer: EditorQuestion[][] | undefined = src?.o23Questions;
  let multiplayer: EditorQuestion[] | undefined;
  for (const [key, pool] of Object.entries(src?.o24Questions ?? {})) {
    if (!Array.isArray(pool)) continue;
    const isNested = pool.length > 0 && Array.isArray(pool[0]);
    if (key === 'singleplayer' || (key !== 'multiplayer' && isNested)) {
      singleplayer ??= pool as EditorQuestion[][];
    } else {
      multiplayer ??= pool as EditorQuestion[];
    }
  }
  return { singleplayer: singleplayer ?? [], multiplayer: multiplayer ?? [] };
}

function editorToKd(q: EditorQuestion): KdQuestion {
  return {
    question: q.question,
    answer: q.answer,
    type: KD_TYPE_BY_EDITOR[q.type] ?? 'N',
    ...(q.mediaSrcName ? { mediaFile: q.mediaSrcName } : {}),
  };
}

function mapVcnvRound(src: EditorVcnvQuestionData | undefined): VcnvRound {
  const rows = (src?.questions ?? [])
    .slice(0, VCNV_ROW_COUNT)
    .map((q, index): VcnvQuestion => ({
      id: index + 1,
      type: 'HN',
      value: VCNV_ROW_POINTS,
      isOpen: false,
      isShown: false,
      question: q.question,
      answer: q.answer,
      ...(q.mediaSrcName ? { imageFile: q.mediaSrcName } : {}),
    }));
  const obstacleImage = src?.cnvMediaSrcNames?.[0];
  const obstacle: VcnvQuestion = {
    id: VCNV_OBSTACLE_INDEX + 1,
    type: 'CNV',
    value: OBSTACLE_VALUE_BY_REVEALED_COUNT[0],
    isOpen: false,
    isShown: false,
    question: '',
    answer: src?.cnv ?? '',
    ...(obstacleImage ? { imageFile: obstacleImage } : {}),
  };
  return {
    questions: [...rows, obstacle],
    playerAnswers: Array.from({ length: PLAYER_COUNT }, () => ({
      answer: '',
      correct: false,
    })),
    showResults: false,
    disabledPlayers: [],
    openRowCount: 0,
    obstacleBuzzes: [],
  };
}

function mapTtRound(questions: EditorQuestion[]): TtRound {
  return {
    questions: questions.map((q, index): TtQuestion => {
      const base = { id: index + 1, question: q.question, answer: q.answer };
      if (q.type === EditorQuestionType.Video) {
        return {
          ...base,
          type: 'video',
          ...(q.mediaSrcName ? { videoFile: q.mediaSrcName } : {}),
        };
      }
      return {
        ...base,
        type: 'image',
        ...(q.mediaSrcName ? { questionImage: q.mediaSrcName } : {}),
        ...(q.secondaryMediaSrcName ? { answerImage: q.secondaryMediaSrcName } : {}),
      };
    }),
    playerAnswers: Array.from({ length: PLAYER_COUNT }, (_, playerIndex) => ({
      playerIndex,
      answer: '',
      timestamp: 0,
      readableTime: '',
      correct: false,
    })),
    showResults: false,
    activeQuestionIndex: NO_ACTIVE_QUESTION,
    showAnswer: false,
    timerStartTimestamp: 0,
  };
}

function mapVdRound(pools: EditorQuestion[][]): VdRound {
  return {
    questionPools: pools.map((pool) =>
      pool.map((q): VdQuestion => ({
        value: q.value,
        type: VD_TYPE_BY_EDITOR[q.type] ?? 'N',
        question: q.question,
        answer: q.answer,
        ...(q.mediaSrcName ? { mediaFile: q.mediaSrcName } : {}),
      })),
    ),
    activePlayerIndex: 0,
    isQuestionPickerShown: false,
    pickedQuestions: [],
    hopeStarActive: false,
  };
}

function mapChpRound(questions: EditorQuestion[]): ChpRound {
  return {
    questions: questions.map((q) => ({ question: q.question, answer: q.answer })),
    playedPlayers: Array.from({ length: PLAYER_COUNT }, () => false),
  };
}

// ---------------------------------------------------------------------------
// Canonical rounds → editor question bank (export)
// ---------------------------------------------------------------------------

function kdToEditor(q: KdQuestion): EditorQuestion {
  return {
    question: q.question,
    answer: q.answer,
    type: EDITOR_TYPE_BY_KD[q.type] ?? EditorQuestionType.Text,
    value: KD_CORRECT_POINTS,
    ...(q.mediaFile ? { mediaSrcName: q.mediaFile } : {}),
  };
}

function vcnvToEditor(q: VcnvQuestion): EditorQuestion {
  const mediaName = q.imageFile ?? q.audioFile;
  const type = q.imageFile
    ? EditorQuestionType.Image
    : q.audioFile
      ? EditorQuestionType.Audio
      : EditorQuestionType.Text;
  return {
    question: q.question,
    answer: q.answer,
    type,
    value: q.value,
    ...(mediaName ? { mediaSrcName: mediaName } : {}),
  };
}

function ttToEditor(q: TtQuestion): EditorQuestion {
  const mediaName = q.type === 'video' ? q.videoFile : q.questionImage;
  return {
    question: q.question,
    answer: q.answer,
    type: q.type === 'video' ? EditorQuestionType.Video : EditorQuestionType.Image,
    value: NO_STATIC_VALUE,
    ...(mediaName ? { mediaSrcName: mediaName } : {}),
    ...(q.answerImage ? { secondaryMediaSrcName: q.answerImage } : {}),
  };
}

function vdToEditor(q: VdQuestion): EditorQuestion {
  return {
    question: q.question,
    answer: q.answer,
    type: EDITOR_TYPE_BY_VD[q.type] ?? EditorQuestionType.Text,
    value: q.value,
    ...(q.mediaFile ? { mediaSrcName: q.mediaFile } : {}),
  };
}

// ---------------------------------------------------------------------------
// Media reference collection (export)
// ---------------------------------------------------------------------------

function collectReferencedMedia(rounds: {
  kd: KdRound;
  vcnv: VcnvRound;
  tt: TtRound;
  vd: VdRound;
}): Map<RoundKind, Set<string>> {
  const referenced = new Map<RoundKind, Set<string>>();
  const add = (kind: RoundKind, name: string | undefined): void => {
    if (!name) return;
    const names = referenced.get(kind) ?? new Set<string>();
    names.add(name);
    referenced.set(kind, names);
  };

  for (const pool of rounds.kd.questions.singleplayer) {
    for (const q of pool) add('kd', q.mediaFile);
  }
  for (const q of rounds.kd.questions.multiplayer) add('kd', q.mediaFile);
  for (const q of rounds.vcnv.questions) {
    add('vcnv', q.imageFile);
    add('vcnv', q.audioFile);
  }
  for (const q of rounds.tt.questions) {
    add('tt', q.questionImage);
    add('tt', q.answerImage);
    add('tt', q.videoFile);
  }
  for (const pool of rounds.vd.questionPools) {
    for (const q of pool) add('vd', q.mediaFile);
  }
  return referenced;
}
