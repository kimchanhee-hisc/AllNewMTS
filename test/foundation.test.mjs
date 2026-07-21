import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  deferredMilestoneLayers,
  expectedIntegrityPaths,
  loadManifest,
  policyViolations,
  safeRepoFile,
  storyChecks,
  validateSchema,
  verifyActiveVerifierPaths,
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
  assert.deepEqual(storyChecks('G002-embed-official-lua-5-1-5', manifest).checks, ['native']);
  assert.deepEqual(storyChecks('G003-implement-bounded-native-runtime', manifest).checks, ['runtime']);
  assert.deepEqual(storyChecks('G004-build-generic-xmf-ui-path', manifest).checks, ['ui']);
  assert.deepEqual(deferredMilestoneLayers(manifest).map(({ id }) => id), ['package']);
  assert.deepEqual(manifest.integrity.map(({ path: file }) => file).sort(), [...expectedIntegrityPaths].sort());
  const g004AcceptanceFiles = [
    'scripts/generate-g004-assets.mjs',
    'scripts/run-g004-development-build.mjs',
    'scripts/verify-ui.mjs',
    'test/g004/g003-baseline.json',
    'test/g004/runtime-client-golden.json'
  ];
  assert.ok(g004AcceptanceFiles.every((file) => manifest.integrity.some((entry) => entry.path === file)), 'active G004 acceptance files must be integrity-pinned');

  const activeEmpty = structuredClone(manifest);
  activeEmpty.stories.find(({ id }) => id.startsWith('G004-')).checks = [];
  assert.throws(() => validateSchema(schema, activeEmpty));
  assert.throws(() => verifyStoryDefinitions(activeEmpty));
  assert.throws(() => storyChecks(activeEmpty.stories.find(({ id }) => id.startsWith('G004-')).id, activeEmpty));
  for (const mutate of [
    (copy) => { copy.stories.find(({ id }) => id.startsWith('G004-')).checks = ['missing']; },
    (copy) => { copy.focusedChecks.find(({ id }) => id === 'ui').owner = 'G999-wrong-owner'; }
  ]) {
    const hostile = structuredClone(manifest);
    mutate(hostile);
    assert.throws(() => verifyStoryDefinitions(hostile));
  }
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
  const driftedUiPackage = json('package.json');
  driftedUiPackage.scripts['verify:ui'] = 'node -e "process.exit(0)"';
  assert.throws(() => verifyFocusedCommands(manifest, driftedUiPackage));

  const verifierSources = new Map(manifest.focusedChecks
    .filter(({ activation }) => activation === 'active')
    .flatMap(({ argv }) => argv.filter((argument) => /^scripts\/.+\.mjs$/.test(argument)))
    .map((file) => [file, fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')]));
  verifyActiveVerifierPaths(manifest, (file) => verifierSources.get(file));
  verifierSources.set('scripts/verify-native.mjs', verifierSources.get('scripts/verify-native.mjs')
    .replace('android/src/g002/java/com/allnewmts/lua/AllNewMTSLuaModule.kt', 'android/src/main/java/com/allnewmts/lua/AllNewMTSLuaModule.kt'));
  assert.throws(() => verifyActiveVerifierPaths(manifest, (file) => verifierSources.get(file)));

  const controls = json('contracts/control-registry.json');
  const extra = structuredClone(controls.controls[0]);
  Object.assign(extra, { id: 'unapproved', normalizedType: 'Unapproved', sourceTags: ['UNAPPROVED'] });
  controls.controls.push(extra);
  assert.throws(() => verifyContractInventories(json('contracts/host-api.json'), controls));
  for (const position of ['before', 'after']) {
    const duplicate = json('contracts/control-registry.json');
    const deferred = structuredClone(duplicate.controls.at(-1));
    Object.assign(deferred, { id: `duplicate-${position}`, semanticFamilies: [`Deferred${position}`] });
    if (position === 'before') duplicate.controls.splice(duplicate.controls.length - 1, 0, deferred);
    else duplicate.controls.push(deferred);
    assert.throws(() => verifyContractInventories(json('contracts/host-api.json'), duplicate));
  }

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'foundation-path-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'foundation-outside-'));
  fs.writeFileSync(path.join(temp, 'regular.txt'), 'ok');
  fs.writeFileSync(path.join(outside, 'outside.txt'), 'outside');
  fs.symlinkSync(path.join(outside, 'outside.txt'), path.join(temp, 'link.txt'));
  assert.equal(safeRepoFile('regular.txt', 'test', temp), fs.realpathSync.native(path.join(temp, 'regular.txt')));
  assert.throws(() => safeRepoFile('../outside.txt', 'test', temp));
  assert.throws(() => safeRepoFile('C:/outside.txt', 'test', temp));
  assert.throws(() => safeRepoFile('C:drive.txt', 'test', temp));
  assert.throws(() => safeRepoFile('link.txt', 'test', temp));
  fs.rmSync(temp, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
  assert.throws(() => storyChecks('G999-unknown', manifest));

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

test('native runner preserves primary failures and releases only owned Metro state', () => {
  const source = fs.readFileSync(new URL('../scripts/run-gate0-development-build.mjs', import.meta.url), 'utf8');
  assert.match(source, /const childIsLive = \(child\) => child\.exitCode === null && child\.signalCode === null/);
  assert.doesNotMatch(source, /process\.kill\(-child\.pid, 0\)/, 'ended or reused Metro process groups must not be probed');
  assert.match(source, /error\.code !== 'EPERM'.+childIsLive\(child\)\) child\.kill\(signal\)/s, 'group EPERM must fall back to the live direct child');
  assert.match(source, /probe\.listen\(port, '127\.0\.0\.1', resolve\)[\s\S]+probe\.close/, 'Metro cleanup must prove its dynamic port can be rebound and closed');
  assert.match(source, /catch \(error\) \{\s+primaryError = error;[\s\S]+primaryError\.cleanupErrors = cleanupErrors[\s\S]+throw primaryError;/, 'cleanup must attach secondary errors and rethrow the original primary object');
  assert.match(source, /else if \(cleanupErrors\.length\) \{\s+throw new AggregateError/, 'only cleanup-only failure may replace control flow with an aggregate');
});

test('G004 runner and verifier keep hostile evidence and cleanup fail-closed', () => {
  const integrityRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'g004-integrity-root-'));
  const integrityOutside = fs.mkdtempSync(path.join(os.tmpdir(), 'g004-integrity-outside-'));
  fs.writeFileSync(path.join(integrityRoot, 'approved.xmf_'), 'x');
  fs.writeFileSync(path.join(integrityOutside, 'outside.xmf_'), 'x');
  fs.symlinkSync(path.join(integrityOutside, 'outside.xmf_'), path.join(integrityRoot, 'link.xmf_'));
  assert.equal(safeRepoFile('approved.xmf_', 'G004 temp alias', integrityRoot), fs.realpathSync.native(path.join(integrityRoot, 'approved.xmf_')));
  assert.throws(() => safeRepoFile('../outside.xmf_', 'G004 traversal', integrityRoot));
  assert.throws(() => safeRepoFile(path.join(integrityOutside, 'outside.xmf_'), 'G004 absolute outside', integrityRoot));
  assert.throws(() => safeRepoFile('link.xmf_', 'G004 symlink outside', integrityRoot));
  fs.rmSync(integrityRoot, { recursive: true, force: true });
  fs.rmSync(integrityOutside, { recursive: true, force: true });

  const runner = fs.readFileSync(new URL('../scripts/run-g004-development-build.mjs', import.meta.url), 'utf8');
  assert.match(runner, /metro-owned-port\.sb/);
  assert.doesNotMatch(runner, /metro-loopback\.sb/);
  assert.match(runner, /const maximumSelectionAttempts = 3;/, 'port selection and truth-suite retry must be bounded to three whole attempts');
  assert.match(runner, /runner-selected[\s\S]+runner-guarded[\s\S]+Metro-owned/, 'runner must distinguish selected identity, loopback guard, and observed Metro ownership');
  assert.match(runner, /truthProbeTimeoutMs = 5000[\s\S]+SIGTERM[\s\S]+SIGKILL[\s\S]+activeProbes\.delete/, 'every truth child must be bounded, terminated, reaped, and removed');
  assert.match(runner, /external TCP[\s\S]+UDP[\s\S]+wrong port[\s\S]+deny-all build-network[\s\S]+same-port loopback[\s\S]+same-port wildcard[\s\S]+same-port active interface/, 'truth suite must cover every SBPL claim and interface limitation');
  assert.match(runner, /const wrongPort = port === 65535 \? port - 1 : port \+ 1;/, 'wrong-port truth must never alias the released selected port');
  assert.match(runner, /await portGuard\.release\(\);\s+metro = spawn\(/, 'the final guard release must be immediately followed by detached Expo spawn');
  assert.match(runner, /metro\.once\('error',[\s\S]+spawnError[\s\S]+metroPgid = metro\.pid[\s\S]+assert\.equal\(Number\(group\.stdout\.trim\(\)\), metroPgid/, 'detached spawn failures must be observed and cleanup-safe PGID ownership must be validated');
  assert.match(runner, /assertMetroOwned[\s\S]+lsof[\s\S]+127\.0\.0\.1[\s\S]+metroPgid/, 'Metro-owned must require exact listener and PGID attribution');
  assert.match(runner, /readinessNetwork[\s\S]+prelaunchNetwork[\s\S]+finalNetwork/, 'listener and connection checks must repeat at readiness, prelaunch, and final');
  assert.match(runner, /bounded unowned truth-probe and spawn handoffs[\s\S]+no uninterrupted exclusive ownership or SBPL interface-enforcement claim/, 'evidence must preserve both explicit non-claims');
  assert.match(runner, /function generatedMetroSettings[\s\S]+Target Support Files\/React-Core[\s\S]+endsWith\('\.xcconfig'\)[\s\S]+assertGeneratedMetroRecords/);
  assert.doesNotMatch(runner, /Pods\.xcodeproj\/project\.pbxproj/, 'generated Metro evidence must not inspect PBX serialization');
  assert.match(runner, /toolchainProvenance[\s\S]+xcode[\s\S]+swift[\s\S]+cocoaPods[\s\S]+jbr[\s\S]+androidNdk/);
  assert.match(runner, /requiredPaths[\s\S]+Info\.plist[\s\S]+hermesvm\.framework\/hermesvm[\s\S]+include\/hermes\/hermes\.h[\s\S]+ReactNativeDependencies\.framework\/ReactNativeDependencies[\s\S]+Headers\/folly\/String\.h[\s\S]+statSync\(file\)\.size > 0/, 'exact Pod caches must contain nonempty plist, simulator binary, and header files');
  assert.match(runner, /delete env\.REACT_NATIVE_OVERRIDE_HERMES_DIR;\s+delete env\.RCT_TESTONLY_RNCORE_TARBALL_PATH;\s+delete env\.RCT_DEPS_VERSION;\s+delete env\.RCT_TESTONLY_RNCORE_VERSION;\s+delete env\.USE_THIRD_PARTY_JSC;\s+delete env\.USE_HERMES;/, 'inherited source, version, and JS-engine overrides must not bypass verified cache inputs');
  assert.match(runner, /RCT_DEPS_VERSION: 'nightly'[\s\S]+RCT_TESTONLY_RNCORE_VERSION: 'nightly'[\s\S]+USE_THIRD_PARTY_JSC: '1'[\s\S]+USE_HERMES: '0'/, 'Pod regression must inject every hostile ambient version and JS-engine selector');
  assert.match(runner, /env\.RCT_USE_RN_DEP = '0';\s+env\.RCT_USE_PREBUILT_RNCORE = '0';\s+env\.EXPO_USE_PRECOMPILED_MODULES = '0';\s+env\.RCT_HERMES_V1_ENABLED = '1';\s+env\.HERMES_ENGINE_TARBALL_PATH[\s\S]+env\.RCT_USE_LOCAL_RN_DEP/, 'remote RN\/Expo artifact probes must be disabled and Hermes V1 selected before local cache tarballs are exposed');
  assert.match(runner, /dependencies_build_from_source[\s\S]+rncore_build_from_source[\s\S]+use_hermes[\s\S]+use_third_party_jsc[\s\S]+deny network\*[\s\S]+commandPath\('pod'\), 'ipc', 'spec'/, 'local upstream dependency and JS-engine selector branches must be probed without network or Pod installation');
  assert.match(runner, /function preflightSnapshot[\s\S]+status', '--porcelain=v1', '-z'[\s\S]+nativeDirectories[\s\S]+allnewmts-g004-[\s\S]+cacheFiles[\s\S]+createHash\('sha256'\)[\s\S]+if \(reservation\) await reservation\.release\(\);[\s\S]+assert\.deepEqual\(preflightSnapshot\(podCaches\), before[\s\S]+mutatedFiles: false/, 'read-only preflight evidence must derive from an after-release repository/temp/cache snapshot');
  assert.match(runner, /local tcp "localhost:\$\{port\}"[\s\S]+remote tcp "localhost:\$\{port\}"/, 'sandbox profile must use the supported exact localhost/port syntax');
  assert.doesNotMatch(runner, /(?:local|remote) tcp "127\.0\.0\.1:/, 'macOS sandbox network addresses cannot use a numeric host');
  assert.match(runner, /const attempt = async[\s\S]+primaryError\.cleanupErrors = cleanupErrors;\s+throwAfterBuildFailureEmission\(primaryError, cleanupErrors\);/);
  const markerChild = runner.match(/function buildFailureMarkerTransportChild\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(markerChild, /primaryError\.cleanupErrors = cleanupErrors;\s+throwAfterBuildFailureEmission\(primaryError, cleanupErrors\);/, 'private marker child must emit then immediately throw the same primary');
  assert.doesNotMatch(markerChild, /await|Promise|setTimeout|setInterval|process\.exit(?:Code)?/, 'private marker child must not add a drain or exit path');
  assert.match(runner, /function throwAfterBuildFailureEmission[\s\S]+emitBuildFailureEnvelope[\s\S]+cleanupErrors\.push\(error\)[\s\S]+throw primaryError;/, 'marker writer failure must remain secondary to the original Xcode primary');
  assert.match(runner, /if \(cleanupErrors\.length\) throw new AggregateError/);
  assert.match(runner, /const baseline = run[\s\S]+let temp;[\s\S]+try \{\s+temp = fs\.mkdtempSync[\s\S]+simulator = availableSimulator\(\);[\s\S]+selected = await selectGuardedPort\(temp, activeProbes\);/, 'temporary directory, simulator, and guarded port selection must be cleanup-owned');
  assert.match(runner, /net\.createServer[\s\S]+acceptedSockets\.add[\s\S]+socket\.once\('error'[\s\S]+server\.close[\s\S]+for \(const socket of acceptedSockets\) socket\.destroy/, 'the loopback guard must own accepted sockets and close them during bounded release');
  assert.match(runner, /let simulatorBootedByRunner = false;[\s\S]+if \(simulator\.state !== 'Booted'\) \{[\s\S]+simctl', 'boot'[\s\S]+simulatorBootedByRunner = true;[\s\S]+if \(simulatorBootedByRunner\)[\s\S]+simctl', 'shutdown'/, 'simulator shutdown must require a successful runner-owned boot');
  assert.match(runner, /if \(portGuard\) await portGuard\.release\(\)[\s\S]+for \(const probe of \[\.\.\.activeProbes\]\)[\s\S]+stopProbe[\s\S]+stopProcessGroup[\s\S]+closeFd[\s\S]+assertPortReusable[\s\S]+activeProbes\.size[\s\S]+if \(simulatorBootedByRunner\)[\s\S]+if \(temp\) fs\.rmSync/, 'cleanup must terminate remaining probes and close the guard, process group, FDs, port, simulator transition, and temporary root');

  const network = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/run-g004-development-build.mjs', import.meta.url)), '--network-regression'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    timeout: 30000
  });
  assert.equal(network.error, undefined, `G004 network regression could not run: ${network.error?.message}`);
  assert.equal(network.status, 0, `G004 network regression failed:\n${network.stdout}${network.stderr}`);
  const evidence = JSON.parse(network.stdout.trim().replace(/^G004_DEVELOPMENT_BUILD=/, ''));
  assert.equal(evidence.status, 'PASS');
  assert.equal(evidence.mode, 'network-regression');
  assert.equal(evidence.reservation.exactPortReusable, true);
  assert.ok(evidence.reservation.releaseMs < 500, `guard release took ${evidence.reservation.releaseMs}ms`);
  assert.equal(evidence.probesReaped, true);
  assert.equal(evidence.exactTruthPortReusable, true);
  assert.equal(evidence.truth.activeInterfaceCount, evidence.truth.activeInterfaces.length);

  const pods = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/run-g004-development-build.mjs', import.meta.url)), '--pod-cache-regression'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    timeout: 30000
  });
  assert.equal(pods.error, undefined, `G004 Pod cache regression could not run: ${pods.error?.message}`);
  assert.equal(pods.status, 0, `G004 Pod cache regression failed:\n${pods.stdout}${pods.stderr}`);
  const podEvidence = JSON.parse(pods.stdout.trim().replace(/^G004_DEVELOPMENT_BUILD=/, ''));
  assert.deepEqual(podEvidence, {
    status: 'PASS',
    mode: 'pod-cache-regression',
    exactVersionsMatched: true,
    hostileVersionRejected: true,
    hostileMissingContentRejected: true,
    localArtifactsPrepared: true,
    remoteArtifactProbesDisabled: true,
    ambientSelectorOverridesRemoved: true,
    selectorBranchesProven: true,
    cleaned: true
  });

  const verifier = fs.readFileSync(new URL('../scripts/verify-ui.mjs', import.meta.url), 'utf8');
  for (const phase of ['contract-registry', 'parser-model', 'projection-render', 'runtime-client', 'unseen-generality', 'module-stub-smoke', 'development-build', 'policy-cleanup']) {
    assert.match(verifier, new RegExp(`phase\\('${phase}'|['"]${phase}['"]`), `missing G004 phase ${phase}`);
  }
  assert.doesNotMatch(verifier, /phase\('app-composition'/);
  assert.match(verifier, /invocationPids\.developmentBuild\.size/);
  assert.match(verifier, /ordinary-package-entry[\s\S]+AllNewMTSRuntime[\s\S]+AllNewMTSLua[\s\S]+defaultEqualsNamed[\s\S]+RuntimeResultEvent/, 'ordinary entry smoke must prove native request and value/type exports');
  assert.match(verifier, /g003-baseline\.json[\s\S]+expectedChanged[\s\S]+sharedBaselines[\s\S]+contentHashes[\s\S]+protectedCheckpointPaths/);
});

test('G004 Metro evidence accepts only exact generated, resolved, and argv records', () => {
  const regression = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/run-g004-development-build.mjs', import.meta.url)), '--metro-evidence-regression'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    timeout: 30000
  });
  assert.equal(regression.error, undefined, `G004 Metro evidence regression could not run: ${regression.error?.message}`);
  assert.equal(regression.status, 0, `G004 Metro evidence regression failed:\n${regression.stdout}${regression.stderr}`);
  assert.deepEqual(JSON.parse(regression.stdout.trim().replace(/^G004_DEVELOPMENT_BUILD=/, '')), {
    status: 'PASS',
    mode: 'metro-evidence-regression',
    generatedRecords: 2,
    exactUnquotedGeneratedAccepted: true,
    quotedGeneratedRejected: true,
    malformedGeneratedRecordsRejected: true,
    malformedNumericEvidenceRejected: true,
    appRawMatches: 2,
    appCommandLineMatches: 1,
    appResolvedMatches: 1,
    appEvidencePreservedOnSuccess: true,
    appEvidencePreservedOnFailure: true,
    buildFailureEvidence: {
      canonicalWithinCap: true,
      causalClasses: ['BUILD_FAILED', 'COMMAND_FAILED', 'DIAGNOSTIC_ERROR', 'FAILED_COMMAND_LIST'],
      evidenceIdentityPreserved: true,
      formatterFallbackSafe: true,
      originalDigestsOmitted: true,
      sensitiveValuesRedacted: true,
      wholeStreamSanitizedBeforeSelection: true
    }
  });
});

test('G004 UI wrapper forwards only canonical bounded build-failure evidence through inherited stdio', () => {
  const verifier = fileURLToPath(new URL('../scripts/verify-ui.mjs', import.meta.url));
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  const storyWrapper = fs.readFileSync(new URL('../scripts/verify-foundation.mjs', import.meta.url), 'utf8');
  assert.match(storyWrapper, /spawnSync\(check\.argv\[0\], check\.argv\.slice\(1\), \{ cwd: root, stdio: 'inherit'/, 'story checks must preserve the wrapper marker through inherited stdio');
  const harness = [
    "const { spawnSync } = require('node:child_process');",
    `const result = spawnSync(process.execPath, [${JSON.stringify(verifier)}, '--build-failure-forwarding-regression'], { cwd: ${JSON.stringify(repoRoot)}, stdio: 'inherit' });`,
    "if (result.error) throw result.error;",
    "process.exit(result.status ?? 1);"
  ].join('\n');
  const regression = spawnSync(process.execPath, ['-e', harness], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    timeout: 30000
  });
  assert.equal(regression.error, undefined, `G004 forwarding regression could not run: ${regression.error?.message}`);
  assert.equal(regression.status, 0, `G004 forwarding regression failed:\n${regression.stdout}${regression.stderr}`);
  const inherited = `${regression.stdout}${regression.stderr}`;
  assert.doesNotMatch(inherited, /G004_FORWARDING_PLANTED_SECRET/, 'raw child diagnostics must not cross the wrapper boundary');
  const markerLines = regression.stdout.split(/\r?\n/).filter((line) => line.startsWith('ALLNEWMTS_G004_BUILD_FAILURE='));
  assert.equal(markerLines.length, 1, 'the inherited story boundary must receive exactly one complete marker');
  const suffix = markerLines[0].slice('ALLNEWMTS_G004_BUILD_FAILURE='.length);
  assert.ok(Buffer.byteLength(suffix) <= 524_512, 'forwarded envelope exceeds its transport cap');
  const envelope = JSON.parse(suffix);
  assert.deepEqual(Object.keys(envelope).sort(), ['buildFailureEvidence', 'buildFailureEvidenceSha256', 'cleanupErrorCount', 'schema']);
  assert.equal(envelope.schema, 'allnewmts.g004.build-failure-envelope.v1');
  const canonicalEvidence = JSON.stringify(envelope.buildFailureEvidence);
  assert.ok(Buffer.byteLength(canonicalEvidence) <= 524_288, 'forwarded evidence exceeds its canonical cap');
  assert.equal(createHash('sha256').update(canonicalEvidence).digest('hex'), envelope.buildFailureEvidenceSha256);
  const summaryLine = regression.stdout.split(/\r?\n/).find((line) => line.startsWith('G004_BUILD_FAILURE_FORWARDING_REGRESSION='));
  assert.ok(summaryLine, 'forwarding regression emitted no summary');
  const summary = JSON.parse(summaryLine.slice('G004_BUILD_FAILURE_FORWARDING_REGRESSION='.length));
  assert.equal(summary.status, 'PASS');
  assert.equal(summary.immediateSamePrimaryThrow, true);
  assert.equal(summary.realChildTransport, true);
  assert.equal(summary.redStdoutBytes, 65_536);
  assert.ok(summary.childStdoutBytes > 65_536);
  assert.equal(summary.producerPrefixes, 1);
  assert.equal(summary.verifierPrefixes, 1);
  assert.equal(summary.markerByteIdentity, true);
  assert.equal(summary.producerMarkerSha256, summary.verifierMarkerSha256);
  assert.equal(summary.verifierMarkerSha256, createHash('sha256').update(markerLines[0]).digest('hex'));
  assert.equal(summary.evidenceCanonicalBytes, Buffer.byteLength(canonicalEvidence));
  assert.ok(summary.trailingDiagnosticBytes > 20_000);
  assert.equal(summary.validMarkersForwarded, 1);
  assert.deepEqual(summary.fallbackCases, ['absent', 'duplicate', 'malformed', 'noncanonical', 'oversize', 'hash-mismatch']);
  assert.equal(summary.fallbackMaxBytes, 1024);
  assert.equal(summary.unrelatedTailPreserved, true);
  assert.deepEqual(summary.writerFailure, {
    builds: 0,
    emitterCalls: 1,
    evidenceHashPreserved: true,
    evidenceIdentityPreserved: true,
    existingCleanupPreserved: true,
    markersEmitted: 0,
    retries: 0,
    samePrimary: true,
    secondaryLocation: 'primaryError.cleanupErrors[1]',
    statusSignalPreserved: true
  });
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
