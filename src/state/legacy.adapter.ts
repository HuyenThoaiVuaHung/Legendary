/**
 * Legacy JSON → canonical contract migration, plus canonical defaults.
 *
 * The ONLY place (besides services/legion-file.service.ts, whose .legion
 * format is external) where old field names — matchPos, KDFilePath, ifOpen,
 * CNVPlayers, currentPlayerId, … — may appear. MatchStore calls
 * normalizeMatchState / normalizeRoundData on every file load; anything it
 * persists is canonical.
 *
 * Index convention reminders (see PLAN):
 * - VCNV CNVPlayers[].id was ALREADY 0-based (old code used
 *   socketIDs.indexOf) → copied verbatim into ObstacleBuzz.playerIndex.
 * - TT playerAnswers[].id was 1-based in the old server (it scored via
 *   players[id - 1]) → playerIndex = id - 1. Files written by the old excel
 *   importer carry 0-based ids (a legacy bug); those are detected by the
 *   presence of id 0 and copied verbatim.
 * - VD currentPlayerId was 1-based → activePlayerIndex = currentPlayerId - 1,
 *   clamped to 0 (old importers wrote 0 for "unset").
 */
import {
  ChpRound,
  KdQuestion,
  KdRound,
  MatchPosition,
  MatchState,
  MATCH_POSITIONS,
  ObstacleBuzz,
  Player,
  PlayerAnswer,
  RoundDataMap,
  RoundKind,
  ROUND_KINDS,
  TtAnswer,
  TtQuestion,
  TtRound,
  VcnvQuestion,
  VcnvRound,
  VdQuestion,
  VdRound,
} from '../contracts/game';
import {
  OBSTACLE_VALUE_BY_REVEALED_COUNT,
  PLAYER_COUNT,
  VCNV_ROW_COUNT,
  VCNV_ROW_POINTS,
} from '../game.rules';

const DEFAULT_MATCH_NAME = 'Legendary';
const DEFAULT_PLAYER_NAME_PREFIX = 'Thí sinh';
const DEFAULT_POSITION: MatchPosition = 'H';
const ROUND_DATA_DIR = 'match_data/round_data';
/** A fresh obstacle is worth its zero-rows-revealed value. */
const NO_ROWS_REVEALED = 0;

// ------------------------------------------------------------------- defaults

export function defaultMatchState(): MatchState {
  return {
    matchName: DEFAULT_MATCH_NAME,
    position: DEFAULT_POSITION,
    players: Array.from({ length: PLAYER_COUNT }, (_, index) => defaultPlayer(index)),
    roundFiles: Object.fromEntries(
      ROUND_KINDS.map((kind) => [kind, `${ROUND_DATA_DIR}/${kind}.json`]),
    ) as Record<RoundKind, string>,
    pausedTimerSeconds: 0,
  };
}

function defaultPlayer(index: number): Player {
  return {
    id: index + 1,
    name: `${DEFAULT_PLAYER_NAME_PREFIX} ${index + 1}`,
    score: 0,
    isReady: false,
  };
}

function defaultKdRound(): KdRound {
  return {
    questions: {
      singleplayer: Array.from({ length: PLAYER_COUNT }, () => []),
      multiplayer: [],
    },
    gamemode: 'S',
    activePlayerIndex: 0,
  };
}

function defaultVcnvRound(): VcnvRound {
  const questions: VcnvQuestion[] = Array.from(
    { length: VCNV_ROW_COUNT },
    (_, index): VcnvQuestion => ({
      id: index + 1,
      type: 'HN',
      value: VCNV_ROW_POINTS,
      isOpen: false,
      isShown: false,
      question: '',
      answer: '',
    }),
  );
  questions.push({
    id: VCNV_ROW_COUNT + 1,
    type: 'CNV',
    value: OBSTACLE_VALUE_BY_REVEALED_COUNT[NO_ROWS_REVEALED],
    isOpen: false,
    isShown: false,
    question: '',
    answer: '',
  });
  return {
    questions,
    playerAnswers: emptyPlayerAnswers(),
    showResults: false,
    disabledPlayers: [],
    openRowCount: 0,
    obstacleBuzzes: [],
  };
}

function defaultTtRound(): TtRound {
  return {
    questions: [],
    playerAnswers: emptyTtAnswers(),
    showResults: false,
    activeQuestionIndex: 0,
    showAnswer: false,
    timerStartTimestamp: 0,
  };
}

function defaultVdRound(): VdRound {
  return {
    questionPools: Array.from({ length: PLAYER_COUNT }, () => []),
    activePlayerIndex: 0,
    isQuestionPickerShown: false,
    pickedQuestions: [],
    hopeStarActive: false,
  };
}

