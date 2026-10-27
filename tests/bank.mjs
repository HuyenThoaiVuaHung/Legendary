/** Hosted bank and room branding checks. Run: node tests/bank.mjs [port] [roomsDir] */
import { createRequire } from 'module';
import { randomBytes } from 'crypto';
const AdmZip = createRequire(import.meta.url)('adm-zip');
const port = process.argv[2] ?? '8080';
const roomsDir = process.argv[3];
const base = `http://localhost:${port}`;
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
};
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const editorData = {
  uid: 'bank-test', dateModified: 0,
  uiConfig: { darkMode: true, pallette: 2, miscImageSrcNames: { logo: 'logo.png' } },
  matchData: { matchName: 'Bank Cup', matchVersion: 24, matchPos: 0,
    players: ['A', 'B', 'C', 'D'].map((name) => ({ name, score: 0, isReady: false })) },
  questionBank: { kd: {}, vcnv: { cnv: '', questions: [] }, tt: { questions: [] }, vd: { questions: [] }, chp: { questions: [] } },
};
const zip = new AdmZip();
zip.addFile('editorData.json', Buffer.from(JSON.stringify(editorData)));
zip.addFile('misc/logo.png', png);
const archive = zip.toBuffer();
const json = (body) => ({ 'content-type': 'application/json', ...body });
const call = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, options);
  const type = response.headers.get('content-type') ?? '';
  const body = type.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { status: response.status, body };
};
const suffix = randomBytes(5).toString('hex');
const signup = async (prefix) => call('/api/accounts', {
  method: 'POST', headers: json({}), body: JSON.stringify({ username: `${prefix}${suffix}`, password: 'test-password-123' }),
});
const first = await signup('bank1');
const second = await signup('bank2');
check('host signups', first.status === 201 && second.status === 201, JSON.stringify([first, second]));
const host = { authorization: `Bearer ${first.body.token}` };
const other = { authorization: `Bearer ${second.body.token}` };
const upload = async (data, filename, name) => {
  const form = new FormData();
  form.append('file', new Blob([data], { type: 'application/zip' }), filename);
  if (name !== undefined) form.append('name', name);
  return call('/api/bank', { method: 'POST', headers: host, body: form });
};
const added = await upload(archive, 'test.legion');
check('upload', added.status === 201 && added.body.matchName === 'Bank Cup', JSON.stringify(added));
const id = added.body.id;
const listing = await call('/api/bank', { headers: host });
check('list and usage', listing.body.items?.some((item) => item.id === id) && listing.body.usedBytes === archive.length && listing.body.maxBytes > 0 && listing.body.maxItems > 0, JSON.stringify(listing));
const renamed = await call(`/api/bank/${id}`, { method: 'PATCH', headers: json(host), body: JSON.stringify({ name: 'Renamed' }) });
check('rename', renamed.status === 200 && renamed.body.name === 'Renamed');
const downloaded = await call(`/api/bank/${id}`, { headers: host });
check('download round-trip', downloaded.status === 200 && downloaded.body.equals(archive));
check('invalid archive', (await upload(Buffer.from('bad'), 'bad.legion')).status === 400);
check('invalid extension', (await upload(archive, 'bad.zip')).status === 400);
const otherList = await call('/api/bank', { headers: other });
check('other host list', !otherList.body.items?.some((item) => item.id === id));
check('other host download', (await call(`/api/bank/${id}`, { headers: other })).status === 404);
check('other host delete', (await call(`/api/bank/${id}`, { method: 'DELETE', headers: other })).status === 404);
const created = await call('/api/rooms', { method: 'POST', headers: json(host), body: JSON.stringify({ bankItemId: id }) });
check('create room from bank', created.status === 201, JSON.stringify(created));
const roomAuth = { authorization: `Bearer ${created.body.token}` };
const config = await call('/api/config', { headers: roomAuth });
const logoUrl = config.body.ui?.brand?.logo;
check('room branding', config.body.ui?.darkMode === true && config.body.ui?.palette === 2 && logoUrl?.startsWith(`/rooms/${created.body.roomId}/media/misc/`) && (await call(logoUrl)).status === 200, JSON.stringify(config));
const exported = await call('/api/match/export-legion', { headers: roomAuth });
let exportedUi;
try { exportedUi = JSON.parse(new AdmZip(exported.body).readAsText('editorData.json')).uiConfig; } catch {}
check('export preserves uiConfig', exported.status === 200 && exportedUi?.darkMode && exportedUi?.miscImageSrcNames?.logo === 'logo.png');
const saved = await call('/api/rooms/current/save-to-bank', { method: 'POST', headers: json(roomAuth), body: JSON.stringify({ name: 'Room save' }) });
check('save new item', saved.status === 201 && saved.body.name === 'Room save', JSON.stringify(saved));
const replaced = await call('/api/rooms/current/save-to-bank', { method: 'POST', headers: json(roomAuth), body: JSON.stringify({ bankItemId: saved.body.id }) });
check('replace item', replaced.status === 200 && replaced.body.id === saved.body.id);
const joined = await call('/api/rooms/join', { method: 'POST', headers: json({}), body: JSON.stringify({ code: created.body.code, secret: created.body.secrets.admin }) });
check('non-owner save forbidden', (await call('/api/rooms/current/save-to-bank', { method: 'POST', headers: json({ authorization: `Bearer ${joined.body.token}` }), body: '{}' })).status === 403);
const brandForm = new FormData();
brandForm.append('file', new Blob([png], { type: 'image/png' }), 'new.png');
const branded = await call('/api/brand/logo', { method: 'POST', headers: roomAuth, body: brandForm });
check('set brand', branded.status === 200 && branded.body.ui?.brand?.logo !== logoUrl);
const unbranded = await call('/api/brand/logo', { method: 'DELETE', headers: roomAuth });
check('delete brand', unbranded.status === 200 && unbranded.body.ui?.brand?.logo === '/assets/misc/logo.png');
check('delete item', (await call(`/api/bank/${id}`, { method: 'DELETE', headers: host })).status === 204 && (await call(`/api/bank/${id}`, { headers: host })).status === 404);
if (saved.body.id) await call(`/api/bank/${saved.body.id}`, { method: 'DELETE', headers: host });
if (created.body.token) await call('/api/rooms/current', { method: 'DELETE', headers: roomAuth });
void roomsDir;
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exitCode = failures === 0 ? 0 : 1;
