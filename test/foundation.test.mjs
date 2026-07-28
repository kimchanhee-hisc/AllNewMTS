import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  loadManifest,
  policyViolations,
  safeRepoFile,
  validateSchema,
  verifyCommands,
  verifyContractInventories,
  verifySuites,
  verifyVerifierPaths
} from '../scripts/verify-foundation.mjs';

const json = (file) => JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
const emptyPackage = { dependencies: {}, devDependencies: {}, scripts: {} };

test('manifest, command, inventory, and repository paths fail closed', () => {
  const manifest = loadManifest();
  validateSchema(json('verification/manifest.schema.json'), manifest);
  verifySuites(manifest);
  verifyCommands(manifest, json('package.json'));
  assert.ok(manifest.suites.fast.checks.includes('unit'));
  assert.ok(manifest.suites.ci.checks.includes('ui'));
  assert.ok(['development-runners', 'ctlimage', 'control-modules', 'provenance'].every((id) => !manifest.suites.ci.checks.includes(id)));

  for (const mutate of [
    (copy) => { copy.suites.fast.checks = []; },
    (copy) => { copy.suites.fast.checks = ['missing']; },
    (copy) => copy.suites.fast.checks.push(copy.suites.fast.checks[0])
  ]) {
    const hostile = structuredClone(manifest);
    mutate(hostile);
    assert.throws(() => {
      validateSchema(json('verification/manifest.schema.json'), hostile);
      verifySuites(hostile);
    });
  }

  const driftedPackage = json('package.json');
  driftedPackage.scripts['verify:policy'] = 'node -e "process.exit(0)"';
  assert.throws(() => verifyCommands(manifest, driftedPackage));

  const verifierSources = new Map(manifest.checks
    .flatMap(({ argv }) => argv.filter((argument) => /^scripts\/.+\.mjs$/.test(argument)))
    .map((file) => [file, fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')]));
  verifyVerifierPaths(manifest, (file) => verifierSources.get(file));
  verifierSources.set('scripts/verify-native.mjs', verifierSources.get('scripts/verify-native.mjs')
    .replace('android/src/verification/java/com/allnewmts/lua/AllNewMTSLuaModule.kt', 'android/src/main/java/com/allnewmts/lua/AllNewMTSLuaModule.kt'));
  assert.throws(() => verifyVerifierPaths(manifest, (file) => verifierSources.get(file)));

  const controls = json('contracts/control-registry.json');
  const extra = structuredClone(controls.controls[0]);
  Object.assign(extra, { id: 'unapproved', normalizedType: 'Unapproved', sourceTags: ['UNAPPROVED'] });
  controls.controls.push(extra);
  assert.throws(() => verifyContractInventories(json('contracts/host-api.json'), controls));

  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'foundation-path-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'foundation-outside-'));
  try {
    fs.writeFileSync(path.join(base, 'regular.txt'), 'ok');
    fs.writeFileSync(path.join(outside, 'outside.txt'), 'outside');
    fs.symlinkSync(path.join(outside, 'outside.txt'), path.join(base, 'link.txt'));
    assert.equal(safeRepoFile('regular.txt', 'test', base), fs.realpathSync.native(path.join(base, 'regular.txt')));
    for (const file of ['../outside.txt', 'C:/outside.txt', 'C:drive.txt', 'link.txt']) {
      assert.throws(() => safeRepoFile(file, 'test', base));
    }
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('runtime result schema rejects overflow and impossible lifecycle output', () => {
  const resultSchema = json('contracts/runtime-result.schema.json');
  const sample = {
    schemaVersion: 1,
    snapshot: { runtimeId: '1', revision: '1', status: 'ok', event: 'Noop', lifecycle: 'OPEN', state: { controls: {}, data: {} } },
    commands: [{ type: 'toast', kind: 0, message: 'ok', duration: 1 }],
    diagnostics: []
  };
  validateSchema(resultSchema, sample);
  const uint64Max = '18446744073709551615';
  const uint64Overflow = '18446744073709551616';
  const maximal = structuredClone(sample);
  maximal.snapshot.runtimeId = uint64Max;
  maximal.snapshot.revision = uint64Max;
  maximal.snapshot.state.data.key = { transaction: 'T', block: 'B', field: 'F', index: uint64Max, value: 1 };
  maximal.commands = [{
    type: 'requestTranData', runtimeId: uint64Max, requestToken: uint64Max, tranId: 'T',
    blocks: [{ block: 'B', index: uint64Max, values: {} }]
  }];
  validateSchema(resultSchema, maximal);
  for (const mutate of [
    (copy) => { copy.snapshot.runtimeId = uint64Overflow; },
    (copy) => { copy.snapshot.revision = uint64Overflow; },
    (copy) => { copy.snapshot.state.data.key.index = uint64Overflow; },
    (copy) => { copy.commands[0].requestToken = uint64Overflow; },
    (copy) => { copy.commands[0].blocks[0].index = uint64Overflow; }
  ]) {
    const overflow = structuredClone(maximal);
    mutate(overflow);
    assert.throws(() => validateSchema(resultSchema, overflow));
  }

  const openClosing = structuredClone(sample);
  openClosing.commands = [];
  openClosing.nextLifecycle = 'CLOSING';
  validateSchema(resultSchema, openClosing);
  assert.equal(resultSchema.$defs.closingCommandsFinal.oneOf.length, 1024);
  resultSchema.$defs.closingCommandsFinal.oneOf.forEach((branch, index) => {
    const length = index + 1;
    assert.equal(branch.minItems, length);
    assert.equal(branch.maxItems, length);
    assert.equal(branch.items, false);
    assert.equal(branch.prefixItems.length, length);
    assert.ok(branch.prefixItems.slice(0, -1).every((item) => item === true));
    assert.deepEqual(branch.prefixItems.at(-1), { $ref: '#/$defs/closeFormCommand' });
  });
  const closed = structuredClone(sample);
  closed.snapshot.event = 'Form_OnFormClose';
  closed.snapshot.lifecycle = 'CLOSING';
  closed.nextLifecycle = 'CLOSED';
  closed.commands.push({ type: 'closeForm' });
  validateSchema(resultSchema, closed);
  const closedAtCap = structuredClone(closed);
  closedAtCap.commands = [...Array.from({ length: 1023 }, () => structuredClone(sample.commands[0])), { type: 'closeForm' }];
  validateSchema(resultSchema, closedAtCap);
  const closedOverCap = structuredClone(closedAtCap);
  closedOverCap.commands.unshift(structuredClone(sample.commands[0]));
  assert.throws(() => validateSchema(resultSchema, closedOverCap));
  const failed = structuredClone(sample);
  failed.snapshot.status = 'error';
  failed.nextLifecycle = 'INVALID';
  failed.commands = [{ type: 'runtimeError', code: 'RESOURCE_LIMIT' }];
  failed.diagnostics = [{ code: 'RESOURCE_LIMIT', source: 'supervisor', event: 'Noop' }];
  validateSchema(resultSchema, failed);
  const failedClosing = structuredClone(failed);
  failedClosing.snapshot.event = 'Form_OnFormClose';
  failedClosing.snapshot.lifecycle = 'CLOSING';
  failedClosing.commands.push({ type: 'closeForm' });
  validateSchema(resultSchema, failedClosing);
  for (const impossible of [
    { ...structuredClone(sample), nextLifecycle: 'INVALID' },
    { ...structuredClone(sample), snapshot: { ...structuredClone(sample.snapshot), status: 'error' } },
    { ...structuredClone(closed), nextLifecycle: 'CLOSING' },
    { ...structuredClone(closed), snapshot: { ...structuredClone(closed.snapshot), event: 'Noop' } },
    { ...structuredClone(closed), commands: [sample.commands[0]] },
    { ...structuredClone(closed), commands: [{ type: 'closeForm' }, structuredClone(sample.commands[0])] },
    { ...structuredClone(failed), commands: [] },
    { ...structuredClone(failed), diagnostics: [] },
    { ...structuredClone(failed), commands: [...failed.commands, { type: 'runtimeError', code: 'RESOURCE_LIMIT' }] },
    { ...structuredClone(failedClosing), snapshot: { ...structuredClone(failedClosing.snapshot), event: 'Noop' } },
    { ...structuredClone(failedClosing), commands: [...failedClosing.commands].reverse() }
  ]) assert.throws(() => validateSchema(resultSchema, impossible));
  assert.throws(() => validateSchema(resultSchema, { ...sample, commands: [{ ...sample.commands[0], undeclaredSemanticField: true }] }));
  assert.throws(() => validateSchema(resultSchema, { ...sample, commands: Array.from({ length: 1025 }, () => sample.commands[0]) }));
  assert.throws(() => validateSchema(resultSchema, { ...sample, diagnostics: [{ code: 'RESOURCE_LIMIT', source: 'runtime', event: 'x'.repeat(65537) }] }));
  const malformedControl = structuredClone(sample);
  malformedControl.snapshot.state.controls.Input = { type: 'Edit', properties: { caption: 'ok', writable: true } };
  assert.throws(() => validateSchema(resultSchema, malformedControl));
  const malformedData = structuredClone(sample);
  malformedData.snapshot.state.data.key = { transaction: 'T', block: 'B', field: 'F', index: '0', value: true };
  assert.throws(() => validateSchema(resultSchema, malformedData));
  const validState = structuredClone(sample);
  validState.snapshot.state.controls.Action = { type: 'Button', properties: { border: 'none', dfgcolor: 'black', enabled: false } };
  validState.snapshot.state.data.key = { transaction: 'T', block: 'B', field: 'F', index: '0', value: 1 };
  validateSchema(resultSchema, validState);
});

test('policy rejects product CDN mutation without globally banning non-CDN remote work', () => {
  const host = json('contracts/host-api.json');
  const controls = json('contracts/control-registry.json');
  const prohibitedScheme = ['s', 'f', 't', 'p', ':', '//cdn.example.invalid/item'].join('');
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
    { file: 'modules/a/AndroidManifest.xml', text: `<endpoint value="${prohibitedScheme}example.invalid"/>` },
    { file: 'modules/a/runtime.json', text: '{"cdnClient":"purge"}' }
  ];
  const violations = policyViolations(probes, emptyPackage, host, controls);
  for (const { file } of probes) assert.ok(violations.some((violation) => violation.startsWith(`${file}:`)), `missed ${file}`);

  const cdnMutations = [
    { file: 'src/fetch-variable.ts', text: 'fetch(cdnUrl, { method: "DELETE" });' },
    { file: 'src/fetch-literal.ts', text: 'fetch("https://cdn.invalid/x", { method: "DELETE" });' },
    { file: 'src/axios-delete.ts', text: 'axios.delete(cdnUrl);' },
    { file: 'src/options-method-first.ts', text: 'axios.request({ method: "DELETE", url: cdnUrl });' },
    { file: 'src/options-target-first.ts', text: 'axios.request({ url: cdnUrl, method: "DELETE" });' }
  ];
  const cdnViolations = policyViolations(cdnMutations, emptyPackage, host, controls);
  for (const { file } of cdnMutations) assert.ok(cdnViolations.some((violation) => violation.startsWith(`${file}:`)), `missed ${file}`);
  assert.deepEqual(policyViolations([
    { file: 'src/cdn-read.ts', text: 'fetch(cdnUrl, { method: "GET" }); fetch(cdnUrl, { method: "HEAD" }); axios.get(cdnUrl);' },
    { file: 'src/non-cdn-delete.ts', text: 'fetch(apiUrl, { method: "DELETE" }); axios.delete(apiUrl);' }
  ], emptyPackage, host, controls), []);

  const falsePositive = policyViolations([
    { file: 'src/comments.ts', text: '// Platform.OS and if (screenId) are documentation\nconst note = "Platform.select";' }
  ], emptyPackage, host, controls);
  assert.deepEqual(falsePositive, []);

  const commentOnly = [
    { file: 'modules/comments/CMakeLists.txt', text: '# cdnClient.purge()\n#[[\ncdnClient.purge()\n]]\nset(SAFE ON)' },
    { file: 'modules/comments/build.gradle', text: `// cdnClient.purge()\n/* ${remoteSync} */\ntask safe` },
    { file: 'modules/comments/a.podspec', text: '# cdnClient.purge()\nname = "safe"' },
    { file: 'modules/comments/ruby-block.podspec', text: '  =begin\ncdnClient.purge()\n  =end\nname = "safe"' },
    { file: 'modules/comments/project.pbxproj', text: '/* cdnClient.purge() */\nSAFE = YES;' },
    { file: 'modules/comments/runtime.xcconfig', text: `// ${remoteSync}\nSAFE = YES` },
    { file: 'modules/comments/runtime.properties', text: '  ! cdnClient.purge()\n  # purgeCdn()\nsafe=true' }
  ];
  assert.deepEqual(policyViolations(commentOnly, emptyPackage, host, controls), []);
  const executableConfig = [
    { file: 'modules/live/CMakeLists.txt', text: 'set(COMMAND "cdnClient.purge()")' },
    { file: 'modules/live/build.gradle', text: 'task mutate { cdnClient.purge() }' },
    { file: 'modules/live/runtime.xcconfig', text: 'COMMAND = purgeCdn()' },
    { file: 'modules/live/a.podspec', text: 'cdnClient.purge()' },
    { file: 'modules/live/runtime.properties', text: 'command=cdnClient.purge()' }
  ];
  const executableViolations = policyViolations(executableConfig, emptyPackage, host, controls);
  for (const { file } of executableConfig) assert.ok(executableViolations.some((violation) => violation.startsWith(`${file}:`)), `missed ${file}`);

  assert.match(policyViolations([], { ...emptyPackage, dependencies: { MVigsEngine: '0.0.0' } }, host, controls)[0], /forbidden dependency/);
  for (const dependency of ['react-native-lua', 'basic-ftp', 'ssh2-sftp-client', 'ws']) {
    assert.deepEqual(policyViolations([], { ...emptyPackage, dependencies: { [dependency]: '1.0.0' } }, host, controls), []);
  }
  for (const command of [remoteSync, remoteCopy, ['eas', ' update'].join('')]) {
    assert.deepEqual(policyViolations([], { ...emptyPackage, scripts: { ship: command } }, host, controls), []);
  }
  assert.match(policyViolations([], { ...emptyPackage, scripts: { ship: remoteCurl } }, host, controls)[0], /product CDN/);
  assert.deepEqual(policyViolations([], { ...emptyPackage, scripts: { bootstrap: 'npm ci --ignore-scripts', lookup: 'curl --head https://cdn.invalid/item', transfer: 'sftp://files.example.invalid/item' } }, host, controls), []);
});
