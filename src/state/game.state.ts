import { PLAYER_COUNT } from '../game.rules';

export const NO_PLAYER = -1;

/** Which kind of post-buzz decision timer is running. */
export enum DecisionTimerOwner {
  None = 'none',
  Admin = 'admin',
  Player = 'player',
}

/**
 * Ephemeral per-match session state: everything that lives only while the
 * server runs and is never persisted. One instance per server process.
 */
export class GameSessionState {
  /** socket.id per player index; '' when that player is not connected. */
  readonly playerSocketIds: string[] = Array(PLAYER_COUNT).fill('');

  /** KD: player index currently holding the buzzer turn. */
  kdTurnPlayerIndex = NO_PLAYER;
  kdDecisionTimerOwner = DecisionTimerOwner.None;
  kdMaxQuestionCount = 0;
  kdCurrentQuestionNo = 0;

  /** VD: player index that pressed the steal button. */
  vdStealingPlayerIndex = NO_PLAYER;
  vdStealWindowOpen = false;

  /** CHP: player index holding the tiebreak turn. */
  chpTurnPlayerIndex = NO_PLAYER;
  chpPlayedPlayers: boolean[] = Array(PLAYER_COUNT).fill(false);

  playerIndexOf(socketId: string): number {
    return this.playerSocketIds.indexOf(socketId);
  }

  isPlayer(socketId: string): boolean {
    return this.playerIndexOf(socketId) !== NO_PLAYER;
  }
}
