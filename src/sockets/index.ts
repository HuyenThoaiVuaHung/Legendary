import { Server } from 'socket.io';
import { Role } from '../contracts/api';
import { LogFn, LogLevel } from '../logger';
import { AuthService } from '../services/auth.service';
import { TimerService } from '../services/timer.service';
import { GameSessionState, NO_PLAYER } from '../state/game.state';
import { MatchStore } from '../state/match.store';
import { registerChpHandlers } from './chp.handlers';
import { registerCommonHandlers } from './common.handlers';
import { HandlerContext, HandlerRegistrar, SocketIdentity } from './context';
import { registerKdHandlers } from './kd.handlers';
import { registerTtHandlers } from './tt.handlers';
import { registerVcnvHandlers } from './vcnv.handlers';
import { registerVdHandlers } from './vd.handlers';

/**
 * Every round module plugs in here; adding a round means adding one line
 * (open for extension, closed for modification).
 */
const REGISTRARS: readonly HandlerRegistrar[] = [
  registerCommonHandlers,
  registerKdHandlers,
  registerVcnvHandlers,
  registerTtHandlers,
  registerVdHandlers,
  registerChpHandlers,
];

const ROLE_NAMES: Record<Role, string> = {
  [Role.Player]: 'Player',
  [Role.Admin]: 'Admin',
  [Role.Mc]: 'MC',
  [Role.Viewer]: 'Viewer',
};

export interface SocketDeps {
  io: Server;
  store: MatchStore;
  session: GameSessionState;
  auth: AuthService;
  timer: TimerService;
  log: LogFn;
}

export function registerSockets(deps: SocketDeps): void {
  const { io, store, session, auth, timer, log } = deps;

  // Handshake: resolve the token to an identity. Never reject — an absent
  // or invalid token simply yields a viewer, matching the old
  // verify-identity semantics where login could not fail.
  io.use((socket, next) => {
    const identity: SocketIdentity =
      auth.verifyToken(socket.handshake.auth?.token) ?? { roleId: Role.Viewer };
    socket.data.identity = identity;
    next();
  });

  io.on('connection', (socket) => {
    const identity = socket.data.identity as SocketIdentity;
    const ctx: HandlerContext = { io, socket, identity, store, session, timer, log };

    if (identity.roleId === Role.Player && identity.index !== undefined) {
      markPlayerConnected(ctx, identity.index);
    } else {
      log(`${ROLE_NAMES[identity.roleId]} connected at ${socket.id}`);
    }

    socket.on('disconnect', () => markPlayerDisconnected(ctx));

    for (const register of REGISTRARS) register(ctx);
  });
}

function markPlayerConnected(ctx: HandlerContext, index: number): void {
  const { io, socket, store, session, log } = ctx;
  session.playerSocketIds[index] = socket.id;
  const match = store.updateMatch((m) => {
    const player = m.players[index];
    if (player) player.isReady = true;
  });
  io.emit('update-match-data', match);
  log(`Player ${match.players[index]?.name} connected at ${socket.id}`);
}

function markPlayerDisconnected(ctx: HandlerContext): void {
  const { io, socket, store, session, log } = ctx;
  // Look the slot up by socket id: after a quick reconnect the slot already
  // holds the new socket, and the stale disconnect must not clear it.
  const index = session.playerIndexOf(socket.id);
  if (index === NO_PLAYER) return;
  session.playerSocketIds[index] = '';
  const match = store.updateMatch((m) => {
    const player = m.players[index];
    if (player) player.isReady = false;
  });
  io.emit('update-match-data', match);
  log(
    `Player ${match.players[index]?.name} disconnected at ${socket.id}`,
    LogLevel.Warn,
  );
}
