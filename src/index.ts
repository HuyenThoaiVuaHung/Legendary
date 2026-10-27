import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { networkInterfaces } from 'os';
import { Server } from 'socket.io';
import { loadConfig, usesDefaultSecrets } from './config';
import { createLogger, LogLevel } from './logger';
import { RoomRegistry } from './rooms/room.registry';
import { AccountStore } from './services/account.store';
import { AuthService } from './services/auth.service';
import { SessionStore } from './services/session.store';
import { createApiRouter, mountFrontend } from './http';
import { createClientIp } from './http/client-ip';
import { registerSockets } from './sockets';

const config = loadConfig();
const log = createLogger(config.saveLog);

const MS_PER_SECOND = 1000;
const sessions = new SessionStore(
  config.sessionsPath,
  config.sessionIdleTtlSeconds * MS_PER_SECOND,
  config.sessionMaxTtlSeconds * MS_PER_SECOND,
  log,
);
const auth = new AuthService(config, sessions);
const accounts = new AccountStore(config.accountsPath, log);

if (config.multiRoom) {
  log(`Hosted mode: rooms + host accounts on, default room off.`);
  if (config.serverAdmins.length === 0) {
    log('No serverAdmins configured: server-wide branding cannot be changed.', LogLevel.Warn);
  }
} else if (usesDefaultSecrets(config)) {
  log(
    'Default secrets in use (admin "BTC"…). Fine on a private LAN; set adminSecret, ' +
      'mcSecret and playerSecrets before exposing this server.',
    LogLevel.Warn,
  );
}

const app = express();
app.set('trust proxy', config.trustProxy);
log(`Trust proxy: ${config.trustProxy}`, config.trustProxy === false ? LogLevel.Info : LogLevel.Warn);
const clientIp = createClientIp(config.trustProxy);
app.use(cors({ origin: '*' }));
app.use(compression());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const rooms = new RoomRegistry(io, config, sessions, log);

app.use(createApiRouter({ rooms, auth, accounts, log, config }));
mountFrontend(app, config.frontendDir, config.assetsDir, config.assetsOverrideDir);

registerSockets({
  io,
  rooms,
  auth,
  log,
  multiRoom: config.multiRoom,
  clientIp,
  maxSocketsPerIp: config.maxSocketsPerIp,
  maxSpectatorsPerRoom: config.maxSpectatorsPerRoom,
});

httpServer.listen(config.port, () => {
  log('Server Legendary khởi động thành công, đang chờ kết nối mới…');
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const net of interfaces ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        log(`Địa chỉ IP của máy chủ: http://${net.address}`, LogLevel.Warn);
      }
    }
  }
});
