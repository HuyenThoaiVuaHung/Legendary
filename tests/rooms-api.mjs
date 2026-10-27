// Phase-2 checks against a running server: room API, seats, REST isolation,
// per-room media and config, closing. Run from the Legendary repo root:
//   node <this file> <port> <roomsDir> [stage]
// stage "persist-create" creates a room and prints its JSON; stage
// "persist-verify <json>" checks it survived a restart.
import { createRequire } from 'module';
import { existsSync } from 'fs';
import { join } from 'path';

const require = createRequire(join(process.cwd(), 'package.json'));
const { io } = require('socket.io-client');

const [port, roomsDir, stage, stageArg] = process.argv.slice(2);
const base = `http://localhost:${port}`;
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};
const call = async (path, { token, method = 'GET', body, form } = {}) => {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json };
};
const post_join_with = (code, secret, username, token) => call('/api/rooms/join', { method: 'POST', body: { code, secret, username }, token });
const join_ = (code, secret, username) => call('/api/rooms/join', { method: 'POST', body: { code, secret, username } });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (stage === 'persist-create') {
  const h = await call('/api/accounts', { method: 'POST', body: { username: `p2p${Date.now().toString(36)}`, password: 'phase-two-pass' } });
  const c = await call('/api/rooms', { method: 'POST', token: h.body.token });
  const p = await join_(c.body.code, c.body.secrets.player, 'Persisted');
  await call('/api/config', { token: c.body.token, method: 'PATCH', body: { kdCorrectPoints: 77 } });
  console.log(JSON.stringify({ code: c.body.code, secrets: c.body.secrets, seat: p.body.index, roomId: c.body.roomId }));
  process.exitCode = 0;
} else if (stage === 'persist-verify') {
  const saved = JSON.parse(stageArg);
  const again = await join_(saved.code, saved.secrets.player, 'persisted');
  check('room survives restart (join by code)', again.status === 200, JSON.stringify(again.body));
  check('seat survives restart', again.body.index === saved.seat, `${again.body.index} vs ${saved.seat}`);
  const admin = await join_(saved.code, saved.secrets.admin);
  const cfg = await call('/api/config', { token: admin.body.token });
  check('room rules survive restart', cfg.body.rules?.kdCorrectPoints === 77, JSON.stringify(cfg.body.rules?.kdCorrectPoints));
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
  process.exitCode = failures ? 1 : 0;
} else {

// ---------------------------------------------------------------- create
const hostSignup = await call('/api/accounts', { method: 'POST', body: { username: `p2${Date.now().toString(36)}`, password: 'phase-two-pass' } });
const HOST = hostSignup.body.token;
const created = await call('/api/rooms', { method: 'POST', token: HOST });
const A = created.body;
check('create room → 201 with code, secrets, admin token',
  created.status === 201 && /^[A-Z2-9]{6}$/.test(A.code) && A.secrets?.player && A.token && A.roleId === 1,
  JSON.stringify(created));

// ---------------------------------------------------------------- join
const spectator = await join_(A.code.toLowerCase());
check('join without secret → spectator (code case-insensitive)', spectator.status === 200 && spectator.body.roleId === 3 && spectator.body.roomId === A.roomId, JSON.stringify(spectator.body));
check('wrong secret → 401', (await join_(A.code, 'nope')).status === 401);
check('unknown code → 404', (await join_('ZZZZZZ')).status === 404);
check('player secret without username → 400', (await join_(A.code, A.secrets.player)).status === 400);

const alice = await join_(A.code, A.secrets.player, 'Alice');
const bob = await join_(A.code, A.secrets.player, 'Bob');
const alice2 = await post_join_with(A.code, A.secrets.player, 'ALICE', alice.body.token);
check('first player gets seat 0', alice.body.roleId === 0 && alice.body.index === 0, JSON.stringify(alice.body));
check('second player gets seat 1', bob.body.index === 1, JSON.stringify(bob.body));
check('own session reclaims seat (case-insensitive)', alice2.body.index === 0, JSON.stringify(alice2.body));
await join_(A.code, A.secrets.player, 'Carol');
await join_(A.code, A.secrets.player, 'Dave');
check('fifth player → 409 seats full', (await join_(A.code, A.secrets.player, 'Eve')).status === 409);
check('mc secret → MC', (await join_(A.code, A.secrets.mc)).body.roleId === 2);
check('admin secret → admin', (await join_(A.code, A.secrets.admin)).body.roleId === 1);

// ---------------------------------------------------------------- REST isolation
const B = (await call('/api/rooms', { method: 'POST', token: HOST })).body;
const defaultBefore = (await call('/api/match', { token: B.token })).body.position;

// A viewer socket in room A and one in the default room.
const listen = (token) => new Promise((resolve) => {
  const s = io(base, { auth: token ? { token } : {}, reconnection: false });
  const got = [];
  s.on('update-match-data', (m) => got.push(m.position));
  s.on('connect', () => resolve({ s, got }));
});
const sockA = await listen(spectator.body.token);
const sockD = await listen(B.token);
await sleep(200);

const newPos = defaultBefore === 'KD' ? 'VCNV' : 'KD';
const setA = await call('/api/match/position', { token: A.token, method: 'PATCH', body: { position: newPos } });
await sleep(300);
check('room A admin sets room A position', setA.status === 200 && setA.body.position === newPos, JSON.stringify(setA.body));
check('room B position untouched', (await call('/api/match', { token: B.token })).body.position === defaultBefore);
check('room B match untouched', (await call('/api/match', { token: B.token })).body.position !== newPos);
check('room A socket got the broadcast', sockA.got.includes(newPos), JSON.stringify(sockA.got));
check('room B socket did not', !sockD.got.includes(newPos), JSON.stringify(sockD.got));
check('room A admin cannot act as room B admin (token is room-bound)',
  (await call('/api/match', { token: A.token })).body.position === newPos);

// ---------------------------------------------------------------- config
const patched = await call('/api/config', { token: A.token, method: 'PATCH', body: { kdCorrectPoints: 42 } });
check('room A rules patched', patched.status === 200 && patched.body.rules.kdCorrectPoints === 42, JSON.stringify(patched.body).slice(0, 120));
check('room B rules unchanged', (await call('/api/config', { token: B.token })).body.rules.kdCorrectPoints !== 42);

// ---------------------------------------------------------------- media
const form = () => { const f = new FormData(); f.append('file', new Blob([PNG], { type: 'image/png' }), 'room-test.png'); return f; };
const up = await call('/api/media/tt', { token: A.token, method: 'POST', form: form() });
check('room upload URL is room-scoped', up.status === 200 && up.body.url?.startsWith(`/rooms/${A.roomId}/media/tt/`), JSON.stringify(up.body));
check('room media served at its URL', (await fetch(base + up.body.url)).status === 200);
check('room media not served from default /media', (await fetch(`${base}/media/tt/${encodeURIComponent(up.body.fileName)}`)).status === 404);
check('room media not served under another room', (await fetch(base + up.body.url.replace(A.roomId, B.roomId))).status === 404);
const brand = await call('/api/assets/logo', { token: A.token, method: 'POST', form: form() });
check('room admin cannot change server brand assets', brand.status === 401 || brand.status === 403, JSON.stringify(brand));

// ---------------------------------------------------------------- unknown room / close
check('garbage token → 404 (no default room in hosted mode)', (await call('/api/match', { token: 'garbage' })).status === 404);
const del = await call('/api/rooms/current', { token: A.token, method: 'DELETE' });
await sleep(300);
check('admin closes room → 204', del.status === 204, JSON.stringify(del));
check('closed room code no longer joins', (await join_(A.code)).status === 404);
check('closed room token → 404 Unknown room', (await call('/api/match', { token: A.token })).status === 404);
check('closed room data deleted', !existsSync(join(roomsDir, A.roomId)));
check('closed room sockets disconnected', sockA.s.disconnected);

sockA.s.close();
sockD.s.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exitCode = failures ? 1 : 0;
}
