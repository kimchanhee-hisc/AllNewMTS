import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  deferredMilestoneLayers,
  expectedIntegrityPaths,
  loadManifest,
  policyViolations,
  safeRepoFile,
  storyChecks,
  validateSchema,
  verifyContractInventories,
  verifyFocusedCommands,
  verifyStoryDefinitions
} from '../scripts/verify-foundation.mjs';

const json = (file) => JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
const emptyPackage = { dependencies: {}, devDependencies: {}, scripts: {} };

test('story, command, inventory, and path contracts fail closed', () => {
  const manifest = loadManifest();
  const schema = json('verification/manifest.schema.json');
  validateSchema(schema, manifest);
  assert.deepEqual(storyChecks('G001A-establish-ai-native-foundation', manifest).checks, [
    'format', 'docs', 'policy', 'type', 'unit', 'fixtures', 'provenance'
  ]);
  assert.deepEqual(deferredMilestoneLayers(manifest).map(({ id }) => id), ['native', 'runtime', 'ui', 'package']);
  assert.deepEqual(manifest.integrity.map(({ path: file }) => file).sort(), [...expectedIntegrityPaths].sort());

  const activeEmpty = structuredClone(manifest);
  activeEmpty.stories.find(({ id }) => id.startsWith('G003-')).activation = 'active';
  assert.throws(() => validateSchema(schema, activeEmpty));
  assert.throws(() => verifyStoryDefinitions(activeEmpty));
  assert.throws(() => storyChecks(activeEmpty.stories.find(({ id }) => id.startsWith('G003-')).id, activeEmpty));
  const escapedManifest = structuredClone(manifest);
  escapedManifest.canonicalOwners[0].path = '../outside.md';
  assert.throws(() => validateSchema(schema, escapedManifest));

  for (const mutate of [
    (copy) => copy.stories[0].checks.push(copy.stories[0].checks[0]),
    (copy) => copy.stories[0].checks.push('missing'),
    (copy) => { copy.focusedChecks.find(({ id }) => id === 'format').activation = 'deferred'; },
    (copy) => { copy.focusedChecks.find(({ id }) => id === 'format').owner = 'G999-wrong-owner'; }
  ]) {
    const hostile = structuredClone(manifest);
    mutate(hostile);
    assert.throws(() => verifyStoryDefinitions(hostile));
  }

  const driftedPackage = json('package.json');
  driftedPackage.scripts['verify:policy'] = 'node -e "process.exit(0)"';
  assert.throws(() => verifyFocusedCommands(manifest, driftedPackage));

  const controls = json('contracts/control-registry.json');
  const extra = structuredClone(controls.controls[0]);
  Object.assign(extra, { id: 'unapproved', normalizedType: 'Unapproved', sourceTags: ['UNAPPROVED'] });
  controls.controls.push(extra);
  assert.throws(() => verifyContractInventories(json('contracts/host-api.json'), controls));

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'foundation-path-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'foundation-outside-'));
  fs.writeFileSync(path.join(temp, 'regular.txt'), 'ok');
  fs.writeFileSync(path.join(outside, 'outside.txt'), 'outside');
  fs.symlinkSync(path.join(outside, 'outside.txt'), path.join(temp, 'link.txt'));
  assert.equal(safeRepoFile('regular.txt', 'test', temp), fs.realpathSync.native(path.join(temp, 'regular.txt')));
  assert.throws(() => safeRepoFile('../outside.txt', 'test', temp));
  assert.throws(() => safeRepoFile('link.txt', 'test', temp));
  fs.rmSync(temp, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
  assert.throws(() => storyChecks('G999-unknown', manifest));
});

test('policy rejects syntax, artifacts, native config, protocols, and remote mutation', () => {
  const host = json('contracts/host-api.json');
  const controls = json('contracts/control-registry.json');
  const prohibitedScheme = ['s', 'f', 't', 'p', ':', '//'].join('');
  const prohibitedEnginePath = ['legacy', '-', 'engine'].join('');
  const remoteSync = ['r', 'sync -a dist/ user@example:/srv'].join('');
  const remoteCopy = ['s', 'cp dist/app user@example:/srv'].join('');
  const remoteCurl = ['curl https://cdn.invalid/item ', '-X DELETE'].join('');
  const probes = [
    { file: 'src/os.ts', text: 'if (Platform["OS"]) chooseHost();' },
    { file: 'src/ternary.ts', text: 'const selected = screenId ? one : two;' },
    { file: 'src/handlers.ts', text: 'screenHandlers[screenId]();' },
    { file: 'src/registry.ts', text: 'addScreen("A", component);' },
    { file: 'src/cdn-object.ts', text: 'cdnClient.purge();' },
    { file: 'src/cdn-prefix.ts', text: 'purgeCdn();' },
    { file: 'src/cdn-suffix.ts', text: 'deleteFromCdn();' },
    { file: 'src/host.ts', text: 'Host.NotDeclared();' },
    { file: 'src/control.ts', text: 'registerControl("NotDeclared");' },
    { file: `test/${prohibitedEnginePath}-evidence.txt`, text: '' },
    { file: 'modules/a/CMakeLists.txt', text: `set(ENGINE "${prohibitedEnginePath}")` },
    { file: 'modules/a/ios/a.podspec', text: `dependency '${prohibitedEnginePath}'` },
    { file: 'modules/a/android/build.gradle', text: `implementation '${prohibitedEnginePath}'` },
    { file: 'modules/a/ios/project.pbxproj', text: `LIBRARY = ${prohibitedEnginePath}` },
    { file: 'modules/a/ios/runtime.xcconfig', text: remoteSync },
    { file: 'modules/a/AndroidManifest.xml', text: `<endpoint value="${prohibitedScheme}example.invalid"/>` },
    { file: 'modules/a/runtime.json', text: '{"cdnClient":"purge"}' }
  ];
  const violations = policyViolations(probes, emptyPackage, host, controls);
  for (const { file } of probes) assert.ok(violations.some((violation) => violation.startsWith(`${file}:`)), `missed ${file}`);

  const falsePositive = policyViolations([
    { file: 'src/comments.ts', text: '// Platform.OS and if (screenId) are documentation\nconst note = "Platform.select";' }
  ], emptyPackage, host, controls);
  assert.deepEqual(falsePositive, []);

  for (const dependency of ['react-native-lua', 'basic-ftp', 'ssh2-sftp-client']) {
    assert.match(policyViolations([], { ...emptyPackage, dependencies: { [dependency]: '0.0.0' } }, host, controls)[0], /forbidden dependency/);
  }
  for (const command of [['eas', ' update'].join(''), remoteSync, remoteCopy, remoteCurl]) {
    assert.match(policyViolations([], { ...emptyPackage, scripts: { ship: command } }, host, controls)[0], /prohibited remote/);
  }
  assert.deepEqual(policyViolations([], { ...emptyPackage, scripts: { bootstrap: 'npm ci --ignore-scripts', lookup: 'curl --head https://cdn.invalid/item' } }, host, controls), []);
});