function defaultChpRound(): ChpRound {
  return {
    questions: [],
    playedPlayers: Array.from({ length: PLAYER_COUNT }, () => false),
  };
}

function emptyPlayerAnswers(): PlayerAnswer[] {
  return Array.from({ length: PLAYER_COUNT }, () => ({ answer: '', correct: false }));
}

function emptyTtAnswers(): TtAnswer[] {
  return Array.from({ length: PLAYER_COUNT }, (_, index): TtAnswer => ({
    playerIndex: index,
    answer: '',
    timestamp: 0,
    readableTime: '',
    correct: false,
  }));
}

const ROUND_DEFAULTS: { [K in RoundKind]: () => RoundDataMap[K] } = {
  kd: defaultKdRound,
  vcnv: defaultVcnvRound,
  tt: defaultTtRound,
  vd: defaultVdRound,
  chp: defaultChpRound,
};

export function defaultRoundData<K extends RoundKind>(kind: K): RoundDataMap[K] {
  return ROUND_DEFAULTS[kind]();
}

// ---------------------------------------------------------------- match state

export function normalizeMatchState(raw: unknown): { state: MatchState; migrated: boolean } {
  if (!isRecord(raw)) return { state: defaultMatchState(), migrated: true };

  if (typeof raw['position'] === 'string' && isRecord(raw['roundFiles'])) {
    return { state: raw as unknown as MatchState, migrated: false };
  }

  if ('matchPos' in raw || 'KDFilePath' in raw) {
    const defaults = defaultMatchState();
    const position = asString(raw['matchPos'], DEFAULT_POSITION);
    return {
      state: {
        matchName: asString(raw['matchName'], DEFAULT_MATCH_NAME),
        position: (MATCH_POSITIONS as readonly string[]).includes(position)
          ? (position as MatchPosition)
          : DEFAULT_POSITION,
        players: padTo(asArray(raw['players']).map(normalizePlayer), PLAYER_COUNT, defaultPlayer),
        roundFiles: {
          kd: asString(raw['KDFilePath'], defaults.roundFiles.kd),
          vcnv: asString(raw['VCNVFilePath'], defaults.roundFiles.vcnv),
          tt: asString(raw['TangTocFilePath'], defaults.roundFiles.tt),
          vd: asString(raw['VedichFilePath'], defaults.roundFiles.vd),
          chp: asString(raw['ChpFilePath'], defaults.roundFiles.chp),
        },
        pausedTimerSeconds: asNumber(raw['pauseTime'], 0),
      },
      migrated: true,
    };
  }

  return { state: defaultMatchState(), migrated: true };
}

function normalizePlayer(raw: unknown, index: number): Player {
  const record: Record<string, unknown> = isRecord(raw) ? raw : {};
  const fallback = defaultPlayer(index);
  return {
    id: asNumber(record['id'], fallback.id),
    name: asString(record['name'], fallback.name),
    score: asNumber(record['score'], fallback.score),
    isReady: record['isReady'] === true,
  };
}

// ----------------------------------------------------------------- round data

export function normalizeRoundData<K extends RoundKind>(
  kind: K,
  raw: unknown,
): { data: RoundDataMap[K]; migrated: boolean } {
  return ROUND_NORMALIZERS[kind](raw);
}

const ROUND_NORMALIZERS: {
  [K in RoundKind]: (raw: unknown) => { data: RoundDataMap[K]; migrated: boolean };
} = {
  kd: normalizeKd,
  vcnv: normalizeVcnv,
  tt: normalizeTt,
  vd: normalizeVd,
  chp: normalizeChp,
};

// KD ---------------------------------------------------------------------

function normalizeKd(raw: unknown): { data: KdRound; migrated: boolean } {
  if (!isRecord(raw)) return { data: defaultKdRound(), migrated: true };

  if ('activePlayerIndex' in raw && isRecord(raw['questions'])) {
    return { data: raw as unknown as KdRound, migrated: false };
  }

  if ('currentSingleplayerPlayer' in raw || 'gamemode' in raw) {
    const questions: Record<string, unknown> = isRecord(raw['questions'])
      ? raw['questions']
      : {};
    const singleplayer = asArray(questions['singleplayer']).map((pool) =>
      asArray(pool).map(legacyKdQuestion),
    );
    return {
      data: {
        questions: {
          singleplayer: padTo(singleplayer, PLAYER_COUNT, () => []),
          multiplayer: asArray(questions['multiplayer']).map(legacyKdQuestion),
        },
        gamemode: raw['gamemode'] === 'M' ? 'M' : 'S',
        // Old currentSingleplayerPlayer was already stored 0-based
        // (server.js: `kdData.currentSingleplayerPlayer = playerId - 1`).
        activePlayerIndex: asNumber(raw['currentSingleplayerPlayer'], 0),
      },
      migrated: true,
    };
  }

  return { data: defaultKdRound(), migrated: true };
}

