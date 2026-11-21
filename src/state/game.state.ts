import { VdQuestion } from '../contracts/game';
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
 * server runs and is never persisted. One instance per room.
 */
export class GameSessionState {
  /** socket.id per player index; '' when that player is not connected. */
  readonly playerSocketIds: string[] = Array(PLAYER_COUNT).fill('');

  /** KD: player index currently holding the buzzer turn. */
  kdTurnPlayerIndex = NO_PLAYER;
  kdDecisionTimerOwner = DecisionTimerOwner.None;
  kdMaxQuestionCount = 0;
  kdCurrentQuestionNo = 0;
  /** KD: handle of the running post-buzz decision countdown, if any. */
  kdDecisionCountdown?: NodeJS.Timeout;

  /** VD: player index that pressed the steal button. */
  vdStealingPlayerIndex = NO_PLAYER;
  vdStealWindowOpen = false;
  /** VD: the question currently on screen, set by 'broadcast-vd-question'. */
  vdCurrentQuestion?: VdQuestion;
  /** VD: handle of the running steal-window countdown, if any. */
  vdStealCountdown?: NodeJS.Timeout;

  /** CHP: player index holding the tiebreak turn. */
  chpTurnPlayerIndex = NO_PLAYER;
  chpPlayedPlayers: boolean[] = Array(PLAYER_COUNT).fill(false);

  /** Stop every countdown this session owns, without emitting anything. */
  clearTimers(): void {
    if (this.kdDecisionCountdown !== undefined) clearInterval(this.kdDecisionCountdown);
    if (this.vdStealCountdown !== undefined) clearInterval(this.vdStealCountdown);
    this.kdDecisionCountdown = undefined;
    this.vdStealCountdown = undefined;
  }

  playerIndexOf(socketId: string): number {
    return this.playerSocketIds.indexOf(socketId);
  }

  isPlayer(socketId: string): boolean {
    return this.playerIndexOf(socketId) !== NO_PLAYER;
  }
}
