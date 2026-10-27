// Two-room isolation: broadcasts stay inside their room, and each room's data
// lands under its own directory. Drives the compiled RoomRegistry directly.
//   node tests/rooms-isolation.mjs [legendary repo root]  (run with cwd = an empty sandbox dir)
import { createRequire } from 'module';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const repo = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(repo, 'package.json'));
const { createServer } = require('http');
const { Server } = require('socket.io');
const { io: client } = require('socket.io-client');

const { loadConfig } = require(join(repo, 'dist/config.js'));
const { RoomRegistry } = require(join(repo, 'dist/rooms/room.registry.js'));
const { AuthService } = require(join(repo, 'dist/services/auth.service.js'));
const { SessionStore } = require(join(repo, 'dist/services/session.store.js'));
const { registerSockets } = require(join(repo, 'dist/sockets/index.js'));

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

const config = { ...loadConfig(), matchDataPath: 'sandbox/match.json', roomsDir: 'sandbox/rooms' };
const http = createServer();
const io = new Server(http);
const log = () => {};
const sessions = new SessionStore(join('sandbox', 'sessions.json'), config.sessionIdleTtlSeconds * 1000, config.sessionMaxTtlSeconds * 1000, log);
const auth = new AuthService(config, sessions);
const rooms = new RoomRegistry(io, config, sessions, log);
registerSockets({ io, rooms, auth, log, multiRoom: false });
await new Promise((r) => http.listen(0, r));
const url = `http://localhost:${http.address().port}`;

const a = rooms.create('test-owner');
const b = rooms.create('test-owner');
const token = (roomId) => auth.issueToken({ roleId: 3, roomId });
const join_ = (roomId) =>
  new Promise((resolve) => {
    const s = client(url, { auth: { token: token(roomId) }, reconnection: false });
    s.on('connect', () => resolve(s));
  });

const [sa, sb, sd] = await Promise.all([join_(a.id), join_(b.id), join_('default')]);
const got = { a: [], b: [], d: [] };
sa.on('ping-room', (v) => got.a.push(v));
sb.on('ping-room', (v) => got.b.push(v));
sd.on('ping-room', (v) => got.d.push(v));
await new Promise((r) => setTimeout(r, 200));

a.channel.emit('ping-room', 'A');
b.channel.emit('ping-room', 'B');
rooms.defaultRoom().channel.emit('ping-room', 'D');
await new Promise((r) => setTimeout(r, 300));

check('room A only hears A', JSON.stringify(got.a) === '["A"]', JSON.stringify(got.a));
check('room B only hears B', JSON.stringify(got.b) === '["B"]', JSON.stringify(got.b));
check('default room only hears D', JSON.stringify(got.d) === '["D"]', JSON.stringify(got.d));

a.store.updateMatch((m) => { m.matchName = 'Room A match'; });
a.store.round('kd').update(() => {});
check('room A match file under its dir', existsSync(join(config.roomsDir, a.id, 'match.json')));
check('room A round file under its dir', existsSync(join(config.roomsDir, a.id, 'round_data', 'kd.json')));
check('room B unaffected by A', b.store.getMatch().matchName !== 'Room A match');
check('rooms have independent rules objects', a.rules !== b.rules && a.rules !== config.rules);

check('remove closes room', rooms.remove(a.id) && rooms.get(a.id) === undefined);
check('default room cannot be removed', rooms.remove('default') === false);

for (const s of [sa, sb, sd]) s.close();
await new Promise((resolve) => io.close(resolve));
await new Promise((resolve) => http.close(resolve));
console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exitCode = failures ? 1 : 0;
