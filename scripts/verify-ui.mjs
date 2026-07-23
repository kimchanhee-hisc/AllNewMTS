import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSyntheticFixture } from './generate-g001-synthetic.mjs';
import { safeRepoFile, validateSchema } from './verify-foundation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const phases = ['parser-model', 'projection-render', 'runtime-client', 'unseen-generality', 'module-stub-smoke'];
const argv = process.argv.slice(2);
const forwardingRegression = argv.length === 1 && argv[0] === '--build-failure-forwarding-regression';
assert.ok(forwardingRegression || argv.length === 0 || (argv.length === 2 && argv[0] === '--phase' && phases.includes(argv[1])), `usage: node scripts/verify-ui.mjs [--phase ${phases.join('|')}]`);
const selected = forwardingRegression ? undefined : argv[1];
const read = (file, encoding) => fs.readFileSync(safeRepoFile(file), encoding);
const json = (file) => JSON.parse(read(file, 'utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const buildFailurePrefix = 'ALLNEWMTS_G004_BUILD_FAILURE=';
const buildFailureCommand = 'node scripts/run-g004-development-build.mjs';
const buildFailureEnvelopeSchema = 'allnewmts.g004.build-failure-envelope.v1';
const buildFailureEvidenceSchema = 'allnewmts.g004.build-failure-evidence.v1';
const genericFailureEvidenceSchema = 'allnewmts.g004.generic-failure-evidence.v1';
const buildFailureForwardSchema = 'allnewmts.g004.build-failure-forward.v1';
const buildFailureEvidenceCap = 524_288;
const genericFailureEvidenceCap = 1024;
const buildFailureSuffixCap = 524_512;
const genericFailurePhases = Object.freeze([
  'development-build',
  'package-custodian',
  'environment-selection',
  'offline-dependencies',
  'prebuild',
  'pods',
  'nested-swiftpm',
  'build-settings',
  'compiled-build',
  'simulator-boot',
  'metro',
  'app-install',
  'app-launch',
  'runtime-marker',
  'cleanup'
]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

const canonicalJson = (value) => JSON.stringify(canonicalize(value));
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

function validBuildFailureSuffix(suffix) {
  if (Buffer.byteLength(suffix) > buildFailureSuffixCap) return false;
  let envelope;
  try {
    envelope = JSON.parse(suffix);
  } catch {
    return false;
  }
  if (!exactKeys(envelope, ['buildFailureEvidence', 'buildFailureEvidenceSha256', 'cleanupErrorCount', 'schema'])) return false;
  if (envelope.schema !== buildFailureEnvelopeSchema) return false;
  if (!Number.isSafeInteger(envelope.cleanupErrorCount) || envelope.cleanupErrorCount < 0) return false;
  if (!/^[0-9a-f]{64}$/.test(envelope.buildFailureEvidenceSha256)) return false;
  const evidence = canonicalJson(envelope.buildFailureEvidence);
  if (Buffer.byteLength(evidence) > buildFailureEvidenceCap) return false;
  if (envelope.buildFailureEvidence?.schema === genericFailureEvidenceSchema) {
    if (Buffer.byteLength(evidence) > genericFailureEvidenceCap) return false;
    if (!exactKeys(envelope.buildFailureEvidence, ['code', 'errorCode', 'errorName', 'phase', 'schema'])) return false;
    if (envelope.buildFailureEvidence.code !== 'RUNNER_PRIMARY_ERROR') return false;
    if (!['ERR_ASSERTION', 'UNCLASSIFIED'].includes(envelope.buildFailureEvidence.errorCode)) return false;
    if (!['AggregateError', 'AssertionError', 'Error'].includes(envelope.buildFailureEvidence.errorName)) return false;
    if (!genericFailurePhases.includes(envelope.buildFailureEvidence.phase)) return false;
  } else if (envelope.buildFailureEvidence?.schema !== buildFailureEvidenceSchema) {
    return false;
  }
  if (sha256(evidence) !== envelope.buildFailureEvidenceSha256) return false;
  return canonicalJson(envelope) === suffix;
}

function buildFailureMarkerLines(stdout) {
  return String(stdout ?? '').split('\n').filter((line) => line.startsWith(buildFailurePrefix));
}

function emitBuildFailureMarker(line) {
  const bytes = Buffer.from(`${line}\n`);
  const pause = new Int32Array(new SharedArrayBuffer(4));
  let offset = 0;
  while (offset < bytes.length) {
    try {
      const written = fs.writeSync(process.stdout.fd, bytes, offset, Math.min(16_384, bytes.length - offset));
      assert.ok(written > 0, 'build-failure marker stdout made no progress');
      offset += written;
    } catch (error) {
      if (error?.code !== 'EAGAIN') throw error;
      Atomics.wait(pause, 0, 0, 1);
    }
  }
}

function forwardBuildFailure(result, emit = emitBuildFailureMarker) {
  const stdout = String(result.stdout ?? '');
  const stderr = String(result.stderr ?? '');
  const candidates = buildFailureMarkerLines(stdout);
  if (candidates.length === 1) {
    const suffix = candidates[0].slice(buildFailurePrefix.length);
    if (validBuildFailureSuffix(suffix)) {
      emit(`${buildFailurePrefix}${suffix}`);
      return;
    }
  }
  const fallback = canonicalJson({
    childSignal: typeof result.signal === 'string' ? result.signal : null,
    childStatus: Number.isSafeInteger(result.status) ? result.status : null,
    code: 'BUILD_FAILURE_EVIDENCE_FORWARD_ERROR',
    command: buildFailureCommand,
    markerCount: candidates.length,
    schema: buildFailureForwardSchema,
    stderrByteCount: Buffer.byteLength(stderr),
    stdoutByteCount: Buffer.byteLength(stdout)
  });
  assert.ok(Buffer.byteLength(fallback) <= 1024, 'build-failure forwarding fallback exceeded 1024 bytes');
  emit(`${buildFailurePrefix}${fallback}`);
}

function assertSuccessfulRun(file, args, result, emit = emitBuildFailureMarker) {
  if (result.status === 0) return;
  if (file === 'node' && args[0] === 'scripts/run-g004-development-build.mjs') {
    forwardBuildFailure(result, emit);
    assert.fail(`${buildFailureCommand} failed; bounded evidence forwarded`);
  }
  const diagnostic = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  assert.equal(result.status, 0, `${file} ${args.join(' ')} failed:\n${diagnostic.slice(-20000)}`);
}

function forwardingRegressionEvidence() {
  const child = spawnSync('node', ['scripts/run-g004-development-build.mjs', '--build-failure-marker-transport-child'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024
  });
  assert.equal(child.error, undefined, `build-failure marker child could not start: ${child.error?.message}`);
  assert.notEqual(child.status, 0, 'build-failure marker child must preserve failure');
  const childStdoutBytes = Buffer.byteLength(child.stdout ?? '');
  assert.ok(childStdoutBytes > 65_536, `build-failure marker child truncated stdout at ${childStdoutBytes} bytes`);
  const producerMarkers = buildFailureMarkerLines(child.stdout);
  assert.equal(producerMarkers.length, 1);
  const producerMarker = producerMarkers[0];
  const suffix = producerMarker.slice(buildFailurePrefix.length);
  assert.equal(validBuildFailureSuffix(suffix), true);
  const envelope = JSON.parse(suffix);
  const evidenceJson = canonicalJson(envelope.buildFailureEvidence);
  assert.ok(Buffer.byteLength(evidenceJson) <= buildFailureEvidenceCap);
  assert.equal(sha256(evidenceJson), envelope.buildFailureEvidenceSha256);
  assert.ok(Buffer.byteLength(suffix) <= buildFailureSuffixCap);
  const writerLine = String(child.stderr ?? '').split(/\r?\n/).find((line) => line.startsWith('G004_BUILD_FAILURE_WRITER_REGRESSION='));
  assert.ok(writerLine, 'build-failure marker child emitted no writer-failure evidence');
  const writerFailure = JSON.parse(writerLine.slice('G004_BUILD_FAILURE_WRITER_REGRESSION='.length));
  const genericChild = spawnSync('node', ['scripts/run-g004-development-build.mjs', '--generic-failure-marker-transport-child'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024
  });
  assert.equal(genericChild.error, undefined, `generic failure marker child could not start: ${genericChild.error?.message}`);
  assert.notEqual(genericChild.status, 0, 'generic failure marker child must preserve failure');
  const genericMarkers = buildFailureMarkerLines(genericChild.stdout);
  assert.equal(genericMarkers.length, 1);
  const genericSuffix = genericMarkers[0].slice(buildFailurePrefix.length);
  assert.equal(validBuildFailureSuffix(genericSuffix), true);
  const genericEnvelope = JSON.parse(genericSuffix);
  const genericEvidenceCanonicalBytes = Buffer.byteLength(canonicalJson(genericEnvelope.buildFailureEvidence));
  assert.ok(genericEvidenceCanonicalBytes <= genericFailureEvidenceCap);
  assert.equal(genericEnvelope.buildFailureEvidence.schema, genericFailureEvidenceSchema);
  assert.equal(genericEnvelope.buildFailureEvidence.errorCode, 'ERR_ASSERTION');
  assert.equal(genericEnvelope.buildFailureEvidence.phase, 'development-build');
  assert.doesNotMatch(genericMarkers[0], /G004_GENERIC_CHILD_SECRET/);
  const genericWriterLine = String(genericChild.stderr ?? '').split(/\r?\n/).find((line) => line.startsWith('G004_GENERIC_FAILURE_WRITER_REGRESSION='));
  assert.ok(genericWriterLine, 'generic failure marker child emitted no writer-failure evidence');
  const genericWriterRegression = JSON.parse(genericWriterLine.slice('G004_GENERIC_FAILURE_WRITER_REGRESSION='.length));
  const { phaseMarkers, ...genericWriterFailure } = genericWriterRegression;
  assert.deepEqual(genericWriterFailure.productionPhases, genericFailurePhases);
  assert.equal(phaseMarkers.length, genericFailurePhases.length);
  const forwardedPhases = phaseMarkers.map((marker, index) => {
    const phase = genericFailurePhases[index];
    assert.equal(validBuildFailureSuffix(marker.slice(buildFailurePrefix.length)), true, phase);
    const emitted = [];
    assert.throws(
      () => assertSuccessfulRun('node', ['scripts/run-g004-development-build.mjs'], { status: 1, signal: null, stdout: marker, stderr: '' }, (line) => emitted.push(line)),
      (error) => error?.message === `${buildFailureCommand} failed; bounded evidence forwarded`,
      phase
    );
    assert.deepEqual(emitted, [marker], phase);
    return JSON.parse(marker.slice(buildFailurePrefix.length)).buildFailureEvidence.phase;
  });
  assert.deepEqual(forwardedPhases, genericFailurePhases);
  const genericForwarded = [];
  assert.throws(
    () => assertSuccessfulRun('node', ['scripts/run-g004-development-build.mjs'], genericChild, (line) => genericForwarded.push(line)),
    (error) => error?.message === `${buildFailureCommand} failed; bounded evidence forwarded`
  );
  assert.deepEqual(genericForwarded, genericMarkers);
  const forwarded = [];
  assert.throws(
    () => assertSuccessfulRun('node', ['scripts/run-g004-development-build.mjs'], child, (line) => {
      forwarded.push(line);
      emitBuildFailureMarker(line);
    }),
    (error) => error?.message === `${buildFailureCommand} failed; bounded evidence forwarded`
  );
  assert.deepEqual(forwarded, [producerMarker]);
  const secret = 'G004_FORWARDING_PLANTED_SECRET';
  const envelopeForEvidence = (buildFailureEvidence) => {
    const evidenceJson = canonicalJson(buildFailureEvidence);
    return canonicalJson({
      buildFailureEvidence,
      buildFailureEvidenceSha256: sha256(evidenceJson),
      cleanupErrorCount: 0,
      schema: buildFailureEnvelopeSchema
    });
  };

  const mismatch = canonicalJson({ ...envelope, buildFailureEvidenceSha256: '0'.repeat(64) });
  const genericEvidence = genericEnvelope.buildFailureEvidence;
  const cases = [
    ['absent', 'ordinary output'],
    ['duplicate', `${buildFailurePrefix}${suffix}\n${buildFailurePrefix}${suffix}`],
    ['malformed', `${buildFailurePrefix}{`],
    ['noncanonical', `${buildFailurePrefix} ${suffix}`],
    ['oversize', `${buildFailurePrefix}${'x'.repeat(buildFailureSuffixCap + 1)}`],
    ['hash-mismatch', `${buildFailurePrefix}${mismatch}`],
    ['generic-unknown-schema', `${buildFailurePrefix}${envelopeForEvidence({ ...genericEvidence, schema: 'allnewmts.g004.unknown.v1' })}`],
    ['generic-extra-key', `${buildFailurePrefix}${envelopeForEvidence({ ...genericEvidence, secret })}`],
    ['generic-invalid-code', `${buildFailurePrefix}${envelopeForEvidence({ ...genericEvidence, errorCode: 'G004_FORWARDING_PLANTED_SECRET' })}`],
    ['generic-unknown-phase', `${buildFailurePrefix}${envelopeForEvidence({ ...genericEvidence, phase: 'unknown-phase' })}`],
    ['generic-oversize', `${buildFailurePrefix}${envelopeForEvidence({ ...genericEvidence, errorName: 'A'.repeat(genericFailureEvidenceCap + 1) })}`]
  ];
  for (const [name, stdout] of cases) {
    const emitted = [];
    assert.throws(
      () => assertSuccessfulRun('node', ['scripts/run-g004-development-build.mjs'], { status: 1, signal: null, stdout, stderr: secret }, (line) => emitted.push(line)),
      (error) => error?.message === `${buildFailureCommand} failed; bounded evidence forwarded`,
      name
    );
    assert.equal(emitted.length, 1, name);
    assert.ok(emitted[0].startsWith(buildFailurePrefix), name);
    assert.ok(Buffer.byteLength(emitted[0].slice(buildFailurePrefix.length)) <= 1024, name);
    assert.doesNotMatch(emitted[0], new RegExp(secret), name);
    const fallback = JSON.parse(emitted[0].slice(buildFailurePrefix.length));
    assert.equal(fallback.schema, buildFailureForwardSchema, name);
    assert.equal(fallback.code, 'BUILD_FAILURE_EVIDENCE_FORWARD_ERROR', name);
  }
  assert.throws(
    () => assertSuccessfulRun(process.execPath, ['-e', 'failure'], { status: 1, signal: null, stdout: '', stderr: 'unrelated-tail-sentinel' }, () => assert.fail('unrelated failures must not emit forwarding markers')),
    /unrelated-tail-sentinel/
  );
  return {
    childStdoutBytes,
    evidenceCanonicalBytes: Buffer.byteLength(evidenceJson),
    status: 'PASS',
    immediateSamePrimaryThrow: true,
    markerByteIdentity: true,
    genericFailure: {
      evidenceCanonicalBytes: genericEvidenceCanonicalBytes,
      markerByteIdentity: genericForwarded[0] === genericMarkers[0],
      markersForwarded: genericForwarded.length,
      producerPrefixes: genericMarkers.length,
      schema: genericEnvelope.buildFailureEvidence.schema,
      forwardedPhases,
      parentPhases: genericFailurePhases,
      writerFailure: genericWriterFailure
    },
    producerPrefixes: producerMarkers.length,
    producerMarkerSha256: sha256(producerMarker),
    realChildTransport: true,
    redStdoutBytes: 65_536,
    validMarkersForwarded: 1,
    trailingDiagnosticBytes: Buffer.byteLength(child.stderr ?? ''),
    verifierPrefixes: forwarded.length,
    verifierMarkerSha256: sha256(forwarded[0]),
    writerFailure,
    fallbackCases: cases.map(([name]) => name),
    fallbackMaxBytes: 1024,
    unrelatedTailPreserved: true
  };
}

if (forwardingRegression) {
  const evidence = forwardingRegressionEvidence();
  const output = `G004_BUILD_FAILURE_FORWARDING_REGRESSION=${canonicalJson(evidence)}\n`;
  await new Promise((resolve, reject) => process.stdout.write(output, (error) => error ? reject(error) : resolve()));
  process.exit(0);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'allnewmts-g004-verifier-'));
const originalPath = 'test/oracles/sources/mts_screen/HS1200P08.xmf_';
const syntheticPath = 'test/oracles/synthetic/renamed-reordered.xmf_';
const expectedSourceHash = '4d63ba22ac5339cfd3068cffa91710e0099481da81d974e2aff0ce7ae39ed53e';
const sourceManifest = json('native/lua-source-manifest.json');
const expectedGolden = read('test/g004/runtime-client-golden.json', 'utf8').trim();
const independentGrammar = Object.freeze([
  { parent: 'document', order: 1, tag: 'ROOT', form: 'paired', cardinality: '1', required: [], optional: [], body: 'MAP_INFO,FORM_INFO,CONTROL_INFO,SCRIPT_INFO,DATAIO_INFO; no trailing data' },
  { parent: 'ROOT', order: 1, tag: 'MAP_INFO', form: 'self', cardinality: '1', required: ['scrno', 'scrname', 'version', 'writer', 'scrtype', 'scripttype'], optional: [], body: 'token/text/decimal metadata bounds' },
  { parent: 'ROOT', order: 2, tag: 'FORM_INFO', form: 'self', cardinality: '1', required: ['name', 'bgcolor', 'ly_vert'], optional: [], body: 'identifier,encoded-color,layout' },
  { parent: 'ROOT', order: 3, tag: 'CONTROL_INFO', form: 'paired', cardinality: '1', required: [], optional: [], body: 'five controls in arbitrary order then TABORDER_INFO; unique names' },
  { parent: 'CONTROL_INFO', order: 1, tag: 'LABEL', form: 'self', cardinality: '2', required: ['name', 'caption', 'ly_vert'], optional: ['fontsize', 'fontstyle'], body: 'identifier,text<=2048,registry projection' },
  { parent: 'CONTROL_INFO', order: 1, tag: 'EDIT', form: 'self', cardinality: '1', required: ['name', 'hintcaption', 'imetype', 'maxlength', 'leadheight', 'paddinginfo', 'ly_vert'], optional: ['caption'], body: 'identifier,text<=2048,registry projection' },
  { parent: 'CONTROL_INFO', order: 1, tag: 'BUTTON', form: 'self', cardinality: '2', required: ['name', 'caption', 'fgcolor', 'fontsize', 'ly_vert'], optional: ['enable', 'bgcolor', 'bordersize'], body: 'identifier,text<=2048,registry projection' },
  { parent: 'CONTROL_INFO', order: 2, tag: 'TABORDER_INFO', form: 'self', cardinality: '1', required: ['horz', 'vert'], optional: [], body: 'backtick list 1..5; unique declared Edit/Button; <=644 bytes' },
  { parent: 'ROOT', order: 4, tag: 'SCRIPT_INFO', form: 'paired', cardinality: '1', required: ['_len', '_ulen'], optional: [], body: 'opaque 0..2097152 bytes; exact single close' },
  { parent: 'ROOT', order: 5, tag: 'DATAIO_INFO', form: 'paired', cardinality: '1', required: [], optional: [], body: 'TRID_INFO then TRIO_INFO' },
  { parent: 'DATAIO_INFO', order: 1, tag: 'TRID_INFO', form: 'paired', cardinality: '1', required: [], optional: [], body: 'two self-closing TRAN; unique tranid' },
  { parent: 'TRID_INFO', order: 1, tag: 'TRAN', form: 'self', cardinality: '2', required: ['tranid', 'trcode', 'encryption', 'useattr'], optional: [], body: 'identifier/token/decimal metadata' },
  { parent: 'DATAIO_INFO', order: 2, tag: 'TRIO_INFO', form: 'paired', cardinality: '1', required: [], optional: [], body: 'two paired TRAN; names equal TRID_INFO set' },
  { parent: 'TRIO_INFO', order: 1, tag: 'TRAN', form: 'paired', cardinality: '2', required: ['name', 'title', 'realdata', 'dessvr', 'occurslen', 'memfieldlen'], optional: [], body: 'four TRBLOCK: two in/two out and one occurs=1 per direction' },
  { parent: 'TRIO_INFO/TRAN', order: 1, tag: 'TRBLOCK', form: 'paired', cardinality: '4 each/8 total', required: ['name', 'inout', '_len', '_ulen'], optional: ['occurs'], body: 'opaque 1..262144; LF xor CRLF; 1..1024 unique identifier^ rows; first close wins' }
]);
const invocationPids = { ui: new Set([process.pid]), developmentBuild: new Set() };

function run(file, args, options = {}) {
  const result = spawnSync(file, args, { cwd: root, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024, ...options });
  assert.equal(result.error, undefined, `${file} could not start: ${result.error?.message}`);
  assertSuccessfulRun(file, args, result);
  if (file === 'node' && args[0] === 'scripts/run-g004-development-build.mjs') invocationPids.developmentBuild.add(result.pid);
  return (result.stdout ?? '').trim();
}

function compileTypeScript() {
  run('node_modules/.bin/tsc', [
    '--ignoreConfig', '--module', 'commonjs', '--moduleResolution', 'node', '--target', 'es2022',
    '--resolveJsonModule', '--esModuleInterop', '--skipLibCheck', '--noCheck', '--ignoreDeprecations', '6.0',
    '--outDir', temp, '--rootDir', '.', 'src/xmf.ts', 'src/runtime-client.ts'
  ]);
  const require = createRequire(import.meta.url);
  return {
    xmf: require(path.join(temp, 'src/xmf.js')),
    runtimeClient: require(path.join(temp, 'src/runtime-client.js'))
  };
}

const modules = compileTypeScript();
const original = read(originalPath);
const synthetic = read(syntheticPath);

function phase(name, work) {
  const started = performance.now();
  console.log(JSON.stringify({ event: 'G004_PHASE_START', phase: name }));
  return Promise.resolve(work()).then((evidence) => {
    console.log(JSON.stringify({ event: 'G004_PHASE_END', phase: name, status: 'PASS', durationMs: Math.round(performance.now() - started), ...evidence }));
    return evidence;
  });
}

function scriptSlice(bytes) {
  const open = Buffer.from(bytes).indexOf(Buffer.from('<SCRIPT_INFO'));
  const start = Buffer.from(bytes).indexOf(0x3e, open) + 1;
  const end = Buffer.from(bytes).indexOf(Buffer.from('</SCRIPT_INFO>'), start);
  assert.ok(open >= 0 && start > open && end > start);
  return bytes.subarray(start, end);
}

function summary(model) {
  return {
    forms: model.form ? 1 : 0,
    labels: model.controls.filter(({ type }) => type === 'Label').length,
    edits: model.controls.filter(({ type }) => type === 'Edit').length,
    buttons: model.controls.filter(({ type }) => type === 'Button').length,
    transactionIds: model.transactionIds.length,
    transactions: model.transactions.length,
    blocks: model.transactions.flatMap(({ blocks }) => blocks).length
  };
}

function mutate(bytes, from, to, count = 1) {
  const text = Buffer.from(bytes).toString('utf8');
  assert.ok(text.includes(from), `mutation source token missing: ${from}`);
  let output = text;
  for (let index = 0; index < count; index += 1) output = output.replace(from, to);
  return Buffer.from(output, 'utf8');
}

function rejects(bytes, code) {
  assert.throws(() => modules.xmf.parseXmf(bytes), (error) => error?.code === code && JSON.stringify(error).length < 65_536);
}

function parses(bytes) {
  return modules.xmf.parseXmf(bytes);
}

function replaceAll(bytes, from, to) {
  const text = Buffer.from(bytes).toString('utf8');
  assert.ok(text.includes(from), `mutation source token missing: ${from}`);
  return Buffer.from(text.replaceAll(from, to), 'utf8');
}

function replaceFirstBlockBody(bytes, body) {
  const source = Buffer.from(bytes);
  const opening = source.indexOf(Buffer.from('<TRBLOCK'));
  const start = source.indexOf(0x3e, opening) + 1;
  const end = source.indexOf(Buffer.from('</TRBLOCK>'), start);
  assert.ok(opening >= 0 && start > opening && end > start);
  return Buffer.concat([source.subarray(0, start), Buffer.from(body), source.subarray(end)]);
}

function replaceOpaqueBody(bytes, tag, body) {
  const source = Buffer.from(bytes);
  const opening = source.indexOf(Buffer.from(`<${tag}`));
  const start = source.indexOf(0x3e, opening) + 1;
  const end = source.indexOf(Buffer.from(`</${tag}>`), start);
  assert.ok(opening >= 0 && start > opening && end >= start);
  return Buffer.concat([source.subarray(0, start), Buffer.from(body), source.subarray(end)]);
}

function assertModel(model, source) {
  assert.deepEqual(summary(model), { forms: 1, labels: 2, edits: 1, buttons: 2, transactionIds: 2, transactions: 2, blocks: 8 });
  assert.deepEqual(Buffer.from(model.script.bytes), Buffer.from(scriptSlice(source)));
  assert.ok(Buffer.from(model.script.bytes).includes(Buffer.from('&USER_ID')));
  assert.ok(Object.isFrozen(model) && Object.isFrozen(model.controls) && Object.isFrozen(model.transactions));
  assert.ok(model.transactions.every(({ blocks }) => blocks.length === 4));
}

function contractRegistry() {
  const registry = json('contracts/control-registry.json');
  validateSchema(json('contracts/control-registry.schema.json'), registry, 'G004 control registry');
  assert.equal(registry.owningGoal, 'G004-build-generic-xmf-ui-path');
  assert.deepEqual(registry.inputRoles.map(({ name, decision, diagnostic }) => [name, decision, diagnostic]), [
    ['XMF', 'include', null], ['XMS', 'defer', 'UNSUPPORTED_INPUT_ROLE']
  ]);
  assert.deepEqual(registry.controls.filter(({ decision }) => decision === 'include').map(({ normalizedType }) => normalizedType), ['Label', 'Edit', 'Button']);
  assert.equal(registry.controls.find(({ semanticFamilies }) => semanticFamilies.includes('CtlImage')).diagnostic, 'UNSUPPORTED_CONTROL_TYPE');
  assert.deepEqual(registry.controls.flatMap(({ events }) => events.map(({ name, handlerSuffix }) => [name, handlerSuffix])), [
    ['OnEditComplete', '_OnEditComplete'], ['OnClick', '_OnClick']
  ]);
  assert.equal(new Set(registry.policies.map(({ id }) => id)).size, registry.policies.length);
  const parserSource = read('src/xmf.ts', 'utf8');
  assert.doesNotMatch(parserSource, /export\s+(?:const|let|var)\s+.*(?:grammar|policy)/i, 'parser must not export a shadow grammar/policy table');
  const contract = read('docs/specs/xmf-lua-runtime.md', 'utf8');
  assert.equal(new Set(independentGrammar.map(({ parent, tag, form }) => `${parent}:${tag}:${form}`)).size, independentGrammar.length);
  for (const row of independentGrammar) {
    assert.ok(contract.includes(`\`${row.tag}\``), `canonical grammar omits ${row.tag}`);
    assert.ok(['paired', 'self'].includes(row.form) && row.order > 0 && row.cardinality && row.body);
    for (const attribute of [...row.required, ...row.optional]) assert.ok(contract.includes(`\`${attribute}\``), `canonical grammar omits ${row.tag}.${attribute}`);
  }
  const integrityRoot = path.join(temp, 'integrity-root');
  const integrityOutside = path.join(temp, 'integrity-outside');
  const extension = ['xmf', '_'].join('');
  const approvedName = `approved.${extension}`;
  const outsideName = `outside.${extension}`;
  const linkName = `link.${extension}`;
  fs.mkdirSync(integrityRoot);
  fs.mkdirSync(integrityOutside);
  fs.writeFileSync(path.join(integrityRoot, approvedName), 'x');
  fs.writeFileSync(path.join(integrityOutside, outsideName), 'x');
  fs.symlinkSync(path.join(integrityOutside, outsideName), path.join(integrityRoot, linkName));
  assert.equal(safeRepoFile(approvedName, 'G004 integrity', integrityRoot), fs.realpathSync.native(path.join(integrityRoot, approvedName)));
  for (const hostile of [`../${outsideName}`, path.join(path.sep, 'tmp', outsideName), linkName]) assert.throws(() => safeRepoFile(hostile, 'G004 integrity', integrityRoot));
  const umbrella = read('.omx/plans/test-spec-allnewmts-lua-runtime.md', 'utf8');
  assert.doesNotMatch(umbrella, /G004[^\n]*(?:transaction success|transaction error|close)/i, 'umbrella still assigns transaction traces to G004');
  return { grammarRows: independentGrammar.length, grammarColumns: 8, policies: registry.policies.length, integrityHostiles: 3, asset: assetAndComposition() };
}

function parserModel() {
  assert.equal(original.length, 10_179);
  assert.equal(sha256(original), expectedSourceHash);
  assert.equal(sha256(synthetic), 'd0ff1fb20db6e72e743f95499b5dbe107773f22a40a61de19f68ecd3c2e4ba37');
  const originalModel = modules.xmf.parseXmf(original);
  const syntheticModel = modules.xmf.parseXmf(synthetic);
  assertModel(originalModel, original);
  assertModel(syntheticModel, synthetic);
  assert.notEqual(originalModel.map.screenNumber, syntheticModel.map.screenNumber);
  assert.notEqual(originalModel.form.name, syntheticModel.form.name);
  assert.notDeepEqual(originalModel.controls.map(({ name, layout }) => [name, layout]), syntheticModel.controls.map(({ name, layout }) => [name, layout]));
  assert.deepEqual(syntheticModel.warnings, originalModel.warnings, 'warning order must not follow control order');

  const structural = [
    [Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), original]), 'INVALID_STRUCTURE'],
    [Buffer.concat([original.subarray(0, 50), Buffer.from([0]), original.subarray(50)]), 'INVALID_STRUCTURE'],
    [mutate(original, '<?xml version="1.0" encoding="utf-8"?>', '<?xml version="1.1" encoding="utf-8"?>'), 'INVALID_STRUCTURE'],
    [mutate(original, '<?xml version="1.0" encoding="utf-8"?>', '<?xml version="1.0" encoding="utf-8"?><?extra?>'), 'INVALID_STRUCTURE'],
    [mutate(original, '<ROOT>', '<!DOCTYPE ROOT><ROOT>'), 'INVALID_STRUCTURE'],
    [mutate(original, '<ROOT>', '<ROOT><!--x-->'), 'INVALID_STRUCTURE'],
    [mutate(original, '<ROOT>', '<ROOT><![CDATA[x]]>'), 'INVALID_STRUCTURE'],
    [mutate(original, 'writer="조승희"', 'writer="&#65;"'), 'INVALID_STRUCTURE'],
    [mutate(original, 'writer="조승희"', 'writer="&unknown;"'), 'INVALID_STRUCTURE'],
    [mutate(original, 'scrno="1200"', "scrno='1200'"), 'INVALID_STRUCTURE'],
    [mutate(original, 'scrno="1200"', 'scrno ="1200"'), 'INVALID_STRUCTURE'],
    [mutate(original, 'scrno="1200"', 'scrno="1200" scrno="1200"'), 'INVALID_STRUCTURE'],
    [mutate(original, 'scrno="1200"', 'scrno="1200" unknown="x"'), 'INVALID_STRUCTURE'],
    [mutate(original, 'scrno="1200" ', ''), 'INVALID_STRUCTURE'],
    [mutate(original, 'caption="관심그룹 추가"', 'caption="관심그룹 추가" unknown="x"'), 'INVALID_STRUCTURE'],
    [mutate(original, 'caption="관심그룹 추가"', 'caption="관심그룹 추가" caption="x"'), 'INVALID_STRUCTURE'],
    ...independentGrammar.filter(({ form, required, optional }) => form === 'paired' && required.length === 0 && optional.length === 0)
      .map(({ tag }) => [mutate(original, `<${tag}>`, `<${tag} unknown="x">`), 'INVALID_STRUCTURE']),
    [mutate(original, '<MAP_INFO ', '<UNKNOWN_INFO '), 'INVALID_STRUCTURE'],
    [mutate(original, '<LABEL ', '<CTLIMAGE '), 'UNSUPPORTED_CONTROL_TYPE'],
    [mutate(original, '<ROOT>', '<ROOT />'), 'INVALID_STRUCTURE'],
    [mutate(original, '<MAP_INFO ', '<MAP_INFO><MAP_INFO '), 'INVALID_STRUCTURE'],
    [mutate(original, '<FORM_INFO ', '<FORM_INFO><FORM_INFO '), 'INVALID_STRUCTURE'],
    [mutate(original, '\t<MAP_INFO', '\t<FORM_INFO_COPY'), 'INVALID_STRUCTURE'],
    [mutate(original, '\t<FORM_INFO', '\t<MAP_INFO_COPY'), 'INVALID_STRUCTURE'],
    [mutate(original, '\t<FORM_INFO name=', '\t<MAP_INFO scrno="extra" /><FORM_INFO name='), 'INVALID_STRUCTURE'],
    [mutate(original, '\t\t<TABORDER_INFO', '\t\t<LABEL name="early" caption="x" ly_vert="0,0,1,1,1" />\r\n\t\t<TABORDER_INFO'), 'INVALID_STRUCTURE'],
    [mutate(original, 'horz="btnAdd`btnCancel"', 'horz=""'), 'INVALID_STRUCTURE'],
    [mutate(original, 'horz="btnAdd`btnCancel"', 'horz="`btnAdd"'), 'INVALID_STRUCTURE'],
    [mutate(original, 'horz="btnAdd`btnCancel"', 'horz="btnAdd`btnAdd"'), 'INVALID_STRUCTURE'],
    [mutate(original, 'horz="btnAdd`btnCancel"', 'horz="lbl0"'), 'INVALID_STRUCTURE'],
    [mutate(original, 'horz="btnAdd`btnCancel"', 'horz="missing"'), 'INVALID_STRUCTURE'],
    [mutate(original, '</ROOT>', '</ROOT>x'), 'INVALID_STRUCTURE'],
    [mutate(original, '<SCRIPT_INFO ', '<SCRIPT_INFO duplicate="1" '), 'INVALID_STRUCTURE'],
    [mutate(original, '</SCRIPT_INFO>', ''), 'INVALID_STRUCTURE'],
    [mutate(original, '</SCRIPT_INFO>', '</SCRIPT_INFO></SCRIPT_INFO>'), 'INVALID_STRUCTURE'],
    [mutate(original, 'usid^', '</TRBLOCK>usid^'), 'INVALID_STRUCTURE'],
    [mutate(original, 'usid^', '1usid^'), 'INVALID_STRUCTURE'],
    [mutate(original, 'usid^', 'usid^\r'), 'INVALID_STRUCTURE'],
    [mutate(original, 'usid^', 'usid^x\r\n\r\nnext^v\r\n'), 'INVALID_STRUCTURE'],
    [mutate(original, 'usid^', 'dup^x\r\ndup^y\r\n'), 'INVALID_STRUCTURE'],
    [mutate(original, 'tranid="CCS20001"', 'tranid="CCS20000"'), 'INVALID_STRUCTURE'],
    [mutate(original, 'name="CCS20000" title=', 'name="UNDECLARED" title='), 'INVALID_STRUCTURE'],
    [mutate(original, 'name="InBlock2" occurs="1" inout="in"', 'name="InBlock2" occurs="0" inout="in"'), 'INVALID_STRUCTURE'],
    [mutate(original, 'name="InBlock2" occurs="1" inout="in"', 'name="InBlock2" occurs="1" inout="out"'), 'INVALID_STRUCTURE'],
    [mutate(original, 'name="InBlock2"', 'name="InBlock1"'), 'INVALID_STRUCTURE'],
    [mutate(original, 'name="edtGroupNm"', `name="${'E'.repeat(129)}"`), 'INVALID_PROPERTY']
  ];
  for (const [bytes, code] of structural) rejects(bytes, code);

  const invalidAttributeUtf8 = Buffer.from(original);
  invalidAttributeUtf8[invalidAttributeUtf8.indexOf(Buffer.from('caption="')) + 9] = 0xff;
  rejects(invalidAttributeUtf8, 'INVALID_STRUCTURE');
  const invalidRowUtf8 = Buffer.from(original);
  invalidRowUtf8[invalidRowUtf8.indexOf(Buffer.from('usid^')) + 5] = 0xff;
  rejects(invalidRowUtf8, 'INVALID_STRUCTURE');
  rejects(new Uint8Array(4_194_305), 'INVALID_RESOURCE');

  parses(mutate(original, 'writer="조승희"', 'writer="조&amp;승희"'));
  parses(mutate(original, 'scrname="관심종목_그룹추가"', `scrname="${'s'.repeat(512)}"`));
  rejects(mutate(original, 'scrname="관심종목_그룹추가"', `scrname="${'s'.repeat(513)}"`), 'INVALID_STRUCTURE');
  parses(mutate(original, 'caption="관심그룹 추가"', `caption="${'c'.repeat(2048)}"`));
  rejects(mutate(original, 'caption="관심그룹 추가"', `caption="${'c'.repeat(2049)}"`), 'INVALID_PROPERTY');
  const lf = Buffer.from(Buffer.from(original).toString('utf8').replaceAll('\r\n', '\n'));
  assertModel(parses(lf), lf);
  rejects(mutate(original, '\r\nusid^', '\nusid^'), 'INVALID_STRUCTURE');
  rejects(mutate(original, '\r\nusid^', '\rusid^'), 'INVALID_STRUCTURE');
  parses(replaceFirstBlockBody(original, '\r\n \r\n' + Buffer.from(original).subarray(Buffer.from(original).indexOf(Buffer.from('usid^')), Buffer.from(original).indexOf(Buffer.from('</TRBLOCK>'))).toString('utf8')));
  parses(replaceFirstBlockBody(original, `\r\n${Array.from({ length: 1024 }, (_, index) => `f${index}^v`).join('\r\n')}\r\n`));
  const tooManyRows = `\r\n${Array.from({ length: 1025 }, (_, index) => `f${index}^v`).join('\r\n')}\r\n`;
  rejects(replaceFirstBlockBody(original, tooManyRows), 'INVALID_STRUCTURE');
  parses(replaceFirstBlockBody(original, `\r\nf^${'v'.repeat(4094)}\r\n`));
  rejects(replaceFirstBlockBody(original, `\r\nf^${'v'.repeat(4095)}\r\n`), 'INVALID_STRUCTURE');
  rejects(replaceFirstBlockBody(original, '\r\n\r\n\r\nf^v\r\n'), 'INVALID_STRUCTURE');
  parses(replaceOpaqueBody(original, 'SCRIPT_INFO', Buffer.alloc(2_097_152, 0x78)));
  rejects(replaceOpaqueBody(original, 'SCRIPT_INFO', Buffer.alloc(2_097_153, 0x78)), 'INVALID_STRUCTURE');
  const sourceText = Buffer.from(original).toString('utf8');
  const mapLine = sourceText.match(/\t<MAP_INFO[^\r\n]+/)?.[0];
  const formLine = sourceText.match(/\t<FORM_INFO[^\r\n]+/)?.[0];
  assert.ok(mapLine && formLine);
  rejects(Buffer.from(sourceText.replace(`${mapLine}\r\n${formLine}`, `${formLine}\r\n${mapLine}`)), 'INVALID_STRUCTURE');
  rejects(Buffer.from(sourceText.replace(mapLine, `${mapLine}\r\n${mapLine}`)), 'INVALID_STRUCTURE');
  rejects(Buffer.from(sourceText.replace(`${formLine}\r\n`, '')), 'INVALID_STRUCTURE');
  rejects(Buffer.from(sourceText.replace(mapLine, mapLine.replace(/\s*\/>$/, '></MAP_INFO>'))), 'INVALID_STRUCTURE');
  rejects(Buffer.from(sourceText.replace(mapLine, `<CONTROL_INFO>${mapLine}</CONTROL_INFO>`)), 'INVALID_STRUCTURE');
  const firstTransaction = sourceText.match(/(<TRAN name="CCS20000"[\s\S]*?)(\r\n\t\t\t<\/TRAN>)/)?.[1];
  const firstBlocks = firstTransaction?.match(/\t\t\t\t<TRBLOCK[\s\S]*?<\/TRBLOCK>/g);
  assert.equal(firstBlocks?.length, 4);
  rejects(Buffer.from(sourceText.replace(firstTransaction, `${firstTransaction}${firstBlocks[3]}`)), 'INVALID_STRUCTURE');
  rejects(Buffer.from(sourceText.replace(firstTransaction, firstTransaction.replace(firstBlocks[3], ''))), 'INVALID_STRUCTURE');

  const acceptedPolicies = [
    ['ly_vert="0,0,360,216,1"', 'ly_vert="8192,8192,8192,8192,1"'],
    ['maxlength="10"', 'maxlength="262144"'],
    ['paddinginfo="12,0,12,0"', 'paddinginfo="1024,1024,1024,1024"'],
    ['fgcolor="010:255255255"', 'fgcolor="999:255255255"'],
    ['bordersize="0"', 'bordersize="255"'],
    ['fontsize="4"', 'fontsize="999"'],
    ['fontstyle="01"', 'fontstyle="11"'],
    ['enable="0"', 'enable="1"']
  ];
  for (const [from, to] of acceptedPolicies) parses(mutate(original, from, to));
  const policyRejects = [
    ['ly_vert="0,0,360,216,1"', 'ly_vert="0,0,8193,216,1"'], ['ly_vert="0,0,360,216,1"', 'ly_vert="0,0,0,216,1"'],
    ['ly_vert="0,0,360,216,1"', 'ly_vert="+0,0,360,216,1"'], ['ly_vert="0,0,360,216,1"', 'ly_vert="00,0,360,216,1"'],
    ['ly_vert="0,0,360,216,1"', 'ly_vert="0, 0,360,216,1"'], ['ly_vert="0,0,360,216,1"', 'ly_vert="0,0,360,216"'],
    ['ly_vert="0,0,360,216,1"', 'ly_vert="0,0,360.0,216,1"'], ['ly_vert="0,0,360,216,1"', 'ly_vert="0,0,360,216,0"'],
    ['maxlength="10"', 'maxlength="0"'], ['maxlength="10"', 'maxlength="262145"'], ['maxlength="10"', 'maxlength="0000010"'],
    ['maxlength="10"', 'maxlength="01"'], ['maxlength="10"', 'maxlength="+10"'], ['maxlength="10"', 'maxlength=" 10"'], ['maxlength="10"', 'maxlength="1.0"'],
    ['paddinginfo="12,0,12,0"', 'paddinginfo="1025,0,12,0"'], ['paddinginfo="12,0,12,0"', 'paddinginfo="+12,0,12,0"'],
    ['paddinginfo="12,0,12,0"', 'paddinginfo="12, 0,12,0"'], ['paddinginfo="12,0,12,0"', 'paddinginfo="012,0,12,0"'],
    ['paddinginfo="12,0,12,0"', 'paddinginfo="12,0,12"'], ['paddinginfo="12,0,12,0"', 'paddinginfo="12.0,0,12,0"'],
    ['imetype="0"', 'imetype="1"'], ['imetype="0"', 'imetype="00"'], ['imetype="0"', 'imetype="+0"'], ['imetype="0"', 'imetype=" 0"'],
    ['leadheight="0"', 'leadheight="1"'], ['leadheight="0"', 'leadheight="00"'], ['leadheight="0"', 'leadheight="-0"'], ['leadheight="0"', 'leadheight="0 "'],
    ['fgcolor="010:255255255"', 'fgcolor="0000:255255255"'], ['fgcolor="010:255255255"', 'fgcolor="010:256255255"'],
    ['fgcolor="010:255255255"', 'fgcolor="010:25525525"'], ['fgcolor="010:255255255"', 'fgcolor="010:+55255255"'],
    ['fgcolor="010:255255255"', 'fgcolor="010:255 55255"'], ['fgcolor="010:255255255"', 'fgcolor="010:25525525x"'],
    ['bordersize="0"', 'bordersize="256"'], ['bordersize="0"', 'bordersize="0000"'], ['bordersize="0"', 'bordersize="00"'],
    ['bordersize="0"', 'bordersize="+0"'], ['bordersize="0"', 'bordersize=" 0"'], ['bordersize="0"', 'bordersize="0.0"'],
    ['fontsize="4"', 'fontsize=""'], ['fontsize="4"', 'fontsize="1000"'], ['fontsize="4"', 'fontsize="１２"'], ['fontsize="4"', 'fontsize="4x"'],
    ['fontstyle="01"', 'fontstyle="0"'], ['fontstyle="01"', 'fontstyle="010"'], ['fontstyle="01"', 'fontstyle="0x"'],
    ['enable="0"', 'enable="2"'], ['enable="0"', 'enable="01"'], ['enable="0"', 'enable="+0"'], ['enable="0"', 'enable=" 0"']
  ];
  for (const [from, to] of policyRejects) rejects(mutate(original, from, to), 'INVALID_PROPERTY');

  assert.deepEqual(originalModel.warnings, [
    { code: 'UNSUPPORTED_PRESENTATION_CODE', normalizedType: 'Button', property: 'fontsize' },
    { code: 'UNSUPPORTED_PRESENTATION_CODE', normalizedType: 'Label', property: 'fontsize' },
    { code: 'UNSUPPORTED_PRESENTATION_CODE', normalizedType: 'Label', property: 'fontstyle' }
  ]);
  const noLabelWarning = parses(mutate(original, ' fontsize="4" fontstyle="01"', ''));
  assert.deepEqual(noLabelWarning.warnings, [{ code: 'UNSUPPORTED_PRESENTATION_CODE', normalizedType: 'Button', property: 'fontsize' }]);
  const duplicateWarning = parses(mutate(original, '<LABEL name="lbl1"', '<LABEL name="lbl1" fontsize="8" fontstyle="10"'));
  assert.deepEqual(duplicateWarning.warnings, originalModel.warnings);
  assert.doesNotMatch(JSON.stringify(duplicateWarning.warnings), /lbl|btn|\b(?:4|8|01|10)\b/);

  const resourceCases = [
    { bytes: original, byteCount: original.length - 1, sha256: expectedSourceHash },
    { bytes: original, byteCount: original.length, sha256: '0'.repeat(64) }
  ];
  for (const asset of resourceCases) assert.throws(() => modules.xmf.ingestApprovedXmf(asset), ({ code }) => code === 'INVALID_RESOURCE');
  assert.throws(() => modules.xmf.ingestApprovedXmf({ bytes: original, byteCount: original.length, sha256: expectedSourceHash, inputRole: 'XMS' }), ({ code }) => code === 'UNSUPPORTED_INPUT_ROLE');
  assertModel(modules.xmf.ingestApprovedXmf({ bytes: original, byteCount: original.length, sha256: expectedSourceHash, inputRole: 'XMF' }), original);
  return { fixtures: 2, negativeCases: structural.length + policyRejects.length + 15, policyBoundaries: acceptedPolicies.length, independentGrammarRows: independentGrammar.length };
}

