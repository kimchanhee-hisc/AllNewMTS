import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [platform, ...args] = process.argv.slice(2);
const port = 47_231;
const marker = 'ALLNEWMTS_NETWORKING_LOOPBACK_V1';
assert.ok(platform === 'ios' || platform === 'android', 'usage: npm run lab:networking -- ios|android [Expo arguments]');

const server = http.createServer((request, response) => {
  if (request.method !== 'GET' || request.url !== '/') {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(marker),
    'Content-Type': 'text/plain; charset=utf-8',
  });
  response.end(marker);
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, '127.0.0.1', resolve);
});

let reversed = false;
let child;
const cleanup = () => {
  if (reversed) spawnSync('adb', ['reverse', '--remove', `tcp:${port}`], { stdio: 'ignore' });
  server.close();
};

try {
  if (platform === 'android') {
    const devices = spawnSync('adb', ['devices'], { encoding: 'utf8' });
    assert.equal(devices.status, 0, 'adb is required for the Android Networking Lab');
    const ready = devices.stdout.split('\n').filter((line) => /\tdevice$/.test(line));
    assert.equal(ready.length, 1, 'start exactly one Android device before the Networking Lab');
    assert.equal(spawnSync('adb', ['reverse', `tcp:${port}`, `tcp:${port}`]).status, 0, 'adb reverse failed');
    reversed = true;
  }
  child = spawn(path.join(root, 'node_modules/.bin/expo'), [`run:${platform}`, ...args], {
    cwd: path.join(root, 'apps/labs/networking'),
    env: {
      ...process.env,
      EXPO_PUBLIC_ALLNEWMTS_NETWORKING_LOOPBACK_PORT: String(port),
    },
    stdio: 'inherit',
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child?.kill(signal));
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (value) => resolve(value ?? 1));
  });
  process.exitCode = code;
} finally {
  cleanup();
}
