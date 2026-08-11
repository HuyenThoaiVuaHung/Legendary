/**
 * Canonical game contracts, shared verbatim with the Legion frontend
 * (mirrored at Legion/src/app/core/contracts/game.ts — keep in sync).
 *
 * Index convention: every player reference is a 0-based index into
 * MatchState.players. Player.id remains the 1-based display number.
 */

export const ROUND_KINDS = ['kd', 'vcnv', 'tt', 'vd', 'chp'] as const;
export type RoundKind = (typeof ROUND_KINDS)[number];

export const MATCH_POSITIONS = [
  'H',
  'KD',
  'VCNV_Q',
  'VCNV_A',
  'TT_Q',
  'TT_A',
  'VD',
  'CHP',
  'PNTS',
] as const;
export type MatchPosition = (typeof MATCH_POSITIONS)[number];

export interface Player {
  /** 1-based display number, not an array index. */
  id: number;
  name: string;
  score: number;
  isReady: boolean;
}

export interface MatchState {
  matchName: string;
  position: MatchPosition;
  players: Player[];
  /** Paths of the per-round data files, relative to the server root. */
  roundFiles: Record<RoundKind, string>;
  /** Seconds left on the paused main clock; 0 when nothing is paused. */
  pausedTimerSeconds: number;
}

// ---------------------------------------------------------------- KD (Khởi động)

export type KdGamemode = 'S' | 'M';
/** N: plain text, P: picture, A: audio. */
export type KdQuestionType = 'N' | 'P' | 'A';

export interface KdQuestion {
  question: string;
  answer: string;
  type: KdQuestionType;
  mediaFile?: string;
}

export interface KdRound {
  questions: {
    /** One pool per player, in player-index order. */
    singleplayer: KdQuestion[][];
    multiplayer: KdQuestion[];
  };
  gamemode: KdGamemode;
  /** Player currently on the podium in singleplayer mode. */
  activePlayerIndex: number;
}

// ------------------------------------------------- VCNV (Vượt chướng ngại vật)

/** HN: horizontal row, HN_S: special row, CNV: the central obstacle. */
export type VcnvQuestionType = 'HN' | 'HN_S' | 'CNV';

export interface VcnvQuestion {
  id: number;
  type: VcnvQuestionType;
  value: number;
  isOpen: boolean;
  isShown: boolean;
  question: string;
  answer: string;
  imageFile?: string;
  audioFile?: string;
}

export interface PlayerAnswer {
  answer: string;
  correct: boolean;
}

export interface ObstacleBuzz {
  playerIndex: number;
  timestamp: number;
  readableTime: string;
}

export interface VcnvRound {
  questions: VcnvQuestion[];
  playerAnswers: PlayerAnswer[];
  showResults: boolean;
  disabledPlayers: number[];
  openRowCount: number;
  obstacleBuzzes: ObstacleBuzz[];
}

// ---------------------------------------------------------------- TT (Tăng tốc)

export type TtQuestionType = 'image' | 'video';

export interface TtQuestion {
  id: number;
  question: string;
  answer: string;
  type: TtQuestionType;
  questionImage?: string;
  answerImage?: string;
  videoFile?: string;
}

export interface TtAnswer {
  playerIndex: number;
  answer: string;
  timestamp: number;
  readableTime: string;
  correct: boolean;
}

export interface TtRound {
  questions: TtQuestion[];
  playerAnswers: TtAnswer[];
  showResults: boolean;
  activeQuestionIndex: number;
  showAnswer: boolean;
  timerStartTimestamp: number;
}

// ----------------------------------------------------------------- VD (Về đích)

/** N: plain text, I: image, A: audio, V: video. */
export type VdQuestionType = 'N' | 'I' | 'A' | 'V';

export interface VdQuestion {
  value: number;
  type: VdQuestionType;
  question: string;
  answer: string;
  mediaFile?: string;
}

export interface VdRound {
  /** One pool per player, in player-index order. */
  questionPools: VdQuestion[][];
  activePlayerIndex: number;
  isQuestionPickerShown: boolean;
  pickedQuestions: boolean[];
  /** Ngôi sao hy vọng — doubles the active question's stakes. */
  hopeStarActive: boolean;
}

// --------------------------------------------------- CHP (Câu hỏi phụ, tiebreak)

export interface ChpQuestion {
  question: string;
  answer: string;
}

export interface ChpRound {
  questions: ChpQuestion[];
  /** True once a player has used their tiebreak attempt. */
  playedPlayers: boolean[];
}

// ------------------------------------------------------------------- Round map

export interface RoundDataMap {
  kd: KdRound;
  vcnv: VcnvRound;
  tt: TtRound;
  vd: VdRound;
  chp: ChpRound;
}

export type RoundData = RoundDataMap[RoundKind];
