/** Phase 5 hosted limits and expiry checks. Run: node tests/limits.mjs <port> <roomsDir> */
import { createRequire } from 'module';
import { existsSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

const require = createRequire(import.meta.url);
const { io } = require('socket.io-client');
const AdmZip = require('adm-zip');
const [port, roomsDir] = process.argv.slice(2);
const base = `http://localhost:${port}`;
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const call = async (path, { token, method = 'GET', body, form, ip } = {}) => {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (ip) headers['x-forwarded-for'] = ip;
  const response = await fetch(base + path, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch { result = text; }
  return { status: response.status, body: result };
};
const post = (path, body, token, ip) => call(path, { method: 'POST', body, token, ip });
const connect = (token) => new Promise((resolve) => {
  const s = io(base, { auth: { token }, reconnection: false, timeout: 4000, forceNew: true });
  s.once('connect', () => resolve({ s, status: 'connected' }));
  s.once('connect_error', (error) => { s.close(); resolve({ s, status: error.message }); });
});
const form = (data, name, type) => {
  const result = new FormData();
  result.append('file', new Blob([data], { type }), name);
  return result;
};
const suffix = randomBytes(5).toString('hex');
const password = 'test-password-123';
const host = await post('/api/accounts', { username: `limits${suffix}`, password });
check('host signup', host.status === 201, JSON.stringify(host));
const created = await post('/api/rooms', undefined, host.body.token);
check('create room', created.status === 201, JSON.stringify(created));
const room = created.body;
const player = await post('/api/rooms/join', { code: room.code, secret: room.secrets.player, username: 'LimitPlayer' }, undefined, '192.0.2.10');
check('player joins', player.status === 200, JSON.stringify(player));
const adminInfo = await call('/api/rooms/current', { token: room.token });
const playerInfo = await call('/api/rooms/current', { token: player.body.token });
check('admin current room includes secrets and expiry', adminInfo.status === 200 && adminInfo.body.roomId === room.roomId && adminInfo.body.secrets?.admin === room.secrets.admin && Number.isFinite(adminInfo.body.expiresAt) && adminInfo.body.expiresAt > Date.now(), JSON.stringify(adminInfo));
check('player current room excludes secrets and includes expiry', playerInfo.status === 200 && playerInfo.body.roomId === room.roomId && !Object.hasOwn(playerInfo.body, 'secrets') && Number.isFinite(playerInfo.body.expiresAt), JSON.stringify(playerInfo));

const large = Buffer.alloc(2100, 1);
const upload = await call('/api/media/tt', { method: 'POST', token: room.token, form: form(large, 'large.png', 'image/png') });
check('upload over quota returns 413', upload.status === 413 && upload.body.error === 'Room storage is full', JSON.stringify(upload));
const editorData = {
  uid: 'limits-test', dateModified: 0,
  uiConfig: { darkMode: true, pallette: 2, miscImageSrcNames: { logo: 'logo.png' } },
  matchData: { matchName: 'Limits', matchVersion: 24, matchPos: 0, players: ['A', 'B', 'C', 'D'].map((name) => ({ name, score: 0, isReady: false })) },
  questionBank: { kd: {}, vcnv: { cnv: '', questions: [] }, tt: { questions: [] }, vd: { questions: [] }, chp: { questions: [] } },
};
const zip = new AdmZip();
zip.addFile('editorData.json', Buffer.from(JSON.stringify(editorData)));
zip.addFile('misc/logo.png', large);
const imported = await call('/api/match/import-legion', { method: 'POST', token: room.token, form: form(zip.toBuffer(), 'large.legion', 'application/zip') });
check('legion import over quota returns 413', imported.status === 413 && imported.body.error === 'Room storage is full', JSON.stringify(imported));

const sockets = [];
try {
  for (let i = 0; i < 3; i++) sockets.push(await connect(room.token));
  const rejected = await connect(room.token);
  check('socket cap rejects fourth connection', sockets.every((s) => s.status === 'connected') && rejected.status === 'Too many connections', JSON.stringify([...sockets.map((s) => s.status), rejected.status]));
  sockets[0].s.close();
  await sleep(300);
  const replacement = await connect(room.token);
  sockets.push(replacement);
  check('socket slot is released on disconnect', replacement.status === 'connected', replacement.status);

  for (const [path, body, label] of [
    ['/api/accounts/login', { username: host.body.username, password: 'wrong-password-123' }, 'login'],
    ['/api/rooms/join', { code: room.code, secret: 'wrong' }, 'join'],
  ]) {
    const a = '198.51.100.10';
    const b = '198.51.100.11';
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await post(path, body, undefined, a));
    const independent = await post(path, body, undefined, b);
    check(`${label} rate limits same forwarded IP independently`, results[0].status === 401 && results[1].status === 401 && results[2].status === 429 && independent.status === 401, JSON.stringify([...results, independent]));
  }

  const idle = await post('/api/rooms', undefined, host.body.token);
  check('create idle room', idle.status === 201, JSON.stringify(idle));
  const warning = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 9000);
    sockets[1].s.once('room-expiring', (event) => { clearTimeout(timer); resolve({ event, receivedAt: Date.now() }); });
  });
  const warned = await warning;
  check('connected socket receives warning before expiry', Number.isFinite(warned?.event?.expiresAt) && warned.receivedAt < warned.event.expiresAt, JSON.stringify(warned));
  await sleep(3500);
  const idleJoin = await post('/api/rooms/join', { code: idle.body.code }, undefined, '192.0.2.20');
  check('idle room expires and its data is removed', idleJoin.status === 404 && !existsSync(join(roomsDir, idle.body.roomId)), JSON.stringify(idleJoin));
  const liveInfo = await call('/api/rooms/current', { token: room.token });
  check('room with connected socket survives expiry', sockets[1].s.connected && liveInfo.status === 200 && existsSync(join(roomsDir, room.roomId)), JSON.stringify(liveInfo));
} finally {
  for (const { s } of sockets) s.close();
}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exitCode = failures ? 1 : 0;
