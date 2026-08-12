/**
 * Every tunable game rule and timing value. Defaults live here; a `rules`
 * section in utils/config.json (or LEGENDARY_RULES_* env vars) overrides any
 * of them, so operators can retune scoring/timers without a rebuild.
 *
 * Structural invariants that the code's shape depends on (board indices, piece
 * geometry) are NOT knobs and stay as plain constants below.
 */

export interface GameRules {
  playerCount: number;
  mainClockTickMs: number;
  decisionTickMs: number;

  kdCorrectPoints: number;
  kdWrongPenalty: number;
  kdDecisionTicks: number;
  kdClockStartDelayMs: number;

  vcnvRowPoints: number;
  /** Obstacle value indexed by number of revealed rows (0..VCNV_ROW_COUNT). */
  obstacleValueByRevealedCount: Record<number, number>;

  /** Points by finishing order for the Tăng tốc round (1st, 2nd, …). */
  ttPointsByPlacement: number[];

  vdStealTicks: number;
  vdWrongPenaltyDivisor: number;
  vdHopeStarMultiplier: number;

  chpTurnSeconds: number;
  chpCorrectPoints: number;
}

export const DEFAULT_GAME_RULES: GameRules = {
  playerCount: 4,
  mainClockTickMs: 1000,
  decisionTickMs: 100,

  kdCorrectPoints: 10,
  kdWrongPenalty: 5,
  kdDecisionTicks: 30,
  kdClockStartDelayMs: 1000,

  vcnvRowPoints: 10,
  obstacleValueByRevealedCount: { 0: 50, 1: 50, 2: 40, 3: 30, 4: 20, 5: 10 },

  ttPointsByPlacement: [40, 30, 20, 10],

  vdStealTicks: 50,
  vdWrongPenaltyDivisor: 2,
  vdHopeStarMultiplier: 2,

  chpTurnSeconds: 15,
  chpCorrectPoints: 1,
};

/** Merge operator overrides over the defaults into a frozen rules object. */
export function loadGameRules(overrides?: Partial<GameRules>): GameRules {
  return Object.freeze({
    ...DEFAULT_GAME_RULES,
    ...overrides,
    obstacleValueByRevealedCount: {
      ...DEFAULT_GAME_RULES.obstacleValueByRevealedCount,
      ...overrides?.obstacleValueByRevealedCount,
    },
    ttPointsByPlacement:
      overrides?.ttPointsByPlacement ?? DEFAULT_GAME_RULES.ttPointsByPlacement,
  });
}

// --------------------------------------------------------- structural invariants

/** Players per match — the board, timers and arrays are all sized to this. */
export const PLAYER_COUNT = DEFAULT_GAME_RULES.playerCount;
/** Number of hàng ngang rows; fixed by the board layout. */
export const VCNV_ROW_COUNT = 5;
/** Index of the central obstacle question inside VcnvRound.questions. */
export const VCNV_OBSTACLE_INDEX = 5;
/** Reveal-piece count, fixed by the 4-corners-plus-centre geometry. */
export const VCNV_PIECE_COUNT = 5;
