/**
 * Every game rule and timing value in one place. No other module may contain
 * a numeric literal with game meaning.
 */

export const PLAYER_COUNT = 4;

/** Main clock tick interval (the visible countdown). */
export const MAIN_CLOCK_TICK_MS = 1000;
/** Fast decision timers (KD 3-second window, VD steal window) tick at 10 Hz. */
export const DECISION_TICK_MS = 100;

// ---------------------------------------------------------------- KD (Khởi động)

export const KD_CORRECT_POINTS = 10;
export const KD_WRONG_PENALTY = 5;
/** Ticks of the post-buzz decision window (30 ticks × 100ms = 3s). */
export const KD_DECISION_TICKS = 30;
/** Delay between the admin starting the clock and it actually running. */
export const KD_CLOCK_START_DELAY_MS = 1000;

// ------------------------------------------------- VCNV (Vượt chướng ngại vật)

export const VCNV_ROW_POINTS = 10;
export const VCNV_ROW_COUNT = 5;
/** Index of the central obstacle question inside VcnvRound.questions. */
export const VCNV_OBSTACLE_INDEX = 5;
/**
 * The obstacle image is cut into this many reveal pieces: four corners tied
 * to rows 0-3 and the center tied to row 4 (the special row).
 */
export const VCNV_PIECE_COUNT = 5;
/**
 * Obstacle value by number of revealed rows: the fewer rows revealed when a
 * player buzzes, the more the obstacle is worth.
 */
export const OBSTACLE_VALUE_BY_REVEALED_COUNT: Readonly<Record<number, number>> = {
  0: 50,
  1: 50,
  2: 40,
  3: 30,
  4: 20,
  5: 10,
};

// ---------------------------------------------------------------- TT (Tăng tốc)

/** Points by finishing position: 1st correct answer gets 40, then 30, 20, 10. */
export const TT_POINTS_BY_PLACEMENT: readonly number[] = [40, 30, 20, 10];

// ----------------------------------------------------------------- VD (Về đích)

/** Ticks of the steal window (50 ticks × 100ms = 5s). */
export const VD_STEAL_TICKS = 50;
/** A wrong answer costs half the question's value. */
export const VD_WRONG_PENALTY_DIVISOR = 2;
/** Hope star (Ngôi sao hy vọng) doubles a correct answer's value. */
export const VD_HOPE_STAR_MULTIPLIER = 2;

// --------------------------------------------------- CHP (Câu hỏi phụ, tiebreak)

export const CHP_TURN_SECONDS = 15;
export const CHP_CORRECT_POINTS = 1;
