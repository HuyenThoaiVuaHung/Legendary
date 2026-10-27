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

/**
 * Merge operator overrides over the defaults into a rules object.
 * Deliberately NOT frozen: the live settings menu mutates this shared object
 * in place (via applyRuleOverrides) so running handlers pick up new values.
 */
export function loadGameRules(overrides?: Partial<GameRules>): GameRules {
  const rules: GameRules = { ...DEFAULT_GAME_RULES, ...overrides };
  rules.obstacleValueByRevealedCount = {
    ...DEFAULT_GAME_RULES.obstacleValueByRevealedCount,
    ...overrides?.obstacleValueByRevealedCount,
  };
  rules.ttPointsByPlacement = [
    ...(overrides?.ttPointsByPlacement ?? DEFAULT_GAME_RULES.ttPointsByPlacement),
  ];
  return rules;
}

interface NumericRuleConstraint {
  minimum: number;
}

/** Numeric rule fields that the settings menu may edit, with safe lower bounds. */
export const TUNABLE_NUMBER_FIELDS = {
  mainClockTickMs: { minimum: 1 },
  decisionTickMs: { minimum: 1 },
  kdCorrectPoints: { minimum: 0 },
  kdWrongPenalty: { minimum: 0 },
  kdDecisionTicks: { minimum: 1 },
  kdClockStartDelayMs: { minimum: 0 },
  vcnvRowPoints: { minimum: 0 },
  vdStealTicks: { minimum: 1 },
  vdWrongPenaltyDivisor: { minimum: 1 },
  vdHopeStarMultiplier: { minimum: 1 },
  chpTurnSeconds: { minimum: 1 },
  chpCorrectPoints: { minimum: 0 },
} as const satisfies Record<
  Exclude<keyof GameRules, 'playerCount' | 'obstacleValueByRevealedCount' | 'ttPointsByPlacement'>,
  NumericRuleConstraint
>;

/**
 * Apply a partial update onto an existing rules object, in place. Structural
 * values (the player count and board geometry) are deliberately excluded.
 * Invalid values are ignored and never persisted or broadcast.
 */
export function applyRuleOverrides(rules: GameRules, patch: Partial<GameRules>): string[] {
  const changed: string[] = [];

  for (const [field, constraint] of Object.entries(TUNABLE_NUMBER_FIELDS) as [
    keyof typeof TUNABLE_NUMBER_FIELDS,
    NumericRuleConstraint,
  ][]) {
    const value = patch[field];
    if (typeof value === 'number' && Number.isFinite(value) && value >= constraint.minimum) {
      rules[field] = value;
      changed.push(field);
    }
  }

  if (Array.isArray(patch.ttPointsByPlacement)) {
    const points = patch.ttPointsByPlacement;
    const valid =
      points.length === PLAYER_COUNT &&
      points.every((value) => Number.isFinite(value) && value >= 0);
    if (valid) {
      rules.ttPointsByPlacement = [...points];
      changed.push('ttPointsByPlacement');
    }
  }

  if (patch.obstacleValueByRevealedCount && typeof patch.obstacleValueByRevealedCount === 'object') {
    let updated = false;
    for (const [key, value] of Object.entries(patch.obstacleValueByRevealedCount)) {
      const revealedCount = Number(key);
      if (
        Number.isInteger(revealedCount) &&
        revealedCount >= 0 &&
        revealedCount <= VCNV_ROW_COUNT &&
        Number.isFinite(value) &&
        value >= 0
      ) {
        rules.obstacleValueByRevealedCount[revealedCount] = value;
        updated = true;
      }
    }
    if (updated) changed.push('obstacleValueByRevealedCount');
  }

  return changed;
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
