/**
 * Port of utils/excelHandler.mjs: turns the parsed-workbook JSON the client
 * sends (one array of rows per sheet, as produced by xlsx sheet_to_json) into
 * round data — but emitting the CANONICAL contracts instead of the legacy
 * shapes, and persisting through MatchStore instead of raw fs writes.
 *
 * The old importer's semantics are preserved verbatim, including its quirks:
 * - KD audio questions (media in column __EMPTY_3) still read their media
 *   file from __EMPTY_2, so they usually end up with no mediaFile — exactly
 *   what the old code did.
 * - The obstacle (CNV) question is imported with value 40, as before; the
 *   VCNV round logic recomputes it from the revealed-row count during play.
 */
import {
  ChpRound,
  KdQuestion,
  KdRound,
  RoundDataMap,
  TtAnswer,
  TtQuestion,
  TtRound,
  VcnvQuestion,
  VcnvRound,
  VdQuestion,
  VdRound,
} from '../contracts/game';
import { PLAYER_COUNT, VCNV_ROW_COUNT, VCNV_ROW_POINTS } from '../game.rules';
import { MatchStore } from '../state/match.store';

type ExcelRow = Record<string, unknown>;

interface Workbook {
  kd: ExcelRow[];
  vcnv: ExcelRow[];
  tt: ExcelRow[];
  vd: ExcelRow[];
}

// Sheet_to_json puts unlabeled columns under __EMPTY* keys; the first labeled
// column of the VD sheet carries the point-value label.
const COL_QUESTION = '__EMPTY';
const COL_ANSWER = '__EMPTY_1';
const COL_MEDIA = '__EMPTY_2';
const COL_MEDIA_2 = '__EMPTY_3';
const COL_MEDIA_3 = '__EMPTY_4';
const COL_VD_VALUE = 'VỀ ĐÍCH';

// Fixed row layout of the excel template (row indexes into sheet_to_json output).
const KD_SINGLEPLAYER_ROWS = { first: 3, last: 26 } as const;
const KD_MULTIPLAYER_ROWS = { first: 29, last: 40 } as const;
const KD_QUESTIONS_PER_PLAYER = 6;
const VCNV_OBSTACLE_ROW = 1;
const VCNV_FIRST_ROW = 3;
const TT_FIRST_ROW = 2;
const TT_QUESTION_COUNT = 4;
/** Only the last TT question (index 3) is a video question. */
const TT_VIDEO_QUESTION_INDEX = TT_QUESTION_COUNT - 1;
const VD_POOL_ROWS: ReadonlyArray<{ first: number; last: number }> = [
  { first: 3, last: 8 },
  { first: 11, last: 16 },
  { first: 19, last: 24 },
  { first: 27, last: 32 },
];
/** CHP questions live at the bottom of the VD sheet. */
const CHP_ROWS = { first: 35, last: 37 } as const;

// Game values the excel template encodes (kept verbatim from excelHandler.mjs).
const VD_LOW_VALUE_LABEL = 'Câu hỏi 20 điểm';
const VD_LOW_VALUE = 20;
const VD_HIGH_VALUE = 30;
/** The old importer hardcoded the obstacle at 40; play recomputes it anyway. */
const IMPORTED_OBSTACLE_VALUE = 40;

export class ExcelImportService {
  constructor(private readonly store: MatchStore) {}

  /**
   * Convert + persist all five rounds. Returns the canonical round data for
   * the caller to emit over the socket (old handler emitted the array form).
   */
  import(workbookJson: unknown): RoundDataMap {
    const workbook = toWorkbook(workbookJson);
    const data: RoundDataMap = {
      kd: this.buildKd(workbook.kd),
      vcnv: this.buildVcnv(workbook.vcnv),
      tt: this.buildTt(workbook.tt),
      vd: this.buildVd(workbook.vd),
      chp: this.buildChp(workbook.vd),
    };
    this.store.round('kd').set(data.kd);
    this.store.round('vcnv').set(data.vcnv);
    this.store.round('tt').set(data.tt);
    this.store.round('vd').set(data.vd);
    this.store.round('chp').set(data.chp);
    return data;
  }

  // KD -------------------------------------------------------------------

