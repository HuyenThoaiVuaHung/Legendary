// Hosted-mode (multiRoom) auth checks against a running server.
// Run from the Legendary repo root:
//   node <this file> <port> <roomsDir> [stage [arg]]
// Server must run with LEGENDARY_MULTIROOM=true and serverAdmins=["opsadmin"].
// Stages: (none) full suite; "persist-create" prints JSON; "persist-verify <json>".
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
const post = (path, body, token) => call(path, { method: 'POST', body, token });
const join_ = (code, secret, username, token) => post('/api/rooms/join', { code, secret, username }, token);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const pngForm = () => { const f = new FormData(); f.append('file', new Blob([PNG], { type: 'image/png' }), 'logo.png'); return f; };
const connect = (token) => new Promise((resolve) => {
  const s = io(base, { auth: token ? { token } : {}, reconnection: false, timeout: 4000 });
  s.on('connect', () => resolve({ s, status: 'connected' }));
  s.on('connect_error', (e) => { s.close(); resolve({ s, status: `error:${e.message}` }); });
});
const uniq = Date.now().toString(36);

if (stage === 'persist-create') {
  const host = (await post('/api/accounts', { username: `persist${uniq}`, password: 'persist-pass-1' })).body;
  const room = (await post('/api/rooms', undefined, host.token)).body;
  const player = (await join_(room.code, room.secrets.player, 'Keeper')).body;
  console.log(JSON.stringify({ host, room, player }));
  process.exitCode = 0;
} else if (stage === 'persist-verify') {
  const { host, room, player } = JSON.parse(stageArg);
  check('account session survives restart', (await call('/api/accounts/me', { token: host.token })).status === 200);
  check('room admin session survives restart', (await call('/api/match', { token: room.token })).status === 200);
  const reclaim = await join_(room.code, room.secrets.player, 'keeper', player.token);
  check('player session survives restart (reclaims its seat)', reclaim.status === 200 && reclaim.body.index === player.index, JSON.stringify(reclaim.body));
  check('account login works after restart', (await post('/api/accounts/login', { username: host.username, password: 'persist-pass-1' })).status === 200);
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
  process.exitCode = failures ? 1 : 0;
} else {

// ------------------------------------------------------------ mode gating
check('legacy secret login gone in hosted mode', (await post('/api/auth/login', { secret: 'BTC' })).status === 404);
check('default room unreachable without a room session', (await call('/api/match')).status === 404);
check('default /media unreachable', (await call('/media/tt/x.png')).status === 404);
check('socket without room session rejected', (await connect()).status === 'error:Join a room first');

// ------------------------------------------------------------ accounts
const password = 'correct-horse-1';
const signup = await post('/api/accounts', { username: `host${uniq}`, password });
const host = signup.body;
check('signup → 201 with token + recovery code', signup.status === 201 && host.token && /^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/.test(host.recoveryCode), JSON.stringify(signup.body));
check('duplicate username (any case) → 409', (await post('/api/accounts', { username: `HOST${uniq}`, password })).status === 409);
check('bad username → 400', (await post('/api/accounts', { username: 'a b', password })).status === 400);
check('short password → 400', (await post('/api/accounts', { username: `x${uniq}`, password: 'short' })).status === 400);
check('wrong password → 401', (await post('/api/accounts/login', { username: host.username, password: 'nope-nope-1' })).status === 401);
check('unknown user → same 401', (await post('/api/accounts/login', { username: `ghost${uniq}`, password })).status === 401);
const login = await post('/api/accounts/login', { username: host.username.toUpperCase(), password });
check('login (case-insensitive name) → token', login.status === 200 && login.body.token && login.body.token !== host.token);
check('account token is not a room session', (await call('/api/match', { token: host.token })).status === 404);

// ------------------------------------------------------------ rooms need a host
check('create room without host login → 401', (await post('/api/rooms')).status === 401);
const created = await post('/api/rooms', undefined, host.token);
const room = created.body;
check('host creates room → 201, owned by host', created.status === 201 && room.ownerAccountId === host.accountId, JSON.stringify(created.body));
const me = await call('/api/accounts/me', { token: host.token });
check('/me lists owned room', me.body.rooms?.some((r) => r.roomId === room.roomId), JSON.stringify(me.body));
const entered = await post(`/api/rooms/${room.roomId}/enter`, undefined, host.token);
check('owner enters room → admin session', entered.status === 200 && entered.body.roleId === 1);
const other = (await post('/api/accounts', { username: `other${uniq}`, password })).body;
check('non-owner cannot enter → 404', (await post(`/api/rooms/${room.roomId}/enter`, undefined, other.token)).status === 404);

// ------------------------------------------------------------ fix 1: seats
const alice = await join_(room.code, room.secrets.player, 'Alice');
check('Alice claims seat 0', alice.body.index === 0, JSON.stringify(alice.body));
const hijack = await join_(room.code, room.secrets.player, 'alice');
check('someone else typing "alice" cannot take her seat → 409', hijack.status === 409, JSON.stringify(hijack.body));
const reclaim = await join_(room.code, room.secrets.player, 'ALICE', alice.body.token);
check('Alice reclaims with her own session', reclaim.status === 200 && reclaim.body.index === 0);
check('her old token is replaced (revoked)', (await call('/api/match', { token: alice.body.token })).status === 404);
const aliceToken = reclaim.body.token;

// ------------------------------------------------------------ fix 3: revoke
const aliceSock = await connect(aliceToken);
check('Alice socket connects', aliceSock.status === 'connected');
const release = await call('/api/rooms/current/seats/0', { token: room.token, method: 'DELETE' });
await sleep(300);
check('admin releases seat 0 → 204', release.status === 204);
check('released player is logged out', (await call('/api/match', { token: aliceToken })).status === 404);
check('released player socket dropped', aliceSock.s.disconnected);
check('a new player can now take seat 0', (await join_(room.code, room.secrets.player, 'Bob')).body.index === 0);

const mc = (await join_(room.code, room.secrets.mc)).body;
const mcSock = await connect(mc.token);
const rotated = await post('/api/rooms/current/secrets', { role: 'mc' }, room.token);
await sleep(300);
check('rotate MC secret → new secret', rotated.status === 200 && rotated.body.mc !== room.secrets.mc);
check('old MC session revoked', (await call('/api/match', { token: mc.token })).status === 404);
check('old MC socket dropped', mcSock.s.disconnected);
check('old MC secret no longer works', (await join_(room.code, room.secrets.mc)).status === 401);
check('new MC secret works', (await join_(room.code, rotated.body.mc)).body.roleId === 2);
const adminRot = await post('/api/rooms/current/secrets', { role: 'admin' }, room.token);
check('rotating admin keeps the caller logged in', adminRot.status === 200 && (await call('/api/match', { token: room.token })).status === 200);
check('host-entered admin session survives admin-secret rotation', (await call('/api/match', { token: entered.body.token })).status === 200);

// ------------------------------------------------------------ transfer
const secretAdmin = (await join_(room.code, adminRot.body.admin)).body;
check('secret-only admin cannot transfer → 403', (await post('/api/rooms/current/transfer', { username: other.username }, secretAdmin.token)).status === 403);
const transfer = await post('/api/rooms/current/transfer', { username: other.username }, entered.body.token);
check('owner transfers room → 204', transfer.status === 204);
check('previous owner’s entered session revoked', (await call('/api/match', { token: entered.body.token })).status === 404);
check('new owner can enter', (await post(`/api/rooms/${room.roomId}/enter`, undefined, other.token)).status === 200);
check('previous owner can no longer enter', (await post(`/api/rooms/${room.roomId}/enter`, undefined, host.token)).status === 404);

// ------------------------------------------------------------ recovery
const recovered = await post('/api/accounts/recover', { username: host.username, recoveryCode: host.recoveryCode.toLowerCase(), newPassword: 'brand-new-pass-1' });
check('recover with code → new session + fresh code', recovered.status === 200 && recovered.body.recoveryCode !== host.recoveryCode);
check('recovery revokes old account sessions', (await call('/api/accounts/me', { token: host.token })).status === 401);
check('recovery code is single-use', (await post('/api/accounts/recover', { username: host.username, recoveryCode: host.recoveryCode, newPassword: 'another-pass-1' })).status === 401);
check('old password rejected, new accepted',
  (await post('/api/accounts/login', { username: host.username, password })).status === 401 &&
  (await post('/api/accounts/login', { username: host.username, password: 'brand-new-pass-1' })).status === 200);

// ------------------------------------------------------------ fix 2: branding
check('room admin cannot change server branding', (await call('/api/assets/logo', { token: secretAdmin.token, method: 'POST', form: pngForm() })).status === 401);
check('non-server-admin host → 403', (await call('/api/assets/logo', { token: other.token, method: 'POST', form: pngForm() })).status === 403);
const ops = (await post('/api/accounts', { username: 'opsadmin', password: 'ops-admin-pass-1' })).body
  ?? {};
const opsToken = ops.token ?? (await post('/api/accounts/login', { username: 'opsadmin', password: 'ops-admin-pass-1' })).body.token;
const opsBrand = await call('/api/assets/logo', { token: opsToken, method: 'POST', form: pngForm() });
check('serverAdmins host can change server branding', opsBrand.status === 200, JSON.stringify(opsBrand));

// ------------------------------------------------------------ close
const closed = await call('/api/rooms/current', { token: secretAdmin.token, method: 'DELETE' });
check('admin closes room', closed.status === 204 && !existsSync(join(roomsDir, room.roomId)));
check('all room sessions revoked on close', (await call('/api/match', { token: adminRot.body && secretAdmin.token })).status === 404);

for (const s of [aliceSock.s, mcSock.s]) s.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exitCode = failures ? 1 : 0;
}
