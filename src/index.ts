import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { networkInterfaces } from 'os';
import { Server } from 'socket.io';
import { loadConfig } from './config';
import { createLogger, LogLevel } from './logger';
import { AuthService } from './services/auth.service';
import { LegionFileService } from './services/legion-file.service';
import { MediaStore } from './services/media.store';
import { TimerService } from './services/timer.service';
import { GameSessionState } from './state/game.state';
import { MatchStore } from './state/match.store';
import { createApiRouter, mountFrontend } from './http';
import { registerSockets } from './sockets';

const config = loadConfig();
const log = createLogger(config.saveLog);

const store = new MatchStore(config.matchDataPath, log);
const session = new GameSessionState();
const auth = new AuthService(config);
const media = new MediaStore(config.mediaDir, config.assetsDir);
const legionFiles = new LegionFileService(store, media);

const app = express();
app.use(cors({ origin: '*' }));
app.use(compression());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const timer = new TimerService(io, store, config.rules);

app.use(createApiRouter({ io, store, session, auth, media, legionFiles, log, config }));
mountFrontend(app, config.frontendDir, config.assetsDir);

registerSockets({ io, store, session, auth, timer, rules: config.rules, log });

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
