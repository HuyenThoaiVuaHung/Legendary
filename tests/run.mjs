import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = new Map([
  ['smoke', 'FAIL'],
  ['e2e-legion', 'FAIL'],
  ['rooms-auth', 'FAIL'],
  ['rooms-api', 'FAIL'],
  ['rooms-auth persist-create', 'FAIL'],
  ['rooms-auth persist-verify', 'FAIL'],
  ['rooms-isolation', 'FAIL'],
  ['bank', 'FAIL'],
  ['unsafe trust proxy', 'FAIL'],
  ['limits', 'FAIL'],
  ['room-features', 'FAIL'],
]);
let server;
let suite;
let interrupted = false;
let tempDir;

const onInterrupt = () => {
  interrupted = true;
  if (suite) suite.kill();
  if (server) server.kill();
};
process.on('SIGINT', onInterrupt);

const freePort = () => new Promise((resolve, reject) => {
  const listener = createServer();
  listener.once('error', reject);
  listener.listen(0, () => {
    const port = listener.address().port;
    listener.close((err) => err ? reject(err) : resolve(port));
  });
});

// Attach exit/error listeners immediately so a quickly exiting child cannot be missed.
const startChild = (args, options) => {
  const child = spawn(process.execPath, args, options);
  child.done = new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  return child;
};

const stopServer = async () => {
  if (!server) return;
  const child = server;
  server = undefined;
  if (child.exitCode === null && child.signalCode === null) child.kill();
  await child.done;
};

const startServer = async (port, env) => {
  if (interrupted) throw new Error('Interrupted');
  server = startChild([join(repo, 'dist', 'index.js')], { cwd: tempDir, env, stdio: 'inherit' });
  let exited = false;
  server.done.then(() => { exited = true; });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !exited && !interrupted) {
    try {
      await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1000) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(interrupted ? 'Interrupted' : exited ? 'Server exited before becoming ready' : 'Server did not become ready within 15 seconds');
};

const runSuite = async (name, file, args = [], options = {}) => {
  if (interrupted) return;
  console.log(`\nRunning ${name}`);
  let output = '';
  suite = startChild([join(repo, 'tests', file), ...args], {
    cwd: options.cwd ?? repo,
    stdio: options.capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
  });
  const child = suite;
  let outputClosed;
  if (options.capture) {
    outputClosed = new Promise((resolve) => child.stdout.once('close', resolve));
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      process.stdout.write(chunk);
    });
  }
  const result = await child.done;
  // Captured stdout can still be draining when the process emits exit.
  if (outputClosed) await outputClosed;
  suite = undefined;
  if (result.error) console.error(`${name}: ${result.error.message}`);
  if (result.code === 0 && !interrupted) {
    if (options.capture) {
      try {
        const lines = output.trim().split(/\r?\n/);
        if (lines.length !== 1) throw new Error('Expected one JSON line');
        JSON.parse(lines[0]);
        results.set(name, 'PASS');
        return lines[0];
      } catch (error) {
        console.error(`${name}: ${error.message}`);
      }
    } else {
      results.set(name, 'PASS');
    }
  }
};

