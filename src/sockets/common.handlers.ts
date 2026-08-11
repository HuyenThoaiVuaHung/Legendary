import { KD_CLOCK_START_DELAY_MS } from '../game.rules';
import { HandlerContext, isAdmin } from './context';

/**
 * Match-wide realtime events that belong to no single round: starting the
 * match, driving the main clock, and relaying sound effects.
 */
export function registerCommonHandlers(ctx: HandlerContext): void {
  const { io, socket, store, timer } = ctx;

  socket.on('beginMatch', () => {
    store.updateMatch((match) => {
      match.position = 'KD';
    });
    socket.broadcast.emit('beginMatch');
  });

  socket.on('start-clock', (seconds: number) => {
    if (!isAdmin(ctx)) return;
    // A fresh clock discards any stashed pause and reopens the KD buzzers;
    // the old server then waited a beat before the countdown actually ran.
    store.updateMatch((match) => {
      match.pausedTimerSeconds = 0;
    });
    io.emit('enable-answer-button-kd');
    timer.startMainClock(seconds, { startDelayMs: KD_CLOCK_START_DELAY_MS });
  });

  socket.on('play-pause-clock', () => {
    timer.togglePause();
  });

  socket.on('play-sfx', (sfx: string, loop?: boolean) => {
    io.emit('play-sfx', sfx, loop);
  });
}
