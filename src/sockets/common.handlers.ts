import { Role } from '../contracts/api';
import { HandlerContext, isAdmin } from './context';

/**
 * Match-wide realtime events that belong to no single round: starting the
 * match, driving the main clock, and relaying sound effects.
 */
export function registerCommonHandlers(ctx: HandlerContext): void {
  const { io, socket, store, timer, rules } = ctx;

  socket.on('beginMatch', () => {
    store.updateMatch((match) => {
      match.position = 'KD';
    });
    socket.broadcast.emit('beginMatch');
  });

  socket.on('start-clock', (seconds: number) => {
    // Admin or MC may drive the clock (the old server did not gate this at
    // all; players/viewers stay locked out).
    if (!isAdmin(ctx) && ctx.identity.roleId !== Role.Mc) return;
    // A fresh clock discards any stashed pause and reopens the KD buzzers;
    // the old server then waited a beat before the countdown actually ran.
    store.updateMatch((match) => {
      match.pausedTimerSeconds = 0;
    });
    io.emit('enable-answer-button-kd');
    timer.startMainClock(seconds, { startDelayMs: rules.kdClockStartDelayMs });
  });

  socket.on('play-pause-clock', () => {
    timer.togglePause();
  });

  socket.on('play-sfx', (sfx: string, loop?: boolean) => {
    io.emit('play-sfx', sfx, loop);
  });
}
