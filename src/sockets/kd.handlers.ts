import { Role } from '../contracts/api';
import { KdQuestion } from '../contracts/game';
import {
  DECISION_TICK_MS,
  KD_CORRECT_POINTS,
  KD_DECISION_TICKS,
  KD_WRONG_PENALTY,
} from '../game.rules';
import { LogLevel } from '../logger';
import { DecisionTimerOwner, NO_PLAYER } from '../state/game.state';
import { HandlerContext, isAdmin } from './context';

// Sound-effect identifiers understood by the frontend (protocol vocabulary,
// names kept from the old client).
const SFX_GET_TURN = 'KD_GET_TURN';
const SFX_WRONG = 'KD_WRONG';

/**
 * Handle of the running post-buzz decision countdown, if any. Shared module
 * state, like the VD steal countdown: one match per server process, and only
 * one decision window can be live at a time.
 */
let decisionCountdown: NodeJS.Timeout | undefined;

/** Player index of the acting socket, or NO_PLAYER when it isn't a player. */
function resolvePlayerIndex(ctx: HandlerContext): number {
  if (ctx.identity.roleId === Role.Player && ctx.identity.index !== undefined) {
    return ctx.identity.index;
  }
  return ctx.session.playerIndexOf(ctx.socket.id);
}

export function registerKdHandlers(ctx: HandlerContext): void {
  const { io, socket, store, session, timer, log } = ctx;
  const kd = store.round('kd');

  const emitQuestionNumbers = (): void => {
    io.emit(
      'update-number-question-kd',
      session.kdMaxQuestionCount,
      session.kdCurrentQuestionNo,
    );
  };

  /**
   * Wrong answer in multiplayer: apply the penalty, but only to players with
   * points to lose (the old server never let KD scores go negative here).
   * Callers broadcast 'update-match-data' themselves.
   */
  const penalizePlayer = (playerIndex: number): void => {
    store.updateMatch((m) => {
      const player = m.players[playerIndex];
      if (!player || player.score <= 0) return;
      player.score -= KD_WRONG_PENALTY;
      log(`Player ${player.name} lost ${KD_WRONG_PENALTY} points`);
    });
  };

  socket.on('broadcast-kd-question', (question: KdQuestion) => {
    socket.broadcast.emit('update-kd-question', question);
  });

  socket.on('clear-question-kd', () => {
    socket.broadcast.emit('update-kd-question', {});
  });

  socket.on('get-turn-kd', () => {
    const playerIndex = resolvePlayerIndex(ctx);
    if (playerIndex === NO_PLAYER) return;
    if (session.kdTurnPlayerIndex !== NO_PLAYER) {
      // First buzz wins; late presses are only logged.
      log(`Player ${playerIndex} requested turn`);
      return;
    }
    io.emit('play-sfx', SFX_GET_TURN);
    session.kdDecisionTimerOwner = DecisionTimerOwner.Player;
    session.kdTurnPlayerIndex = playerIndex;
    io.emit('disable-answer-button-kd');
    io.emit('player-got-turn-kd', store.getMatch().players[playerIndex]);
  });

  socket.on('clear-turn-kd', () => {
    log('Cleared turn khoi dong');
    session.kdTurnPlayerIndex = NO_PLAYER;
    io.emit('clear-turn-player-kd');
    io.emit('enable-answer-button-kd');
  });

  socket.on('clear-turn-kd-f', () => {
    // The old server wrote `this.lastTurnId` here — a no-op bug; the intent
    // (clear the turn without reopening the buzzers) is implemented properly.
    session.kdTurnPlayerIndex = NO_PLAYER;
    io.emit('clear-turn-player-kd');
  });

  socket.on('correct-mark-kd', () => {
    if (!isAdmin(ctx)) return;
    io.emit('enable-answer-button-kd');
    session.kdCurrentQuestionNo += 1;
    log(`Current question no: ${session.kdCurrentQuestionNo}`);
    emitQuestionNumbers();

    const data = kd.get();
    const holder = session.kdTurnPlayerIndex;
    if (data.gamemode === 'S') {
      store.updateMatch((m) => {
        const player = m.players[data.activePlayerIndex];
        if (!player) return;
        player.score += KD_CORRECT_POINTS;
        log(`Player ${player.name} got ${KD_CORRECT_POINTS} points`);
      });
    } else if (data.gamemode === 'M' && holder !== NO_PLAYER) {
      store.updateMatch((m) => {
        const player = m.players[holder];
        if (!player) return;
        player.score += KD_CORRECT_POINTS;
        log(`Player ${player.name} got ${KD_CORRECT_POINTS} points`);
      });
    }

    io.emit('update-match-data', store.getMatch());
    session.kdDecisionTimerOwner = DecisionTimerOwner.None;
    session.kdTurnPlayerIndex = NO_PLAYER;
  });

  socket.on('wrong-mark-kd', () => {
    if (!isAdmin(ctx)) return;
    io.emit('enable-answer-button-kd');

    if (kd.get().gamemode === 'M') {
      const holder = session.kdTurnPlayerIndex;
      if (holder === NO_PLAYER) {
        log('wrong-mark-kd with no turn holder', LogLevel.Error);
        return;
      }
      penalizePlayer(holder);
    }

    session.kdCurrentQuestionNo += 1;
    log(`Current question no: ${session.kdCurrentQuestionNo}`);
    emitQuestionNumbers();
    io.emit('update-match-data', store.getMatch());
    session.kdDecisionTimerOwner = DecisionTimerOwner.None;
    session.kdTurnPlayerIndex = NO_PLAYER;
  });

  socket.on('stop-kd-sound', () => {
    io.emit('stop-kd-sound');
  });

  socket.on('update-number-question-kd', (maxCount: number, currentNo: number) => {
    session.kdMaxQuestionCount = maxCount;
    session.kdCurrentQuestionNo = currentNo;
    emitQuestionNumbers();
  });

  socket.on('start-turn-kd', (questionCount: number) => {
    session.kdCurrentQuestionNo = 0;
    session.kdMaxQuestionCount = questionCount;
    emitQuestionNumbers();
    io.emit('enable-answer-button-kd');
    io.emit('update-questions-number-kd', questionCount);
  });

  // Post-buzz decision window: KD_DECISION_TICKS × DECISION_TICK_MS. The
  // player variant times out into a wrong answer for the turn holder; the
  // admin variant is a neutral countdown that simply advances the question.
  socket.on('start-3s-timer-kd', (isPlayerTimer: boolean) => {
    if (decisionCountdown !== undefined) clearInterval(decisionCountdown);
    let counter = KD_DECISION_TICKS;
    session.kdDecisionTimerOwner = isPlayerTimer
      ? DecisionTimerOwner.Player
      : DecisionTimerOwner.Admin;
    io.emit('update-3s-timer-kd', counter, isPlayerTimer);

    const handle = setInterval(() => {
      counter -= 1;
      io.emit('update-3s-timer-kd', counter, isPlayerTimer);

      if (isPlayerTimer) {
        if (session.kdDecisionTimerOwner === DecisionTimerOwner.None) {
          // The admin marked the answer before the window ran out.
          clearInterval(handle);
          if (timer.remainingSeconds() > 0) io.emit('enable-answer-button-kd');
          session.kdTurnPlayerIndex = NO_PLAYER;
          io.emit('update-3s-timer-kd', 0, true);
          io.emit('update-3s-timer-kd', 0, false);
        } else if (counter === 0) {
          // Window expired: the holder never answered — counts as wrong.
          clearInterval(handle);
          if (timer.remainingSeconds() > 0) {
            io.emit('enable-answer-button-kd');
            io.emit('next-question');
          }
          if (session.kdDecisionTimerOwner === DecisionTimerOwner.Player) {
            session.kdDecisionTimerOwner = DecisionTimerOwner.None;
            const holder = session.kdTurnPlayerIndex;
            if (holder === NO_PLAYER) {
              log('KD decision window expired with no turn holder', LogLevel.Error);
            } else {
              penalizePlayer(holder);
            }
            io.emit('update-match-data', store.getMatch());
            io.emit('play-sfx', SFX_WRONG);
            session.kdCurrentQuestionNo += 1;
            emitQuestionNumbers();
          }
          session.kdTurnPlayerIndex = NO_PLAYER;
          io.emit('clear-turn-player-kd');
        }
      } else {
        if (counter === 0) {
          // Note: like the old server, natural expiry of the admin variant
          // leaves the decision owner set; 'stop-3s-timer-kd' clears it.
          clearInterval(handle);
          if (timer.remainingSeconds() > 0) {
            io.emit('next-question');
            io.emit('enable-answer-button-kd');
          }
          io.emit('clear-turn-player-kd');
          io.emit('play-sfx', SFX_WRONG);
          session.kdCurrentQuestionNo += 1;
          emitQuestionNumbers();
          session.kdTurnPlayerIndex = NO_PLAYER;
        } else if (session.kdDecisionTimerOwner !== DecisionTimerOwner.Admin) {
          clearInterval(handle);
          io.emit('update-3s-timer-kd', 0, false);
        }
      }
    }, DECISION_TICK_MS);
    decisionCountdown = handle;
  });

  socket.on('stop-3s-timer-kd', () => {
    session.kdDecisionTimerOwner = DecisionTimerOwner.None;
  });
}