  private buildKd(rows: ExcelRow[]): KdRound {
    const singleplayer: KdQuestion[][] = Array.from({ length: PLAYER_COUNT }, () => []);
    let questionCount = 0;
    let playerIndex = 0;
    for (let i = KD_SINGLEPLAYER_ROWS.first; i <= KD_SINGLEPLAYER_ROWS.last; i++) {
      const row = rows[i];
      if (!row || !hasCell(row, COL_QUESTION) || playerIndex >= PLAYER_COUNT) continue;
      singleplayer[playerIndex].push(kdQuestionFromRow(row));
      questionCount++;
      if (questionCount === KD_QUESTIONS_PER_PLAYER) {
        questionCount = 0;
        playerIndex++;
      }
    }

    const multiplayer: KdQuestion[] = [];
    for (let i = KD_MULTIPLAYER_ROWS.first; i <= KD_MULTIPLAYER_ROWS.last; i++) {
      const row = rows[i];
      if (!row || !hasCell(row, COL_QUESTION)) continue;
      multiplayer.push(kdQuestionFromRow(row));
    }

    // The old importer always produced gamemode "M" with player 0 on the podium.
    return {
      questions: { singleplayer, multiplayer },
      gamemode: 'M',
      activePlayerIndex: 0,
    };
  }

  // VCNV -----------------------------------------------------------------