function legacyKdQuestion(raw: unknown): KdQuestion {
  const record: Record<string, unknown> = isRecord(raw) ? raw : {};
  const type = record['type'];
  const question: KdQuestion = {
    question: asString(record['question'], ''),
    answer: asString(record['answer'], ''),
    type: type === 'P' || type === 'A' ? type : 'N',
  };
  const mediaFile = optionalString(record['mediaFile'] ?? record['audioFilePath']);
  if (mediaFile !== undefined) question.mediaFile = mediaFile;
  return question;
}

// VCNV -------------------------------------------------------------------

function normalizeVcnv(raw: unknown): { data: VcnvRound; migrated: boolean } {
  if (!isRecord(raw)) return { data: defaultVcnvRound(), migrated: true };

  if ('openRowCount' in raw && 'obstacleBuzzes' in raw) {
    return { data: raw as unknown as VcnvRound, migrated: false };
  }

  if ('noOfOpenRows' in raw || 'CNVPlayers' in raw || Array.isArray(raw['questions'])) {
    return {
      data: {
        questions: asArray(raw['questions']).map(legacyVcnvQuestion),
        playerAnswers: padTo(
          asArray(raw['playerAnswers']).map(legacyPlayerAnswer),
          PLAYER_COUNT,
          () => ({ answer: '', correct: false }),
        ),
        showResults: raw['showResults'] === true,
        disabledPlayers: asArray(raw['disabledPlayers']).filter(
          (value): value is number => typeof value === 'number',
        ),
        openRowCount: asNumber(raw['noOfOpenRows'], 0),
        obstacleBuzzes: asArray(raw['CNVPlayers']).map(legacyObstacleBuzz),
      },
      migrated: true,
    };
  }

  return { data: defaultVcnvRound(), migrated: true };
}

function legacyVcnvQuestion(raw: unknown, index: number): VcnvQuestion {
  const record: Record<string, unknown> = isRecord(raw) ? raw : {};
  const type = record['type'];
  const question: VcnvQuestion = {
    id: asNumber(record['id'], index + 1),
    type: type === 'CNV' || type === 'HN_S' ? type : 'HN',
    value: asNumber(record['value'], VCNV_ROW_POINTS),
    isOpen: (record['isOpen'] ?? record['ifOpen']) === true,
    isShown: (record['isShown'] ?? record['ifShown']) === true,
    question: asString(record['question'], ''),
    answer: asString(record['answer'], ''),
  };
  const imageFile = optionalString(record['imageFile'] ?? record['picFileName']);
  if (imageFile !== undefined) question.imageFile = imageFile;
  const audioFile = optionalString(record['audioFile'] ?? record['audioFilePath']);
  if (audioFile !== undefined) question.audioFile = audioFile;
  return question;
}

function legacyPlayerAnswer(raw: unknown): PlayerAnswer {
  const record: Record<string, unknown> = isRecord(raw) ? raw : {};
  return {
    answer: asString(record['answer'], ''),
    correct: record['correct'] === true,
  };
}

function legacyObstacleBuzz(raw: unknown): ObstacleBuzz {
  const record: Record<string, unknown> = isRecord(raw) ? raw : {};
  return {
    // Old CNVPlayers[].id came from socketIDs.indexOf → already 0-based.
    playerIndex: asNumber(record['playerIndex'] ?? record['id'], 0),
    timestamp: asNumber(record['timestamp'], 0),
    readableTime: asString(record['readableTime'], ''),
  };
}

// TT ---------------------------------------------------------------------

function normalizeTt(raw: unknown): { data: TtRound; migrated: boolean } {
  if (!isRecord(raw)) return { data: defaultTtRound(), migrated: true };

  if ('activeQuestionIndex' in raw) {
    return { data: raw as unknown as TtRound, migrated: false };
  }

  if ('currentQuestion' in raw || Array.isArray(raw['questions'])) {
    const rawAnswers = asArray(raw['playerAnswers']);
    // The old server treated ids as 1-based (scored via players[id - 1]) but
    // the old excel importer wrote ids 0..3; detect the latter by the 0.
    const idsAreZeroBased = rawAnswers.some(
      (entry) => isRecord(entry) && entry['id'] === 0,
    );
    return {
      data: {
        questions: asArray(raw['questions']).map(legacyTtQuestion),
        playerAnswers: padTo(
          rawAnswers.map((entry, index) => legacyTtAnswer(entry, index, idsAreZeroBased)),
          PLAYER_COUNT,
          (index) => ({
            playerIndex: index,
            answer: '',
            timestamp: 0,
            readableTime: '',
            correct: false,
          }),
        ),
        showResults: raw['showResults'] === true,
        activeQuestionIndex: asNumber(raw['currentQuestion'], 0),
        showAnswer: raw['showAnswer'] === true,
        timerStartTimestamp: asNumber(raw['timerStartTimestamp'], 0),
      },
      migrated: true,
    };
  }

  return { data: defaultTtRound(), migrated: true };
}

