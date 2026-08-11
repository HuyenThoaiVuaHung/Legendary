/**
 * VCNV (Vượt chướng ngại vật) realtime handlers.
 *
 * Ports the vcnv section of the old server.js monolith onto the canonical
 * contracts: persistence goes through MatchStore, player references are
 * 0-based indexes, and every game value comes from game.rules.
 *
 * Wire notes (kept for old-client parity):
 * - Question ids on the wire ('broadcast-vcnv-question', 'open-hn-vcnv',
 *   'close-hn-vcnv') are 1-based; converted to array indexes at this boundary.
 * - The obstacle-value recompute on full-round writes lives in the REST
 *   PUT /api/rounds/vcnv route, not here (the socket 'update-vcnv-data'
 *   request event was deleted per PLAN).
 */
import { Role } from '../contracts/api';
import { ObstacleBuzz, PlayerAnswer, VcnvQuestion } from '../contracts/game';
import {
  PLAYER_COUNT,
  VCNV_OBSTACLE_INDEX,
  VCNV_ROW_COUNT,
  VCNV_ROW_POINTS,
} from '../game.rules';
import { LogLevel } from '../logger';
import { NO_PLAYER } from '../state/game.state';
import { HandlerContext, isAdmin } from './context';

/** Broadcast in place of a question when the requested row is out of range. */
const EMPTY_QUESTION: Pick<VcnvQuestion, 'question'> = { question: '' };

/** H:M:S.ms, non-padded — exactly what the old server broadcast. */
function formatReadableTime(timestamp: number): string {
  const time = new Date(timestamp);
  return (
    `${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}` +
    `.${time.getMilliseconds()}`
  );
}

function byTimestamp(a: ObstacleBuzz, b: ObstacleBuzz): number {
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

export function registerVcnvHandlers(ctx: HandlerContext): void {
  const { io, socket, store, log } = ctx;
  const vcnv = store.round('vcnv');

  socket.on('mark-answer-vcnv', (marks: boolean[]) => {
    if (!isAdmin(ctx)) return;
    const match = store.updateMatch((m) => {
      for (let i = 0; i < Math.min(marks.length, PLAYER_COUNT); i++) {
        if (marks[i] === true) {
          m.players[i].score += VCNV_ROW_POINTS;
          log(`Player ${m.players[i].name} got ${VCNV_ROW_POINTS} points`);
        }
      }
    });
    io.emit('update-match-data', match);
  });

  socket.on('broadcast-vcnv-question', (questionId: number) => {
    if (questionId <= VCNV_ROW_COUNT) {
      io.emit('update-vcnv-question', vcnv.get().questions[questionId - 1]);
    } else {
      io.emit('update-vcnv-question', EMPTY_QUESTION);
    }
  });

  socket.on('highlight-vcnv-question', (questionId: number) => {
    io.emit('update-highlighted-vcnv-question', questionId);
  });

  socket.on('submit-answer-vcnv', (answer: string) => {
    const playerIndex = resolvePlayerIndex(ctx);
    if (playerIndex === NO_PLAYER) {
      log(`Socket ${socket.id} submitted a VCNV answer but is not a player`, LogLevel.Error);
      return;
    }
    const data = vcnv.update((d) => {
      d.playerAnswers[playerIndex].answer = answer;
    });
    io.emit('update-vcnv-data', data);
  });

  socket.on('open-hn-vcnv', (questionId: number) => {
    const data = vcnv.update((d) => {
      d.questions[questionId - 1].isOpen = true;
    });
    io.emit('update-vcnv-data', data);
  });

  socket.on('close-hn-vcnv', (questionId: number) => {
    const data = vcnv.update((d) => {
      d.questions[questionId - 1].isOpen = false;
    });
    io.emit('update-vcnv-data', data);
  });

  socket.on('clear-player-answer', () => {
    const playerIndex = resolvePlayerIndex(ctx);
    if (playerIndex === NO_PLAYER) {
      log(`Socket ${socket.id} tried to clear a VCNV answer but is not a player`, LogLevel.Error);
      return;
    }
    const data = vcnv.update((d) => {
      d.playerAnswers[playerIndex].answer = '';
      d.playerAnswers[playerIndex].correct = false;
    });
    io.emit('update-vcnv-data', data);
  });

  socket.on('submit-mark-vcnv-admin', (marked: PlayerAnswer[]) => {
    if (!isAdmin(ctx)) return;
    vcnv.update((d) => {
      d.playerAnswers = marked;
    });
    const match = store.updateMatch((m) => {
      for (let i = 0; i < PLAYER_COUNT; i++) {
        if (marked[i]?.correct === true) {
          m.players[i].score += VCNV_ROW_POINTS;
          log(`Player ${m.players[i].name} got ${VCNV_ROW_POINTS} points`);
        }
      }
    });
    io.emit('update-match-data', match);
  });

  socket.on('toggle-results-display-vcnv', () => {
    const data = vcnv.update((d) => {
      d.showResults = !d.showResults;
    });
    io.emit('update-vcnv-data', data);
    log(data.showResults);
  });

  socket.on('attempt-cnv-player', () => {
    const playerIndex = resolvePlayerIndex(ctx);
    if (playerIndex === NO_PLAYER) {
      log(`Socket ${socket.id} buzzed for the obstacle but is not a player`, LogLevel.Error);
      return;
    }
    const timestamp = Date.now();
    const buzz: ObstacleBuzz = {
      playerIndex,
      timestamp,
      readableTime: formatReadableTime(timestamp),
    };
    const data = vcnv.update((d) => {
      d.disabledPlayers.push(playerIndex);
      d.obstacleBuzzes.push(buzz);
      d.obstacleBuzzes.sort(byTimestamp);
    });
    io.emit('update-vcnv-data', data);
  });

  socket.on('submit-cnv-mark', (marks: Array<boolean | null>) => {
    if (!isAdmin(ctx)) return;
    const obstacleValue = vcnv.get().questions[VCNV_OBSTACLE_INDEX].value;
    const data = vcnv.update((d) => {
      for (let i = 0; i < marks.length; i++) {
        if (marks[i] === false) d.disabledPlayers.push(i);
      }
      d.obstacleBuzzes = [];
    });
    const match = store.updateMatch((m) => {
      for (let i = 0; i < marks.length; i++) {
        if (marks[i] === true) {
          m.players[i].score += obstacleValue;
          log(`Player ${m.players[i].name} got ${obstacleValue} points`);
        }
      }
    });
    io.emit('update-vcnv-data', data);
    io.emit('update-match-data', match);
  });
}