function projectionRender() {
  const model = modules.xmf.parseXmf(original);
  const descriptors = modules.xmf.toRenderDescriptors(model);
  assert.deepEqual(descriptors.map(({ component }) => component), model.controls.map(({ type }) => ({ Label: 'Text', Edit: 'TextInput', Button: 'Pressable' })[type]));
  assert.ok(descriptors.every(({ style, accessibilityLabel }) => style.width > 0 && style.height > 0 && accessibilityLabel));
  const label = descriptors.find(({ component }) => component === 'Text');
  assert.equal(label.event, undefined);
  const edit = descriptors.find(({ component }) => component === 'TextInput');
  assert.equal(edit.event, 'OnEditComplete');
  assert.equal(edit.maxLength, 10);
  assert.ok(edit.placeholder && edit.padding);
  const buttons = descriptors.filter(({ component }) => component === 'Pressable');
  assert.ok(buttons.every(({ accessibilityRole, event }) => accessibilityRole === 'button' && event === 'OnClick'));
  const editControl = model.controls.find(({ type }) => type === 'Edit');
  const buttonControl = model.controls.find(({ type }) => type === 'Button');
  assert.deepEqual(modules.xmf.buildControlEvent(editControl, 'OnEditComplete', 'changed'), {
    handler: `${editControl.name}_OnEditComplete`, controlMutations: [{ control: editControl.name, property: 'caption', value: 'changed' }]
  });
  assert.deepEqual(modules.xmf.buildControlEvent(buttonControl, 'OnClick'), {
    handler: `${buttonControl.name}_OnClick`, controlMutations: []
  });
  assert.throws(() => modules.xmf.buildControlEvent(model.controls.find(({ type }) => type === 'Label'), 'OnClick'), ({ code }) => code === 'INVALID_PROPERTY');
  const encoded = modules.xmf.toRenderDescriptors(model, { [buttonControl.name]: { border: 'solid', dfgcolor: '010:255000000', enabled: false } });
  const encodedButton = encoded.find(({ control }) => control === buttonControl.name);
  assert.deepEqual([encodedButton.borderWidth, encodedButton.foregroundColor, encodedButton.enabled], [1, 'rgb(255,0,0)', false]);
  for (const [border, expected] of [['none', 0], ['0', 0], ['solid', 1], ['1', 1]]) {
    assert.equal(modules.xmf.toRenderDescriptors(model, { [buttonControl.name]: { border } }).find(({ control }) => control === buttonControl.name).borderWidth, expected);
  }
  for (const color of ['black', 'blue']) {
    assert.equal(modules.xmf.toRenderDescriptors(model, { [buttonControl.name]: { dfgcolor: color, enabled: false } }).find(({ control }) => control === buttonControl.name).foregroundColor, color);
  }
  assert.equal(modules.xmf.toRenderDescriptors(model, { [editControl.name]: { caption: 'runtime' } }).find(({ control }) => control === editControl.name).text, 'runtime');
  const baseline = structuredClone(descriptors);
  const labelControl = model.controls.find(({ type }) => type === 'Label');
  for (const state of [
    { Missing: { caption: 'x' } },
    { [labelControl.name]: { caption: 'x' } },
    { [editControl.name]: { unknown: 'x' } },
    { [buttonControl.name]: { border: 'dashed' } },
    { [buttonControl.name]: { dfgcolor: 'red' } },
    { [buttonControl.name]: { dfgcolor: '010:256000000' } },
    { [buttonControl.name]: { enabled: 'false' } }
  ]) {
    assert.throws(() => modules.xmf.toRenderDescriptors(model, state), ({ code }) => code === 'INVALID_PROPERTY');
    assert.deepEqual(modules.xmf.toRenderDescriptors(model), baseline);
  }
  const renderer = read('src/XmfScreen.tsx', 'utf8');
  assert.match(renderer, /TextInput/);
  assert.match(renderer, /Pressable/);
  assert.match(renderer, /toRenderDescriptors\(model,\s*Object\.fromEntries/);
  assert.doesNotMatch(renderer, /runtimeControls\?\.[^\n]*(?:caption|border|dfgcolor|enabled)|state\.properties\.(?:caption|border|dfgcolor|enabled)/);
  assert.doesNotMatch(renderer, /Platform\.(?:OS|select)|requireNativeComponent|HS1200P08|edtGroupNm|btnAdd|btnCancel/);
  for (const descriptor of descriptors) {
    assert.equal(Object.hasOwn(descriptor, 'fontSize'), false);
    assert.equal(Object.hasOwn(descriptor, 'fontWeight'), false);
    assert.equal(Object.hasOwn(descriptor, 'fontStyle'), false);
    assert.equal(Object.hasOwn(descriptor, 'fontFamily'), false);
  }
  return { descriptors: descriptors.length, runtimeTokens: 8, rejectedRuntimeStates: 7, components: ['Text', 'TextInput', 'Pressable'] };
}

function clientGolden(runtimeId = '1') {
  const golden = JSON.parse(expectedGolden);
  golden.snapshot.runtimeId = runtimeId;
  return JSON.stringify(golden);
}

async function runtimeClient() {
  const config = {
    schemaVersion: 1,
    entry: { path: 'fixtures/runtime-conformance.lua', sha256: sourceManifest.resources.find(({ logicalPath }) => logicalPath === 'fixtures/runtime-conformance.lua').sha256 },
    host: { openLinkData: '', sharedData: {}, itemCodeInfo: [] },
    controls: [
      { id: 'Input', type: 'Edit', properties: { caption: 'initial' } },
      { id: 'Action', type: 'Button', properties: { border: 'none', dfgcolor: 'black', enabled: false } }
    ],
    transactions: [{ id: 'T_ALPHA', blocks: [{ id: 'input', fields: ['value'] }, { id: 'output', fields: ['value'] }] }]
  };
  const resultEvent = (runtimeId = '1', revision = '1', mutateResult) => {
    const value = JSON.parse(clientGolden(runtimeId));
    value.snapshot.revision = revision;
    mutateResult?.(value);
    return { runtimeId, canonicalJSON: JSON.stringify(value) };
  };
  const harness = ({ create, dispatch, destroy } = {}) => {
    let listener;
    const evidence = { listenerRemoved: 0, destroyed: 0, dispatched: 0, events: [], serialized: [] };
    const binding = {
      addListener(name, value) {
        assert.equal(name, 'onRuntimeResult');
        listener = value;
        return { remove() { evidence.listenerRemoved += 1; evidence.events.push('listener-remove'); } };
      },
      async create(value) {
        assert.ok(listener, 'listener must precede create');
        JSON.parse(value);
        return create ? create(value) : { code: 'OK', runtimeId: '1', reservedRevision: '0' };
      },
      dispatch(runtimeId, event) {
        evidence.dispatched += 1;
        const parsed = JSON.parse(event);
        evidence.serialized.push(parsed);
        return dispatch ? dispatch(runtimeId, parsed, listener, evidence.dispatched) : { code: 'OK', runtimeId, reservedRevision: String(evidence.dispatched) };
      },
      async destroy(runtimeId) {
        evidence.destroyed += 1;
        evidence.events.push('native-destroy');
        return destroy ? destroy(runtimeId) : { code: 'OK', runtimeId, reservedRevision: '1' };
      }
    };
    return { client: modules.runtimeClient.createRuntimeClient(binding), evidence, get listener() { return listener; } };
  };

  const normal = harness({ dispatch(runtimeId, parsed, listener) {
    listener({ runtimeId, canonicalJSON: clientGolden(runtimeId) });
    return { code: 'OK', runtimeId, reservedRevision: '1' };
  } });
  const client = normal.client;
  assert.equal((await client.create(config)).code, 'OK');
  client.dispatch({ handler: 'Success', arguments: [{ type: 'string', value: 'value' }], controlMutations: [{ control: 'Input', property: 'caption', value: 'value' }] });
  assert.deepEqual(normal.evidence.serialized[0], {
    schemaVersion: 1, kind: 'handler', baseRevision: '0', handler: 'Success', arguments: [{ type: 'string', value: 'value' }],
    controlMutations: [{ id: 'Input', property: 'caption', value: { type: 'string', value: 'value' } }]
  });
  assert.deepEqual(client.getState(), {
    admissionRevision: '1', appliedRevision: '1', snapshot: JSON.parse(expectedGolden).snapshot,
    commands: JSON.parse(expectedGolden).commands, error: undefined
  });
  normal.listener({ runtimeId: '99', canonicalJSON: clientGolden('99') });
  assert.equal(client.getState().appliedRevision, '1');
  await client.destroy();
  await client.destroy();
  assert.equal(normal.evidence.listenerRemoved, 1);
  assert.equal(normal.evidence.destroyed, 1);
  assert.equal(client.dispatch({ handler: 'Success', controlMutations: [] }).code, 'RUNTIME_CLOSED');

  for (const dispatch of [
    () => ({ code: 'STALE_EVENT', runtimeId: '1', reservedRevision: '0' }),
    () => ({ code: 'OK', runtimeId: '99', reservedRevision: '1' }),
    () => { throw new Error('dispatch failure'); }
  ]) {
    const rejected = harness({ dispatch });
    await rejected.client.create(config);
    const before = structuredClone(rejected.client.getState());
    rejected.client.dispatch({ handler: 'Success', controlMutations: [] });
    assert.deepEqual({ ...rejected.client.getState(), error: undefined }, { ...before, error: undefined });
    assert.equal(rejected.client.getState().error, 'DISPATCH_REJECTED');
    await rejected.client.destroy();
  }

  for (const create of [
    () => ({ code: 'INVALID_CONFIG', runtimeId: '0', reservedRevision: '0' }),
    () => { throw new Error('create failure'); }
  ]) {
    const rejected = harness({ create });
    try { await rejected.client.create(config); } catch {}
    assert.equal(rejected.client.getState().error, 'CREATE_REJECTED');
    assert.equal(rejected.evidence.listenerRemoved, 1);
    assert.equal(rejected.evidence.destroyed, 0);
  }

  const wrongRuntime = harness();
  await wrongRuntime.client.create(config);
  wrongRuntime.client.dispatch({ handler: 'Success', controlMutations: [] });
  wrongRuntime.listener(resultEvent('99'));
  assert.equal(wrongRuntime.client.getState().error, undefined);
  assert.equal(wrongRuntime.client.getState().appliedRevision, '0');
  await wrongRuntime.client.destroy();

  const invalidResults = [
    () => null,
    () => ({ runtimeId: '1' }),
    () => ({ runtimeId: '1', canonicalJSON: '{' }),
    () => resultEvent('1', '1', (value) => { value.schemaVersion = 2; }),
    () => resultEvent('1', '2'),
    () => resultEvent('1', '1', (value) => { value.snapshot.status = 'unknown'; }),
    () => resultEvent('1', '1', (value) => { value.snapshot.lifecycle = 'CLOSED'; }),
    () => resultEvent('1', '1', (value) => { value.snapshot.state.controls.Input.type = 'Button'; }),
    () => resultEvent('1', '1', (value) => { value.snapshot.state.controls.Input.properties.unknown = true; }),
    () => resultEvent('1', '1', (value) => { value.commands[0].type = 'unknown'; }),
    () => resultEvent('1', '1', (value) => { value.commands[0].message = 'x'.repeat(262145); }),
    () => ({ runtimeId: '1', canonicalJSON: 'x'.repeat(12 * 1024 * 1024 + 65_537) })
  ];
  for (const hostile of invalidResults) {
    const invalid = harness();
    await invalid.client.create(config);
    invalid.client.dispatch({ handler: 'Success', controlMutations: [] });
    const before = structuredClone(invalid.client.getState());
    invalid.listener(hostile());
    assert.equal(invalid.client.getState().error, 'INVALID_RUNTIME_RESULT');
    assert.deepEqual({ ...invalid.client.getState(), error: undefined }, { ...before, error: undefined });
    await invalid.client.destroy();
    assert.equal(invalid.evidence.destroyed, 1);
    assert.equal(invalid.evidence.listenerRemoved, 1);
  }

  const duplicate = harness();
  await duplicate.client.create(config);
  duplicate.client.dispatch({ handler: 'Success', controlMutations: [] });
  duplicate.listener(resultEvent());
  const applied = structuredClone(duplicate.client.getState());
  duplicate.listener(resultEvent());
  assert.equal(duplicate.client.getState().error, 'INVALID_RUNTIME_RESULT');
  assert.deepEqual({ ...duplicate.client.getState(), error: undefined }, { ...applied, error: undefined });
  await duplicate.client.destroy();

  let releaseDestroy;
  const deferred = harness({ destroy(runtimeId) {
    return new Promise((resolve) => { releaseDestroy = () => resolve({ code: 'OK', runtimeId, reservedRevision: '1' }); });
  } });
  await deferred.client.create(config);
  deferred.listener(null);
  assert.equal(deferred.client.getState().error, 'INVALID_RUNTIME_RESULT');
  await Promise.resolve();
  assert.deepEqual(deferred.evidence.events, ['native-destroy']);
  const pendingDestroy = deferred.client.destroy();
  let settled = false;
  pendingDestroy.finally(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(deferred.evidence.listenerRemoved, 0);
  releaseDestroy();
  await pendingDestroy;
  assert.deepEqual(deferred.evidence.events, ['native-destroy', 'listener-remove']);
  assert.equal(deferred.evidence.destroyed, 1);

  const afterDestroy = harness();
  await afterDestroy.client.create(config);
  const retainedListener = afterDestroy.listener;
  await afterDestroy.client.destroy();
  const closedState = structuredClone(afterDestroy.client.getState());
  retainedListener(resultEvent());
  assert.deepEqual(afterDestroy.client.getState(), closedState);
  await afterDestroy.client.destroy();
  assert.equal(afterDestroy.evidence.destroyed, 1);

  const longEdit = 'E'.repeat(128);
  const longButton = 'B'.repeat(128);
  const maxModel = parses(replaceAll(replaceAll(original, 'edtGroupNm', longEdit), 'btnAdd', longButton));
  const maxHarness = harness();
  await maxHarness.client.create({ ...config, controls: [
    { id: longEdit, type: 'Edit', properties: { caption: '' } },
    { id: longButton, type: 'Button', properties: { border: 'none', dfgcolor: 'black', enabled: true } }
  ] });
  const editEvent = modules.xmf.buildControlEvent(maxModel.controls.find(({ name }) => name === longEdit), 'OnEditComplete', 'v');
  const buttonEvent = modules.xmf.buildControlEvent(maxModel.controls.find(({ name }) => name === longButton), 'OnClick');
  assert.deepEqual([editEvent.handler.length, buttonEvent.handler.length], [143, 136]);
  assert.equal(maxHarness.client.dispatch(editEvent).code, 'OK');
  assert.equal(maxHarness.client.dispatch(buttonEvent).code, 'OK');
  assert.equal(maxHarness.evidence.dispatched, 2);
  await maxHarness.client.destroy();

  const source = read('src/runtime-client.ts', 'utf8');
  assert.doesNotMatch(source, /Request|DATAMANAGER_OnReceive|CCS2000|HS1200P08|\.qry|closeForm\s*\(/);
  return { admissionRevision: '1', appliedRevision: '1', commands: 1, hostileResults: invalidResults.length + 2, maximumDerivedHandlers: 2 };
}

function unseenBytes() {
  let text = generateSyntheticFixture(original).toString('utf8');
  const replacements = [
    ['9907', '8808'], ['SyntheticForm', 'UnseenForm'], ['syntheticTitle', 'freshTitle'],
    ['syntheticPrompt', 'freshPrompt'], ['syntheticInput', 'freshInput'], ['syntheticAccept', 'freshAccept'],
    ['syntheticDismiss', 'freshDismiss'], ['SYN90010', 'NEW80010'], ['SYN90011', 'NEW80011'],
    ['24,8,300,24,1', '30,10,290,26,1']
  ];
  for (const [from, to] of replacements) { assert.ok(text.includes(from)); text = text.replaceAll(from, to); }
  const match = text.match(/\t<CONTROL_INFO>\n([\s\S]*?)\n\t<\/CONTROL_INFO>/);
  assert.ok(match);
  const rows = match[1].split('\n');
  text = text.replace(match[0], `\t<CONTROL_INFO>\n${[rows[1], rows[3], rows[0], rows[4], rows[2], rows[5]].join('\n')}\n\t</CONTROL_INFO>`);
  return Buffer.from(text, 'utf8');
}

function productionHashes() {
  return Object.fromEntries(['src/xmf.ts', 'src/runtime-client.ts', 'src/XmfScreen.tsx', 'App.tsx', 'contracts/control-registry.json']
    .map((file) => [file, sha256(read(file))]));
}

function unseenGenerality() {
  const before = productionHashes();
  const bytes = unseenBytes();
  const file = path.join(temp, 'unseen.xmf_');
  fs.writeFileSync(file, bytes);
  const model = modules.xmf.ingestApprovedXmf({ bytes: fs.readFileSync(file), byteCount: bytes.length, sha256: sha256(bytes) });
  assertModel(model, bytes);
  assert.equal(model.map.screenNumber, '8808');
  assert.equal(model.form.name, 'UnseenForm');
  assert.deepEqual(model.transactionIds.map(({ id }) => id), ['NEW80010', 'NEW80011']);
  assert.ok(model.controls.some(({ name }) => name === 'freshInput'));
  assert.deepEqual(productionHashes(), before);
  return { fixtureSha256: sha256(bytes), productionHashesFrozen: true };
}

function compilerHelpers() {
  const include = ['-I', 'modules/allnewmts-lua/vendor/lua-5.1.5/src', '-I', 'modules/allnewmts-lua/shared'];
  const compile = (compiler, language, source, name, definitions = []) => {
    const object = path.join(temp, `${name}.o`);
    run(compiler, [language, '-Wall', '-Wextra', '-Werror', ...definitions, ...include, '-c', source, '-o', object]);
    return object;
  };
  const c = (source, name, definitions) => compile(process.env.CC || 'cc', '-std=c99', source, name, definitions);
  const cxx = (source, name, definitions) => compile(process.env.CXX || 'c++', '-std=c++17', source, name, definitions);
  const luaObjects = sourceManifest.compiledSources.map((source, index) => {
    const object = path.join(temp, `lua-${index}.o`);
    run(process.env.CC || 'cc', ['-w', '-std=c99', ...include, '-c', `${sourceManifest.vendoredRoot}/${source}`, '-o', object]);
    return object;
  });
  const provider = path.join(temp, 'liblua51.a');
  run('ar', ['rcs', provider, ...luaObjects]);
  const runtimeObjects = [
    cxx('modules/allnewmts-lua/shared/allnewmts_runtime.cpp', 'runtime', ['-DALLNEWMTS_RUNTIME_TESTING']),
    c('modules/allnewmts-lua/shared/allnewmts_runtime_lua.c', 'runtime-lua', ['-DALLNEWMTS_RUNTIME_TESTING']),
    c('modules/allnewmts-lua/shared/allnewmts_runtime_adapters.c', 'runtime-adapters'),
    c('modules/allnewmts-lua/ios/allnewmts_runtime_ios_adapter.c', 'runtime-ios'),
    c('modules/allnewmts-lua/android/allnewmts_runtime_android_adapter.c', 'runtime-android'),
    c('modules/allnewmts-lua/shared/resource_bundle.c', 'resources', ['-DALLNEWMTS_LUA_TESTING']),
    c('modules/allnewmts-lua/shared/sha256.c', 'sha')
  ];
  return { include, provider, runtimeObjects };
}

function filesUnder(directory, suffix) {
  return fs.readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => path.join(entry.parentPath, entry.name)).sort();
}

function moduleStubSmoke() {
  const entryRoot = path.join(temp, 'ordinary-package-entry');
  run('node_modules/.bin/tsc', [
    '--ignoreConfig', '--module', 'commonjs', '--moduleResolution', 'node', '--target', 'es2022',
    '--skipLibCheck', '--noCheck', '--ignoreDeprecations', '6.0', '--outDir', entryRoot, '--rootDir', 'modules/allnewmts-lua/src',
    'modules/allnewmts-lua/src/index.ts', 'modules/allnewmts-lua/src/runtime.ts'
  ]);
  const stubRoot = path.join(entryRoot, 'node_modules/expo-modules-core');
  fs.mkdirSync(stubRoot, { recursive: true });
  fs.writeFileSync(path.join(stubRoot, 'index.js'), `
const requests = [];
const runtime = Object.freeze({ marker: 'ordinary-runtime-stub' });
module.exports = { requests, runtime, requireNativeModule(name) { requests.push(name); return runtime; } };
`);
  const require = createRequire(import.meta.url);
  const stub = require(path.join(stubRoot, 'index.js'));
  const entry = require(path.join(entryRoot, 'index.js'));
  assert.deepEqual(stub.requests, ['AllNewMTSRuntime'], 'ordinary package entry requested an unexpected native module');
  assert.equal(stub.requests.includes('AllNewMTSLua'), false, 'ordinary package entry reached the G002 harness');
  assert.equal(entry.runtime, stub.runtime, 'named runtime export lost the production binding');
  assert.equal(entry.default, entry.runtime, 'default and named runtime exports diverged');
  const packageJson = json('modules/allnewmts-lua/package.json');
  assert.equal(packageJson.main, 'src/index.ts');
  const entrySource = read(`modules/allnewmts-lua/${packageJson.main}`, 'utf8');
  assert.equal(entrySource, "export { runtime, runtime as default } from './runtime';\nexport type { RuntimeAdmission, RuntimeBinding, RuntimeResultEvent } from './runtime';\n");
  assert.match(read('modules/allnewmts-lua/src/runtime.ts', 'utf8'), /requireNativeModule<RuntimeBinding>\('AllNewMTSRuntime'\)/);

  const { include, provider, runtimeObjects } = compilerHelpers();
  const config = JSON.stringify({
    schemaVersion: 1,
    entry: { path: 'fixtures/runtime-conformance.lua', sha256: sourceManifest.resources.find(({ logicalPath }) => logicalPath === 'fixtures/runtime-conformance.lua').sha256 },
    host: { openLinkData: '', sharedData: {}, itemCodeInfo: [] },
    controls: [{ id: 'Input', type: 'Edit', properties: { caption: 'initial' } }, { id: 'Action', type: 'Button', properties: { border: 'none', dfgcolor: 'black', enabled: false } }],
    transactions: [{ id: 'T_ALPHA', blocks: [{ id: 'input', fields: ['value'] }, { id: 'output', fields: ['value'] }] }]
  });
  const event = JSON.stringify({ schemaVersion: 1, kind: 'handler', baseRevision: '0', handler: 'Success', arguments: [{ type: 'string', value: 'value' }], controlMutations: [{ id: 'Input', property: 'caption', value: { type: 'string', value: 'value' } }] });
  const objcAdapter = path.join(temp, 'runtime-objc.o');
  run('xcrun', ['clang++', '-std=c++17', '-fobjc-arc', '-fblocks', '-Wall', '-Wextra', '-Werror', '-I', 'modules/allnewmts-lua/ios', ...include, '-c', 'modules/allnewmts-lua/ios/AllNewMTSRuntimeAdapter.mm', '-o', objcAdapter]);
  const swiftLibrary = path.join(temp, 'libExpoModulesCore.dylib');
  run('xcrun', ['swiftc', '-emit-library', '-emit-module', '-module-name', 'ExpoModulesCore', 'native/test/runtime_swift_expo_stub.swift', '-o', swiftLibrary]);
  const swiftExecutable = path.join(temp, 'g004-swift-module-smoke');
  run('xcrun', ['swiftc', '-I', temp, '-L', temp, '-lExpoModulesCore', '-import-objc-header', 'modules/allnewmts-lua/ios/AllNewMTSRuntimeAdapter.h', 'modules/allnewmts-lua/ios/AllNewMTSRuntimeModule.swift', 'native/test/runtime_swift_module_golden_test.swift', objcAdapter, ...runtimeObjects, provider, '-Xlinker', '-lm', '-Xlinker', '-lc++', '-o', swiftExecutable]);
  const swiftOutput = run(swiftExecutable, [config, event], { env: { ...process.env, DYLD_LIBRARY_PATH: temp } });
  assert.equal(swiftOutput, expectedGolden);

  const javaHome = process.env.JAVA_HOME || '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
  const java = path.join(javaHome, 'bin/java');
  const gradleRoot = path.join(os.homedir(), '.gradle/wrapper/dists/gradle-8.13-bin');
  const compilerJar = filesUnder(gradleRoot, '.jar').find((file) => /gradle-8\.13\/lib\/kotlin-compiler-embeddable-[^/]+\.jar$/.test(file));
  assert.ok(fs.existsSync(java) && compilerJar, 'TOOLCHAIN_BLOCKED: cached Kotlin compiler/JBR unavailable');
  const gradleLib = path.dirname(compilerJar);
  const stdlib = filesUnder(gradleLib, '.jar').find((file) => /kotlin-stdlib-[^/]+\.jar$/.test(file));
  assert.ok(stdlib, 'TOOLCHAIN_BLOCKED: cached Kotlin stdlib unavailable');
  const classes = path.join(temp, 'kotlin-classes');
  fs.mkdirSync(classes);
  const kotlinSources = ['native/test/runtime_android_os_stubs.kt', 'native/test/runtime_expo_kotlin_stubs.kt', ...filesUnder(path.join(root, 'modules/allnewmts-lua/android/src/main/java'), '.kt'), 'native/test/runtime_kotlin_module_golden_test.kt'];
  run(java, ['-cp', `${gradleLib}/*`, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-no-reflect', '-jvm-target', '17', '-classpath', stdlib, '-d', classes, ...kotlinSources]);
  const androidSdk = process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk');
  const jni = path.join(androidSdk, 'ndk/27.1.12297006/toolchains/llvm/prebuilt/darwin-x86_64/sysroot/usr/include');
  assert.ok(fs.existsSync(path.join(jni, 'jni.h')), 'TOOLCHAIN_BLOCKED: Android JNI headers unavailable');
  const jniObject = path.join(temp, 'runtime-jni.o');
  run(process.env.CXX || 'c++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-fPIC', '-idirafter', jni, ...include, '-c', 'modules/allnewmts-lua/android/runtime_jni.cpp', '-o', jniObject]);
  const jniLibrary = path.join(temp, 'liballnewmts_lua.dylib');
  run(process.env.CXX || 'c++', ['-dynamiclib', jniObject, ...runtimeObjects, provider, '-lm', '-pthread', '-o', jniLibrary]);
  const kotlinOutput = run(java, [`-Djava.library.path=${temp}`, '-cp', `${classes}${path.delimiter}${stdlib}`, 'RuntimeKotlinModuleGoldenTest', config, event, expectedGolden]);
  assert.equal(kotlinOutput, expectedGolden);
  assert.match(read('modules/allnewmts-lua/ios/AllNewMTSRuntimeModule.swift', 'utf8'), /create[\s\S]+dispatch[\s\S]+destroy/);
  assert.match(read('modules/allnewmts-lua/android/src/main/java/com/allnewmts/lua/AllNewMTSRuntimeModule.kt', 'utf8'), /create[\s\S]+dispatch[\s\S]+destroy/);
  const javaVersion = spawnSync(java, ['-version'], { encoding: 'utf8' });
  assert.equal(javaVersion.status, 0, 'TOOLCHAIN_BLOCKED: cached JBR is not executable');
  const platforms = fs.readdirSync(path.join(androidSdk, 'platforms')).filter((name) => /^android-[0-9]+$/.test(name)).sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)));
  return {
    ordinaryPackageEntry: { requests: stub.requests, defaultEqualsNamed: entry.default === entry.runtime, namedTypes: ['RuntimeAdmission', 'RuntimeBinding', 'RuntimeResultEvent'] },
    swift: 'PASS',
    kotlin: 'PASS',
    goldenSha256: sha256(expectedGolden),
    toolchain: {
      xcode: run('xcodebuild', ['-version']).split(/\r?\n/)[0],
      swift: run('swift', ['--version']).split(/\r?\n/)[0],
      kotlinCompiler: path.basename(compilerJar).match(/kotlin-compiler-embeddable-(.+)\.jar/)?.[1],
      jbr: (javaVersion.stderr || javaVersion.stdout).trim().split(/\r?\n/)[0],
      androidSdk: platforms.at(-1),
      androidNdk: '27.1.12297006',
      provenance: 'local executable plus offline caches'
    }
  };
}