try {
  tempDir = await mkdtemp(join(tmpdir(), 'legendary-tests-'));
  const roomsDir = join(tempDir, 'rooms');
  const env = {
    ...process.env,
    LEGENDARY_FRONTENDDIR: join(repo, 'Legion'),
    LEGENDARY_ASSETSDIR: join(repo, 'assets'),
    LEGENDARY_ASSETSOVERRIDEDIR: join(tempDir, 'assets-override'),
    LEGENDARY_SESSIONSPATH: join(tempDir, 'sessions.json'),
    LEGENDARY_ACCOUNTSPATH: join(tempDir, 'accounts.json'),
    LEGENDARY_ROOMSDIR: roomsDir,
  };
  delete env.LEGENDARY_MULTIROOM;
  delete env.LEGENDARY_SERVERADMINS;
  delete env.LEGENDARY_SIGNUPRATELIMIT;

  if (!existsSync(join(repo, 'Legion', 'index.html'))) results.set('e2e-legion', 'SKIP (Legion build missing)');
  try {
    const port = await freePort();
    await startServer(port, { ...env, LEGENDARY_PORT: String(port) });
    await runSuite('smoke', 'smoke.mjs', [String(port)]);
    if (results.get('e2e-legion') !== 'SKIP (Legion build missing)') {
      await runSuite('e2e-legion', 'e2e-legion.mjs', [String(port)]);
    }
  } catch (error) {
    console.error(`Stage A: ${error.message}`);
  } finally {
    await stopServer();
  }

  try {
    const port = await freePort();
    const hostedEnv = { ...env, LEGENDARY_PORT: String(port), LEGENDARY_MULTIROOM: 'true', LEGENDARY_SERVERADMINS: 'opsadmin', LEGENDARY_SIGNUPRATELIMIT: '50' };
    await startServer(port, hostedEnv);
    const args = [String(port), roomsDir];
    await runSuite('rooms-auth', 'rooms-auth.mjs', args);
    await runSuite('rooms-api', 'rooms-api.mjs', args);
    await runSuite('bank', 'bank.mjs', args);
    const saved = await runSuite('rooms-auth persist-create', 'rooms-auth.mjs', [...args, 'persist-create'], { capture: true });
    await stopServer();
    if (saved && !interrupted) {
      await startServer(port, hostedEnv);
      await runSuite('rooms-auth persist-verify', 'rooms-auth.mjs', [...args, 'persist-verify', saved]);
    }
  } catch (error) {
    console.error(`Stage B: ${error.message}`);
  } finally {
    await stopServer();
  }

  if (!interrupted) {
    const port = await freePort();
    const unsafe = startChild([join(repo, 'dist', 'index.js')], {
      cwd: tempDir, env: { ...env, LEGENDARY_PORT: String(port), LEGENDARY_TRUSTPROXY: 'true' }, stdio: 'ignore',
    });
    const result = await Promise.race([unsafe.done, new Promise((resolve) => setTimeout(() => resolve(null), 5000))]);
    if (!result) { unsafe.kill(); await unsafe.done; }
    if (result && typeof result.code === 'number' && result.code !== 0) results.set('unsafe trust proxy', 'PASS');
  }

  try {
    const port = await freePort();
    await startServer(port, {
      ...env, LEGENDARY_PORT: String(port), LEGENDARY_MULTIROOM: 'true',
      LEGENDARY_TRUSTPROXY: 'loopback', LEGENDARY_MAXSOCKETSPERIP: '3',
      LEGENDARY_ROOMMEDIAQUOTABYTES: '2000', LEGENDARY_ROOMIDLETTLSECONDS: '3',
      LEGENDARY_ROOMMAXTTLSECONDS: '8', LEGENDARY_ROOMSWEEPINTERVALSECONDS: '1',
      LEGENDARY_ROOMEXPIRYWARNINGSECONDS: '2', LEGENDARY_ROOMJOINRATELIMIT: '2',
      LEGENDARY_LOGINRATELIMIT: '2',
    });
    await runSuite('limits', 'limits.mjs', [String(port), roomsDir]);
  } catch (error) {
    console.error(`Stage D: ${error.message}`);
  } finally {
    await stopServer();
  }

  try {
    const port = await freePort();
    await startServer(port, { ...env, LEGENDARY_PORT: String(port), LEGENDARY_MULTIROOM: 'true', LEGENDARY_MAXSPECTATORSPERROOM: '2', LEGENDARY_SIGNUPRATELIMIT: '50' });
    await runSuite('room-features', 'room-features.mjs', [String(port), roomsDir]);
  } catch (error) {
    console.error(`Room features: ${error.message}`);
  } finally {
    await stopServer();
  }

  if (!interrupted) {
    const sandbox = join(tempDir, 'isolation');
    await mkdir(sandbox);
    await runSuite('rooms-isolation', 'rooms-isolation.mjs', [], { cwd: sandbox });
  }
} catch (error) {
  console.error(`Test runner: ${error.message}`);
} finally {
  await stopServer();
  if (tempDir) {
    try { await rm(tempDir, { recursive: true, force: true }); }
    catch (error) { console.error(`Could not remove temporary directory: ${error.message}`); process.exitCode = 1; }
  }
  process.off('SIGINT', onInterrupt);
  for (const [name, result] of results) console.log(`${result}  ${name}`);
  if (interrupted || [...results.values()].includes('FAIL')) process.exitCode = 1;
}
