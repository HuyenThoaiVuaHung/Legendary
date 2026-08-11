/**
 * TT (Tăng tốc) realtime handlers.
 *
 * Ports the tangtoc section of the old server.js monolith onto the canonical
 * contracts: persistence goes through MatchStore, player references are
 * 0-based indexes (the old code awarded via `markData[i].id - 1` on 1-based
 * ids — canonical TtAnswer.playerIndex is already 0-based), and every game
 * value comes from game.rules.
 *
 * Wire note: 'broadcast-tt-question' carries a 1-based question id, with -1
 * meaning "clear the broadcast question"; converted at this boundary.
 */
import { Role } from '../contracts/api';
import { TtAnswer } from '../contracts/game';
import {
  MAIN_CLOCK_TICK_MS,
  PLAYER_COUNT,
  TT_POINTS_BY_PLACEMENT,
} from '../game.rules';
import { LogLevel } from '../logger';
import { NO_PLAYER } from '../state/game.state';
import { HandlerContext, isAdmin } from './context';

/** Sentinel the admin UI sends to clear the broadcast question. */
const NO_QUESTION_ID = -1;

/** H:M:S.ms, non-padded — exactly what the old server broadcast. */
function formatReadableTime(timestamp: number): string {
  const time = new Date(timestamp);
  return (
    `${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}` +
    `.${time.getMilliseconds()}`
  );
}

function byTimestamp(a: TtAnswer, b: TtAnswer): number {
  return a.timestamp - b.timestamp;
}

/**
 * The 0-based player index of the caller: token identity first, legacy
 * verify-identity session registration as fallback; NO_PLAYER otherwise.
 */
function resolvePlayerIndex(ctx: HandlerContext): number {
  if (ctx.identity.roleId === Role.Player && ctx.identity.index !== undefined) {
    return ctx.identity.index;
  }
  return ctx.session.playerIndexOf(ctx.socket.id);
}

export function registerTtHandlers(ctx: HandlerContext): void {
  const { io, socket, store, log } = ctx;
  const tt = store.round('tt');

  socket.on('player-submit-answer-tangtoc', (answer: string) => {
    const playerIndex = resolvePlayerIndex(ctx);
    if (playerIndex === NO_PLAYER) {
      log(`Socket ${socket.id} submitted a TT answer but is not a player`, LogLevel.Error);
      return;
    }
    const timestamp = Date.now();
    const data = tt.update((d) => {
      const entry = d.playerAnswers[playerIndex];
      entry.answer = answer;
      entry.timestamp = timestamp;
      entry.readableTime = formatReadableTime(timestamp);
    });
    io.emit('update-tangtoc-data', data);
  });

  socket.on('update-timer-start-timestamp', () => {
    const data = tt.update((d) => {
      d.timerStartTimestamp = Date.now() + MAIN_CLOCK_TICK_MS;
    });
    io.emit('update-tangtoc-data', data);
  });

  socket.on('submit-mark-tangtoc-admin', () => {
    if (!isAdmin(ctx)) return;
    // Rank answers by submission time; each correct answer earns the points
    // for its placement (fastest correct first). Sort a copy — the stored
    // answer order stays per-player, as the old per-event file reload did.
    const ranked = [...tt.get().playerAnswers].sort(byTimestamp);
    const match = store.updateMatch((m) => {
      let placement = 0;
      for (const answer of ranked) {
        if (answer.correct !== true) continue;
        const points = TT_POINTS_BY_PLACEMENT[placement] ?? 0;
        m.players[answer.playerIndex].score += points;
        log(`Player ${m.players[answer.playerIndex].name} got ${points} points`);
        placement++;
      }
    });
    io.emit('update-match-data', match);
  });

  socket.on('toggle-results-display-tangtoc', () => {
    const data = tt.update((d) => {
      d.showResults = !d.showResults;
    });
    io.emit('update-tangtoc-data', data);
  });

  socket.on('broadcast-tt-question', (questionId: number) => {
    if (questionId !== NO_QUESTION_ID) {
      io.emit('update-tangtoc-question', tt.get().questions[questionId - 1]);
    } else {
      io.emit('update-tangtoc-question', undefined);
    }
  });

  socket.on('clear-answer-tt', () => {
    const data = tt.update((d) => {
      d.playerAnswers = Array.from(
        { length: PLAYER_COUNT },
        (_, playerIndex): TtAnswer => ({
          playerIndex,
          answer: '',
          timestamp: 0,
          readableTime: '',
          correct: false,
        }),
      );
    });
    io.emit('update-tangtoc-data', data);
  });

  socket.on('tangtoc-play-video', () => {
    io.emit('tangtoc-play-video');
  });
}