function assetAndComposition() {
  run('node', ['scripts/generate-g004-assets.mjs', '--check']);
  const generated = read('src/generated/g004-original-xmf.ts', 'utf8');
  const values = [...generated.matchAll(/(?:^|\s)([0-9]{1,3}),/gm)].map((match) => Number(match[1]));
  assert.equal(values.length, 10_179);
  assert.deepEqual(Buffer.from(values), original);
  assert.match(generated, /g004OriginalXmfBytesCount = 10179/);
  assert.match(generated, new RegExp(`g004OriginalXmfSha256 = '${expectedSourceHash}'`));
  const app = read('App.tsx', 'utf8');
  assert.doesNotMatch(app, /readFile|https?:|Platform\.(?:OS|select)|dispatch\s*\(/);
  const ts = createRequire(import.meta.url)('typescript');
  const source = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const nodes = [];
  const visit = (node) => { nodes.push(node); ts.forEachChild(node, visit); };
  visit(source);
  const calls = nodes.filter(ts.isCallExpression);
  const callText = (name) => calls.filter(({ expression }) => expression.getText(source) === name).map((call) => call.arguments.map((argument) => argument.getText(source)));
  assert.deepEqual(callText('createRuntimeClient'), [['runtime']], 'App must pass the exact exported runtime value');
  assert.deepEqual(callText('ingestApprovedXmf'), [['{\n  bytes: g004OriginalXmfBytes,\n  byteCount: g004OriginalXmfBytesCount,\n  sha256: g004OriginalXmfSha256,\n}']], 'App must ingest only the generated approved asset');
  assert.deepEqual(callText('client.create'), [['buildG004AppRuntimeConfig(model)']], 'App must create exactly once from the model-owned config');
  assert.equal(calls.some(({ expression }) => expression.getText(source).endsWith('.dispatch')), false, 'Development Build App must not dispatch');
  const imports = nodes.filter(ts.isImportDeclaration).map((node) => [node.moduleSpecifier.text, node.importClause?.namedBindings?.getText(source)]);
  assert.ok(imports.some(([module, names]) => module === './modules/allnewmts-lua/src' && names === '{ runtime }'));
  assert.ok(imports.some(([module, names]) => module === './src/generated/g004-original-xmf' && names?.includes('g004OriginalXmfBytes') && names.includes('g004OriginalXmfBytesCount') && names.includes('g004OriginalXmfSha256')));
  const builder = nodes.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'buildG004AppRuntimeConfig');
  const returned = builder && nodes.find((node) => node.parent === builder.body && ts.isReturnStatement(node))?.expression;
  assert.ok(returned && ts.isObjectLiteralExpression(returned), 'App config builder must return one object literal');
  const property = (object, name) => object.properties.find((entry) => ts.isPropertyAssignment(entry) && entry.name.getText(source) === name)?.initializer;
  const entry = property(returned, 'entry');
  const host = property(returned, 'host');
  const transactions = property(returned, 'transactions');
  const controls = property(returned, 'controls');
  assert.equal(entry?.getText(source), `{\n      path: 'fixtures/runtime-conformance.lua',\n      sha256: '1e3b642aeda6de9ddbd309df8ac22ee4f3dcce78a8d166caa4e5774f39f82e09',\n    }`);
  assert.equal(host?.getText(source), `{ openLinkData: '', sharedData: {}, itemCodeInfo: [] }`);
  assert.equal(transactions?.getText(source), `[{ id: 'T_ALPHA', blocks: [{ id: 'input', fields: ['value'] }, { id: 'output', fields: ['value'] }] }]`);
  assert.match(controls?.getText(source) ?? '', /^model\.controls\.flatMap/);
  assert.match(controls?.getText(source) ?? '', /case 'Label': return \[\];[\s\S]+case 'Edit':[\s\S]+case 'Button':/);
  return { sourceSha256: expectedSourceHash, generatedBytes: values.length, appAstValueFlow: true, createCalls: callText('client.create').length };
}

