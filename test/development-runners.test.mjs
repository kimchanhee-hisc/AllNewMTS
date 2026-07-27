import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const uiRunner = path.join(root, 'scripts/run-ui-development-build.mjs');

function runJson(file, args, prefix, timeout) {
  const result = spawnSync(process.execPath, [file, ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout
  });
  assert.equal(result.error, undefined, `${args.join(' ')} could not run: ${result.error?.message}`);
  assert.equal(result.status, 0, `${args.join(' ')} failed:\n${result.stdout}${result.stderr}`);
  const line = result.stdout.split(/\r?\n/).find((value) => value.startsWith(prefix));
  assert.ok(line, `${args.join(' ')} emitted no ${prefix} record`);
  return JSON.parse(line.slice(prefix.length));
}

test('optional UI runner self-checks pass without changing tracked files', () => {
  const status = () => {
    const result = spawnSync('git', ['status', '--porcelain=v1', '-z'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const before = status();
  const modes = [
    ['--network-regression', 45_000],
    ['--pod-cache-regression', 45_000],
    ['--metro-evidence-regression', 30_000],
    ['--simulator-cleanup-regression', 30_000],
    ['--nested-swiftpm-regression', 90_000]
  ];
  for (const [mode, timeout] of modes) {
    const evidence = runJson(uiRunner, [mode], 'UI_DEVELOPMENT_BUILD=', timeout);
    assert.deepEqual([evidence.status, evidence.mode], ['PASS', mode.slice(2)]);
  }
  assert.equal(status(), before);
});

test('optional runner failure forwarding remains bounded', () => {
  const evidence = runJson(
    path.join(root, 'scripts/verify-ui.mjs'),
    ['--build-failure-forwarding-regression'],
    'UI_BUILD_FAILURE_FORWARDING_REGRESSION=',
    30_000
  );
  assert.equal(evidence.status, 'PASS');
  assert.equal(evidence.validMarkersForwarded, 1);
});

test('installed ExpoModulesCore compatibility patch is current', () => {
  const patcher = path.join(root, 'scripts/patch-expo-modules-core.mjs');
  const result = spawnSync(process.execPath, [patcher, '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});
