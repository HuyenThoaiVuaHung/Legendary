import { Server, Socket } from 'socket.io';
import { Role } from '../contracts/api';
import { GameRules } from '../game.rules';
import { LogFn } from '../logger';
import { GameSessionState } from '../state/game.state';
import { MatchStore } from '../state/match.store';
import { TimerService } from '../services/timer.service';

/** Set on every socket by the auth handshake middleware in sockets/index.ts. */
export interface SocketIdentity {
  roleId: Role;
  /** Player index (0-based); only for Role.Player. */
  index?: number;
}

/**
 * Everything a round handler module may touch. Handlers never import fs,
 * never persist except through `store`, and never track their own timers.
 */
export interface HandlerContext {
  io: Server;
  socket: Socket;
  identity: SocketIdentity;
  store: MatchStore;
  session: GameSessionState;
  timer: TimerService;
  rules: GameRules;
  log: LogFn;
}

/** A round module's entry point: attach this socket's event listeners. */
export type HandlerRegistrar = (ctx: HandlerContext) => void;

export function isAdmin(ctx: HandlerContext): boolean {
  return ctx.identity.roleId === Role.Admin;
}