function policyCleanup() {
  const packageJson = json('package.json');
  assert.equal(packageJson.scripts['verify:ui'], 'node scripts/verify-ui.mjs');
  assert.equal(fs.existsSync(path.join(root, 'package-lock.json')), true);
  const manifest = json('verification/manifest.json');
  const ui = manifest.focusedChecks.find(({ id }) => id === 'ui');
  assert.deepEqual([ui.activation, ui.owner, ui.argv], ['active', 'G004-build-generic-xmf-ui-path', ['node', 'scripts/verify-ui.mjs']]);
  assert.deepEqual(manifest.stories.find(({ id }) => id.startsWith('G004-')), { id: 'G004-build-generic-xmf-ui-path', activation: 'active', checks: ['ui'], budgetSeconds: 1200 });
  assert.equal(manifest.layers.find(({ id }) => id === 'ui').status, 'active');
  assert.deepEqual(manifest.layers.filter(({ status }) => status === 'deferred').map(({ id }) => id), ['package']);
  assert.equal(manifest.stories.find(({ id }) => id.startsWith('G005-')).activation, 'deferred');
  assert.equal(manifest.stories.find(({ id }) => id.startsWith('G006-')).activation, 'deferred');
  const safeSources = ['src/xmf.ts', 'src/runtime-client.ts', 'src/XmfScreen.tsx', 'App.tsx'];
  const joined = safeSources.map((file) => read(file, 'utf8')).join('\n');
  assert.doesNotMatch(joined, /Platform\.(?:OS|select)|CCS2000[01]|\.qry\b|DATAMANAGER_OnReceive|login|authentication|credential|vendor SDK/i);
  assert.doesNotMatch(joined, /(?:https?|ftp|sftp):\/\//i);
  const rollback = json('test/g004/g003-baseline.json');
  assert.equal(rollback.schemaVersion, 2);
  run('git', ['cat-file', '-e', `${rollback.checkpointCommit}^{commit}`]);
  const status = spawnSync('git', ['status', '--short', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
  assert.equal(status.status, 0, 'could not read rollback working-tree state');
  const changedPaths = status.stdout.trimEnd().split(/\r?\n/).filter(Boolean).map((line) => line.slice(3));
  assert.equal(changedPaths.some((file) => /MVigsEngine/i.test(file)), false, 'AUTHORITY_BLOCKED: DIRECT_MVIGSENGINE_INSPECTION_OR_USE');
  const expectedChanged = [...new Set([...rollback.preG004DirtyPaths, ...rollback.g004RollbackPaths])].sort();
  assert.deepEqual(changedPaths.filter((file) => !expectedChanged.includes(file)).sort(), [], 'dirty tree exceeds recorded G003 baseline plus exact G004 rollback inventory');
  const overlap = rollback.preG004DirtyPaths.filter((file) => rollback.g004RollbackPaths.includes(file)).sort();
  assert.deepEqual(overlap, rollback.sharedPaths.filter((file) => rollback.preG004DirtyPaths.includes(file)).sort(), 'pre-G004 dirty/shared path declaration drift');
  assert.ok(rollback.sharedPaths.every((file) => rollback.g004RollbackPaths.includes(file)), 'shared baseline escapes the selective G004 rollback inventory');
  assert.ok(rollback.preG004DirtyPaths.some((file) => !rollback.sharedPaths.includes(file)), 'G003-only baseline must remain outside rollback');
  assert.deepEqual(rollback.sharedBaselines.map(({ path: file }) => file), rollback.sharedPaths, 'shared baseline order/path drift');
  const rollbackRoot = path.join(temp, 'selective-g004-rollback');
  const contentHashes = {};
  for (const baseline of rollback.sharedBaselines) {
    assert.match(baseline.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isInteger(baseline.byteCount) && baseline.byteCount >= 0);
    assert.ok(Array.isArray(baseline.provenance) && baseline.provenance.length > 0, `missing final-G003 provenance for ${baseline.path}`);
    const bytes = Buffer.from(baseline.contentBase64, 'base64');
    assert.equal(bytes.toString('base64'), baseline.contentBase64, `non-canonical baseline bytes for ${baseline.path}`);
    assert.equal(bytes.length, baseline.byteCount, `baseline byte count drift for ${baseline.path}`);
    assert.equal(sha256(bytes), baseline.sha256, `baseline content hash drift for ${baseline.path}`);
    const target = path.join(rollbackRoot, baseline.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    contentHashes[baseline.path] = sha256(fs.readFileSync(target));
  }
  assert.deepEqual(contentHashes, Object.fromEntries(rollback.sharedBaselines.map(({ path: file, sha256: hash }) => [file, hash])), 'selective G004 rollback did not reproduce final-G003 content hashes');
  const rolledBackPackage = JSON.parse(fs.readFileSync(path.join(rollbackRoot, 'package.json'), 'utf8'));
  const rolledBackManifest = JSON.parse(fs.readFileSync(path.join(rollbackRoot, 'verification/manifest.json'), 'utf8'));
  assert.equal(rolledBackPackage.scripts['verify:ui'], 'node scripts/verify-foundation.mjs deferred ui');
  assert.deepEqual([
    rolledBackManifest.focusedChecks.find(({ id }) => id === 'ui').activation,
    rolledBackManifest.stories.find(({ id }) => id.startsWith('G004-')).activation,
    rolledBackManifest.layers.find(({ id }) => id === 'ui').status
  ], ['deferred', 'deferred', 'deferred']);
  assert.deepEqual(rollback.selectiveRollback, {
    method: 'replace only sharedPaths with decoded contentBase64 bytes, then verify byteCount and sha256',
    preservesPreG004OnlyPaths: true,
    contentHashesRequired: true
  });
  for (const file of rollback.protectedCheckpointPaths) {
    const result = spawnSync('git', ['show', `${rollback.checkpointCommit}:${file}`], { cwd: root, encoding: null, maxBuffer: 100 * 1024 * 1024 });
    assert.equal(result.status, 0, `missing protected checkpoint path ${file}`);
    assert.equal(sha256(read(file)), sha256(result.stdout), `protected checkpoint path drifted: ${file}`);
  }
  assert.deepEqual(rollback.deferredAfterRollback, ['G005', 'G006', 'package']);
  assert.equal(rollback.remoteOrDataMigrationRequired, false);
  assert.equal(fs.existsSync(path.join(root, 'ios')), false);
  assert.equal(fs.existsSync(path.join(root, 'android')), false);
  return {
    cleanup: 'clean', rollback: { checkpoint: rollback.checkpointCommit, paths: rollback.g004RollbackPaths.length, sharedPaths: rollback.sharedPaths.length, contentHashes, remoteOrDataMigrationRequired: false }, g005Executed: false,
    nativeAnalysisPerformed: false, mvigsInspectionPerformed: false, futureConnectivityActivated: false
  };
}

function developmentBuildPhase() {
  const output = run('node', ['scripts/run-g004-development-build.mjs']);
  const line = output.split(/\r?\n/).find((entry) => entry.startsWith('G004_DEVELOPMENT_BUILD='));
  assert.ok(line, 'Development Build emitted no machine-readable result');
  const evidence = JSON.parse(line.slice('G004_DEVELOPMENT_BUILD='.length));
  assert.equal(evidence.developmentBuildInvocations, 1);
  assert.equal(invocationPids.developmentBuild.size, 1);
  return evidence;
}

const work = { 'parser-model': parserModel, 'projection-render': projectionRender, 'runtime-client': runtimeClient, 'unseen-generality': unseenGenerality, 'module-stub-smoke': moduleStubSmoke };
try {
  if (selected) {
    await phase(selected, work[selected]);
  } else {
    const evidence = {};
    evidence.contract = await phase('contract-registry', contractRegistry);
    for (const name of phases) evidence[name] = await phase(name, work[name]);
    evidence.developmentBuild = await phase('development-build', developmentBuildPhase);
    evidence.policy = await phase('policy-cleanup', policyCleanup);
    const uiCommandInvocations = invocationPids.ui.size;
    const developmentBuildInvocations = invocationPids.developmentBuild.size;
    assert.deepEqual([uiCommandInvocations, developmentBuildInvocations], [1, 1]);
    console.log(`G004_UI_SUMMARY=${JSON.stringify({ status: 'PASS', sourceSha256: expectedSourceHash, syntheticSha256: sha256(synthetic), ...evidence, uiCommandInvocations, developmentBuildInvocations })}`);
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