  private buildVcnv(rows: ExcelRow[]): VcnvRound {
    const questions: VcnvQuestion[] = [];
    for (let i = 0; i < VCNV_ROW_COUNT; i++) {
      const row = rows[VCNV_FIRST_ROW + i] ?? {};
      const audioFile = optionalCell(row, COL_MEDIA);
      const question: VcnvQuestion = {
        id: i + 1,
        type: audioFile !== undefined ? 'HN_S' : 'HN',
        value: VCNV_ROW_POINTS,
        isOpen: false,
        isShown: false,
        question: cellText(row, COL_QUESTION),
        answer: cellText(row, COL_ANSWER),
      };
      if (audioFile !== undefined) question.audioFile = audioFile;
      questions.push(question);
    }

    const obstacleRow = rows[VCNV_OBSTACLE_ROW] ?? {};
    const obstacle: VcnvQuestion = {
      id: VCNV_ROW_COUNT + 1,
      type: 'CNV',
      value: IMPORTED_OBSTACLE_VALUE,
      isOpen: false,
      isShown: false,
      question: '',
      answer: cellText(obstacleRow, COL_QUESTION),
    };
    const obstacleImage = optionalCell(obstacleRow, COL_MEDIA);
    if (obstacleImage !== undefined) obstacle.imageFile = obstacleImage;
    questions.push(obstacle);

    return {
      questions,
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

  // TT -------------------------------------------------------------------

  private buildTt(rows: ExcelRow[]): TtRound {
    const questions: TtQuestion[] = [];
    for (let i = 0; i < TT_QUESTION_COUNT; i++) {
      const row = rows[TT_FIRST_ROW + i] ?? {};
      // Like the old importer, a row missing question or answer still yields
      // an empty placeholder question so the round always has 4 slots.
      const question: TtQuestion = { id: i + 1, question: '', answer: '', type: 'image' };
      if (hasCell(row, COL_QUESTION) && hasCell(row, COL_ANSWER)) {
        question.question = cellText(row, COL_QUESTION);
        question.answer = cellText(row, COL_ANSWER);
        if (i < TT_VIDEO_QUESTION_INDEX) {
          question.type = 'image';
          const questionImage = optionalCell(row, COL_MEDIA);
          if (questionImage !== undefined) question.questionImage = questionImage;
          const answerImage = optionalCell(row, COL_MEDIA_2);
          if (answerImage !== undefined) question.answerImage = answerImage;
        } else {
          question.type = 'video';
          const videoFile = optionalCell(row, COL_MEDIA);
          if (videoFile !== undefined) question.videoFile = videoFile;
        }
      }
      questions.push(question);
    }

    const playerAnswers: TtAnswer[] = Array.from({ length: PLAYER_COUNT }, (_, index) => ({
      playerIndex: index,
      answer: '',
      timestamp: 0,
      readableTime: '',
      correct: false,
    }));

    return {
      questions,
      playerAnswers,
      showResults: false,
      activeQuestionIndex: 0,
      showAnswer: false,
      timerStartTimestamp: 0,
    };
  }

  // VD -------------------------------------------------------------------

  private buildVd(rows: ExcelRow[]): VdRound {
    const questionPools = VD_POOL_ROWS.map(({ first, last }) => {
      const pool: VdQuestion[] = [];
      for (let i = first; i <= last; i++) {
        pool.push(vdQuestionFromRow(rows[i] ?? {}));
      }
      return pool;
    });

    return {
      questionPools,
      activePlayerIndex: 0,
      isQuestionPickerShown: false,
      // One picker slot per question in a pool (the old importer's 6 falses).
      pickedQuestions: Array.from({ length: questionPools[0].length }, () => false),
      hopeStarActive: false,
    };
  }

  // CHP ------------------------------------------------------------------

  private buildChp(vdRows: ExcelRow[]): ChpRound {
    const questions: ChpRound['questions'] = [];
    for (let i = CHP_ROWS.first; i <= CHP_ROWS.last; i++) {
      const row = vdRows[i];
      if (!row || !hasCell(row, COL_QUESTION) || !hasCell(row, COL_ANSWER)) continue;
      questions.push({
        question: cellText(row, COL_QUESTION),
        answer: cellText(row, COL_ANSWER),
      });
    }
    return {
      questions,
      playedPlayers: Array.from({ length: PLAYER_COUNT }, () => false),
    };
  }
}

// --------------------------------------------------------------- row mapping

function kdQuestionFromRow(row: ExcelRow): KdQuestion {
  const question: KdQuestion = {
    question: cellText(row, COL_QUESTION),
    answer: cellText(row, COL_ANSWER),
    type: 'N',
  };
  if (hasCell(row, COL_MEDIA)) {
    question.type = 'P';
    question.mediaFile = cellText(row, COL_MEDIA);
  } else if (hasCell(row, COL_MEDIA_2)) {
    question.type = 'A';
    // Old-importer quirk preserved: audio rows read __EMPTY_2 (empty here),
    // so no mediaFile ends up set — matching excelHandler.mjs exactly.
    const mediaFile = optionalCell(row, COL_MEDIA);
    if (mediaFile !== undefined) question.mediaFile = mediaFile;
  }
  return question;
}

function vdQuestionFromRow(row: ExcelRow): VdQuestion {
  const question: VdQuestion = {
    value: cellText(row, COL_VD_VALUE) === VD_LOW_VALUE_LABEL ? VD_LOW_VALUE : VD_HIGH_VALUE,
    type: 'N',
    question: cellText(row, COL_QUESTION),
    answer: cellText(row, COL_ANSWER),
  };
  const video = optionalCell(row, COL_MEDIA);
  const image = optionalCell(row, COL_MEDIA_2);
  const audio = optionalCell(row, COL_MEDIA_3);
  if (video !== undefined) {
    question.type = 'V';
    question.mediaFile = video;
  } else if (image !== undefined) {
    question.type = 'I';
    question.mediaFile = image;
  } else if (audio !== undefined) {
    question.type = 'A';
    question.mediaFile = audio;
  }
  return question;
}

// ------------------------------------------------------------------- helpers

function toWorkbook(raw: unknown): Workbook {
  const record =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    kd: sheetRows(record['kd']),
    vcnv: sheetRows(record['vcnv']),
    tt: sheetRows(record['tt']),
    vd: sheetRows(record['vd']),
  };
}

function sheetRows(sheet: unknown): ExcelRow[] {
  if (!Array.isArray(sheet)) return [];
  return sheet.map((row) =>
    typeof row === 'object' && row !== null ? (row as ExcelRow) : {},
  );
}

/** The old importer used plain truthiness on cells; keep that behavior. */
function hasCell(row: ExcelRow, key: string): boolean {
  return Boolean(row[key]);
}

function cellText(row: ExcelRow, key: string): string {
  const value = row[key];
  return value === undefined || value === null ? '' : String(value);
}

function optionalCell(row: ExcelRow, key: string): string | undefined {
  return hasCell(row, key) ? String(row[key]) : undefined;
}
