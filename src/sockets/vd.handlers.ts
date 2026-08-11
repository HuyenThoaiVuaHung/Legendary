import { Role } from '../contracts/api';
import { VdQuestion } from '../contracts/game';
import {
  DECISION_TICK_MS,
  VD_HOPE_STAR_MULTIPLIER,
  VD_STEAL_TICKS,
  VD_WRONG_PENALTY_DIVISOR,
} from '../game.rules';
import { NO_PLAYER } from '../state/game.state';
import { HandlerContext, isAdmin } from './context';

/** Protocol sentinel the admin client sends to clear the current question. */
const CLEAR_QUESTION_ID = -1;

/**
 * The question currently on screen, set by 'broadcast-vd-question'. Shared
 * module state: there is exactly one match per server process, and only the
 * admin broadcasts questions.
 */
let currentQuestion: VdQuestion | undefined;

/** Handle of the running steal-window countdown, if any. */
let stealCountdown: NodeJS.Timeout | undefined;

/** Player index of the acting socket, or NO_PLAYER when it isn't a player. */
function resolvePlayerIndex(ctx: HandlerContext): number {
  if (ctx.identity.roleId === Role.Player && ctx.identity.index !== undefined) {
    return ctx.identity.index;
  }
  return ctx.session.playerIndexOf(ctx.socket.id);
}

export function registerVdHandlers(ctx: HandlerContext): void {
  const { io, socket, store, session, log } = ctx;
  const vd = store.round('vd');

  socket.on('broadcast-vd-question', (id: number) => {
    if (id === CLEAR_QUESTION_ID) {
      currentQuestion = undefined;
      io.emit('update-vedich-question', undefined);
      if (vd.get().hopeStarActive) {
        const data = vd.update((d) => {
          d.hopeStarActive = false;
        });
        io.emit('update-vedich-data', data);
      }
      return;
    }
    const data = vd.get();
    currentQuestion = data.questionPools[data.activePlayerIndex]?.[id];
    io.emit('update-vedich-question', currentQuestion);
  });

  // Legacy payload note: the `id` argument of the marking events is the
  // 1-based player display number — converted to a 0-based index here, at
  // the boundary.
  socket.on('mark-correct-vd', (id: number, value: number) => {
    if (!isAdmin(ctx)) return;
    const playerIndex = id - 1;
    const data = vd.get();
    const stealerIndex = session.vdStealingPlayerIndex;

    const match = store.updateMatch((m) => {
      const player = m.players[playerIndex];
      if (!player) return;
      if (data.hopeStarActive && stealerIndex === NO_PLAYER) {
        // Hope star: the owner answered correctly, stakes are doubled.
        const gained = value * VD_HOPE_STAR_MULTIPLIER;
        player.score += gained;
        log(`Player ${player.name} got ${gained} points`);
      } else if (stealerIndex !== NO_PLAYER) {
        // A stealer answered correctly: they gain the value and the
        // question's owner loses it — unless the hope star already made
        // the owner pay up front when the steal window opened.
        player.score += value;
        log(`Player ${player.name} got ${value} points`);
        if (!data.hopeStarActive) {
          const owner = m.players[data.activePlayerIndex];
          owner.score -= value;
          log(`Player ${owner.name} lost ${value} points`);
        }
      } else {
        player.score += value;
        log(`Player ${player.name} got ${value} points`);
      }
    });

    const updated = vd.update((d) => {
      d.hopeStarActive = false;
    });
    session.vdStealingPlayerIndex = NO_PLAYER;
    io.emit('update-vedich-data', updated);
    io.emit('update-match-data', match);
    io.emit('clear-stealing-player');
  });

  socket.on('mark-incorrect-vd', (id: number, value: number) => {
    if (!isAdmin(ctx)) return;
    const playerIndex = id - 1;

    const match = store.updateMatch((m) => {
      const player = m.players[playerIndex];
      if (!player) return;
      const lost = value / VD_WRONG_PENALTY_DIVISOR;
      player.score -= lost;
      log(`Player ${player.name} lost ${lost} points`);
    });

    const updated = vd.update((d) => {
      d.hopeStarActive = false;
    });
    session.vdStealingPlayerIndex = NO_PLAYER;
    io.emit('update-vedich-data', updated);
    io.emit('update-match-data', match);
    io.emit('clear-stealing-player');
  });

  socket.on('player-steal-question', () => {
    if (session.vdStealingPlayerIndex !== NO_PLAYER) return; // first press wins
    const playerIndex = resolvePlayerIndex(ctx);
    if (playerIndex === NO_PLAYER) return;
    io.emit('lock-button-vd');
    session.vdStealingPlayerIndex = playerIndex;
    session.vdStealWindowOpen = false; // aborts the running countdown
    io.emit('player-steal-question', playerIndex);
  });

  socket.on('reset-stealing-player', () => {
    session.vdStealingPlayerIndex = NO_PLAYER;
    io.emit('clear-stealing-player');
  });

  socket.on('vd-play-video', () => {
    io.emit('vd-play-video');
  });

  socket.on('start-5s-countdown-vd', () => {
    let counter = VD_STEAL_TICKS;
    session.vdStealWindowOpen = true;
    io.emit('unlock-button-vd');

    const data = vd.get();
    if (data.hopeStarActive && currentQuestion !== undefined) {
      // Hope-star pre-penalty: the owner stakes the question's value the
      // moment the steal window opens (a later correct answer pays back
      // double, netting +value).
      const staked = currentQuestion.value;
      const match = store.updateMatch((m) => {
        const owner = m.players[data.activePlayerIndex];
        if (!owner) return;
        owner.score -= staked;
        log(`Player ${owner.name} lost ${staked} points`);
      });
      io.emit('update-vedich-data', data);
      io.emit('update-match-data', match);
    }

    io.emit('update-5s-countdown-vd', counter);
    if (stealCountdown !== undefined) clearInterval(stealCountdown);
    const handle = setInterval(() => {
      counter -= 1;
      io.emit('update-5s-countdown-vd', counter);
      if (counter <= 0 || !session.vdStealWindowOpen) {
        clearInterval(handle);
        if (stealCountdown === handle) stealCountdown = undefined;
        session.vdStealWindowOpen = false;
        io.emit('update-5s-countdown-vd', 0);
        io.emit('lock-button-vd');
      }
    }, DECISION_TICK_MS);
    stealCountdown = handle;
  });
}
