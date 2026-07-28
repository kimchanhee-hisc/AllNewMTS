import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [platform, ...args] = process.argv.slice(2);
assert.ok(platform === 'ios' || platform === 'android', 'usage: npm run lab:xmf -- ios|android [Expo arguments]');
const result = spawnSync(path.join(root, 'node_modules/.bin/expo'), [`run:${platform}`, ...args], {
  cwd: path.join(root, 'apps/labs/xmf-runtime'),
  env: process.env,
  stdio: 'inherit',
});
assert.equal(result.error, undefined, `Expo could not start: ${result.error?.message}`);
process.exitCode = result.status ?? 1;
