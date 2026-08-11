/**
 * Smoke test for the rewritten Legendary server.
 * Boots nothing itself — expects the server on http://localhost:<PORT>.
 * Run: node tests/smoke.mjs [port]
 */
import { io } from 'socket.io-client';

const port = process.argv[2] ?? '8080';
const base = `http://localhost:${port}`;
let failures = 0;

const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};

const json = async (path, opts = {}) => {
  const res = await fetch(base + path, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

// --- REST: auth ---------------------------------------------------------
const viewer = await json('/api/auth/login', { method: 'POST', body: '{}' });
check('viewer login', viewer.status === 200 && viewer.body?.roleId === 3, JSON.stringify(viewer));

const admin = await json('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ secret: 'BTC' }),
});
check('admin login', admin.status === 200 && admin.body?.roleId === 1 && admin.body?.token, JSON.stringify(admin));
const adminAuth = { authorization: `Bearer ${admin.body?.token}` };

const player = await json('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ secret: '123' }),
});
check('player login', player.body?.roleId === 0 && player.body?.index === 0, JSON.stringify(player));

// --- REST: match + rounds ----------------------------------------------
const match = await json('/api/match', { headers: adminAuth });
check('get match', match.status === 200 && Array.isArray(match.body?.players) && match.body?.roundFiles?.kd !== undefined, JSON.stringify(match.body)?.slice(0, 120));

const posDenied = await json('/api/match/position', { method: 'PATCH', body: JSON.stringify({ position: 'KD' }) });
check('position without token denied', posDenied.status === 401, `status ${posDenied.status}`);

const pos = await json('/api/match/position', {
  method: 'PATCH',
  headers: adminAuth,
  body: JSON.stringify({ position: 'KD' }),
});
check('admin sets position', pos.status === 200, JSON.stringify(pos.body));

for (const kind of ['kd', 'vcnv', 'tt', 'vd', 'chp']) {
  const r = await json(`/api/rounds/${kind}`, { headers: adminAuth });
  check(`get round ${kind}`, r.status === 200 && r.body !== null, `status ${r.status}`);
}

const kdViewer = await json('/api/rounds/kd', {
  headers: { authorization: `Bearer ${viewer.body?.token}` },
});
check('viewer kd round has questions stripped', kdViewer.status === 200 && kdViewer.body?.questions == null, JSON.stringify(kdViewer.body)?.slice(0, 120));

// --- Socket: handshake + realtime push -----------------------------------
await new Promise((resolve) => {
  const socket = io(base, { auth: { token: player.body?.token }, transports: ['websocket'] });
  const timeout = setTimeout(() => {
    check('socket connect (player token)', false, 'timeout');
    socket.close();
    resolve();
  }, 4000);

  socket.on('connect', () => {
    let gotMatchUpdate = false;
    socket.on('update-match-data', (m) => {
      if (gotMatchUpdate) return;
      gotMatchUpdate = true;
      check('player connect triggers update-match-data with isReady', m?.players?.[0]?.isReady === true, JSON.stringify(m?.players?.[0]));
      clearTimeout(timeout);
      socket.close();
      resolve();
    });
    check('socket connect (player token)', true);
    // Admin PATCH triggers a push we should also receive; isReady push happens on connect.
  });
  socket.on('connect_error', (e) => {
    check('socket connect (player token)', false, String(e));
    clearTimeout(timeout);
    resolve();
  });
});

// --- Media 404 sanity ----------------------------------------------------
const media404 = await fetch(`${base}/media/tt/definitely-not-a-file.png`);
check('missing media 404s', media404.status === 404, `status ${media404.status}`);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