function legacyTtQuestion(raw: unknown, index: number): TtQuestion {
  const record: Record<string, unknown> = isRecord(raw) ? raw : {};
  const type = record['type'];
  const question: TtQuestion = {
    id: asNumber(record['id'], index + 1),
    question: asString(record['question'], ''),
    answer: asString(record['answer'], ''),
    type: type === 'TT_VD' || type === 'video' ? 'video' : 'image',
  };
  const questionImage = optionalString(record['questionImage'] ?? record['question_image']);
  if (questionImage !== undefined) question.questionImage = questionImage;
  const answerImage = optionalString(record['answerImage'] ?? record['answer_image']);
  if (answerImage !== undefined) question.answerImage = answerImage;
  const videoFile = optionalString(record['videoFile'] ?? record['video_name']);
  if (videoFile !== undefined) question.videoFile = videoFile;
  return question;
}

function legacyTtAnswer(raw: unknown, index: number, idsAreZeroBased: boolean): TtAnswer {
  const record: Record<string, unknown> = isRecord(raw) ? raw : {};
  const id = asNumber(record['id'], index + 1);
  return {
    playerIndex: idsAreZeroBased ? id : id - 1,
    answer: asString(record['answer'], ''),
    timestamp: asNumber(record['timestamp'], 0),
    readableTime: asString(record['readableTime'], ''),
    correct: record['correct'] === true,
  };
}

// VD ---------------------------------------------------------------------

function normalizeVd(raw: unknown): { data: VdRound; migrated: boolean } {
  if (!isRecord(raw)) return { data: defaultVdRound(), migrated: true };

  if ('activePlayerIndex' in raw && 'pickedQuestions' in raw) {
    return { data: raw as unknown as VdRound, migrated: false };
  }

  if ('currentPlayerId' in raw || 'ifQuestionPickerShowing' in raw) {
    const pools = asArray(raw['questionPools']).map((pool) =>
      asArray(pool).map(legacyVdQuestion),
    );
    return {
      data: {
        questionPools: padTo(pools, PLAYER_COUNT, () => []),
        // 1-based; the old importers wrote 0 for "unset", hence the clamp.
        activePlayerIndex: Math.max(asNumber(raw['currentPlayerId'], 1) - 1, 0),
        isQuestionPickerShown: raw['ifQuestionPickerShowing'] === true,
        pickedQuestions: asArray(raw['questionPickerArray']).map((value) => value === true),
        hopeStarActive: raw['ifNSHV'] === true,
        // Legacy NSHV + questions fields dropped by design (dead data).
      },
      migrated: true,
    };
  }

  return { data: defaultVdRound(), migrated: true };
}

function legacyVdQuestion(raw: unknown): VdQuestion {
  const record: Record<string, unknown> = isRecord(raw) ? raw : {};
  const type = record['type'];
  const question: VdQuestion = {
    value: asNumber(record['value'], 0),
    type: type === 'I' || type === 'A' || type === 'V' ? type : 'N',
    question: asString(record['question'], ''),
    answer: asString(record['answer'], ''),
  };
  // Old files carry file_name, but some video questions used video_name.
  const mediaFile = optionalString(
    record['mediaFile'] ?? record['file_name'] ?? record['video_name'],
  );
  if (mediaFile !== undefined) question.mediaFile = mediaFile;
  return question;
}

// CHP --------------------------------------------------------------------

function normalizeChp(raw: unknown): { data: ChpRound; migrated: boolean } {
  if (!isRecord(raw)) return { data: defaultChpRound(), migrated: true };

  if ('playedPlayers' in raw) {
    return { data: raw as unknown as ChpRound, migrated: false };
  }

  if ('playerIDs' in raw || Array.isArray(raw['questions'])) {
    return {
      data: {
        questions: asArray(raw['questions']).map((entry) => {
          const record: Record<string, unknown> = isRecord(entry) ? entry : {};
          return {
            question: asString(record['question'], ''),
            answer: asString(record['answer'], ''),
          };
        }),
        playedPlayers: padTo(
          asArray(raw['playerIDs']).map((value) => value === true),
          PLAYER_COUNT,
          () => false,
        ),
      },
      migrated: true,
    };
  }

  return { data: defaultChpRound(), migrated: true };
}

// ------------------------------------------------------------------- helpers

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function padTo<T>(items: T[], length: number, make: (index: number) => T): T[] {
  while (items.length < length) items.push(make(items.length));
  return items;
}
