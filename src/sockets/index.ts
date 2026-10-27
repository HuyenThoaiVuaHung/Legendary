import { Server } from 'socket.io';
import { IncomingMessage } from 'http';
import { Role } from '../contracts/api';
import { ipBucket } from '../http/client-ip';
import { LogFn, LogLevel } from '../logger';
import { DEFAULT_ROOM_ID, RoomRegistry } from '../rooms/room.registry';
import { AuthService } from '../services/auth.service';
import { NO_PLAYER } from '../state/game.state';
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
  rooms: RoomRegistry;
  auth: AuthService;
  log: LogFn;
  /** Hosted mode: every socket must belong to a created room. */
  multiRoom: boolean;
  clientIp: (req: IncomingMessage) => string;
  maxSocketsPerIp: number;
  maxSpectatorsPerRoom: number;
}

export function registerSockets(deps: SocketDeps): void {
  const { io, rooms, auth, log, multiRoom, clientIp, maxSocketsPerIp, maxSpectatorsPerRoom } = deps;
  const socketCounts = new Map<string, number>();
  const viewerCounts = new Map<string, number>();

  // Handshake: resolve the token to an identity. An absent or invalid token
  // simply yields a viewer of the default room, matching the old
  // verify-identity semantics where login could not fail. Only a token for a
  // room that no longer exists is rejected.
  io.use((socket, next) => {
    const bucket = ipBucket(clientIp(socket.request));
    if ((socketCounts.get(bucket) ?? 0) >= maxSocketsPerIp) {
      next(new Error('Too many connections'));
      return;
    }
    socket.data.ipBucket = bucket;
    const identity: SocketIdentity =
      auth.verifyToken(socket.handshake.auth?.token) ?? { roleId: Role.Viewer };
    const roomId = identity.roomId ?? DEFAULT_ROOM_ID;
    if (multiRoom && roomId === DEFAULT_ROOM_ID) {
      next(new Error('Join a room first'));
      return;
    }
    if (!rooms.get(roomId)) {
      next(new Error('Unknown room'));
      return;
    }
    if (roomId !== DEFAULT_ROOM_ID && identity.roleId === Role.Viewer &&
      (viewerCounts.get(roomId) ?? 0) >= maxSpectatorsPerRoom) {
      next(new Error('Room is full'));
      return;
    }
    if (roomId !== DEFAULT_ROOM_ID && identity.roleId === Role.Viewer) {
      viewerCounts.set(roomId, (viewerCounts.get(roomId) ?? 0) + 1);
      socket.once('disconnect', () => {
        const count = (viewerCounts.get(roomId) ?? 1) - 1;
        if (count === 0) viewerCounts.delete(roomId);
        else viewerCounts.set(roomId, count);
      });
    }
    socket.data.identity = identity;
    next();
  });

  io.on('connection', (socket) => {
    const identity = socket.data.identity as SocketIdentity;
    const room = rooms.get(identity.roomId ?? DEFAULT_ROOM_ID);
    if (!room) {
      // The room closed between handshake and connection.
      socket.disconnect(true);
      return;
    }
    const bucket = socket.data.ipBucket as string;
    if ((socketCounts.get(bucket) ?? 0) >= maxSocketsPerIp) {
      socket.disconnect(true);
      return;
    }
    socketCounts.set(bucket, (socketCounts.get(bucket) ?? 0) + 1);
    void socket.join(room.id);
    room.touch();
    const ctx: HandlerContext = {
      io: room.channel,
      socket,
      identity,
      store: room.store,
      session: room.session,
      timer: room.timer,
      rules: room.rules,
      log,
    };

    if (identity.roleId === Role.Player && identity.index !== undefined) {
      markPlayerConnected(ctx, identity.index);
    } else {
      log(`${ROLE_NAMES[identity.roleId]} connected at ${socket.id}`);
    }

    socket.on('disconnect', () => {
      const count = (socketCounts.get(bucket) ?? 1) - 1;
      if (count === 0) {
        socketCounts.delete(bucket);
      } else {
        socketCounts.set(bucket, count);
      }
      markPlayerDisconnected(ctx);
    });

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
