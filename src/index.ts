import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { networkInterfaces } from 'os';
import { Server } from 'socket.io';
import { loadConfig } from './config';
import { createLogger, LogLevel } from './logger';
import { RoomRegistry } from './rooms/room.registry';
import { AuthService } from './services/auth.service';
import { createApiRouter, mountFrontend } from './http';
import { registerSockets } from './sockets';

const config = loadConfig();
const log = createLogger(config.saveLog);

const auth = new AuthService(config);

const app = express();
app.use(cors({ origin: '*' }));
app.use(compression());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const rooms = new RoomRegistry(io, config, log);

app.use(createApiRouter({ rooms, auth, log, config }));
mountFrontend(app, config.frontendDir, config.assetsDir, config.assetsOverrideDir);

registerSockets({ io, rooms, auth, log });

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
