import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSyntheticFixture } from './generate-synthetic-xmf.mjs';
import { safeRepoFile, validateSchema } from './verify-foundation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const phases = ['parser-model', 'projection-render', 'runtime-client', 'unseen-generality', 'module-stub-smoke', 'ctlimage', 'control-modules'];
const controlModuleFiles = ['button', 'edit', 'image', 'label'].map((name) => `src/controls/${name}.ts`);
const focusedPhases = phases;
const argv = process.argv.slice(2);
const forwardingRegression = argv.length === 1 && argv[0] === '--build-failure-forwarding-regression';
assert.ok(forwardingRegression || argv.length === 0 || (argv.length === 2 && argv[0] === '--phase' && focusedPhases.includes(argv[1])), `usage: node scripts/verify-ui.mjs [--phase ${focusedPhases.join('|')}]`);
const selected = forwardingRegression ? undefined : argv[1];
const read = (file, encoding) => fs.readFileSync(safeRepoFile(file), encoding);
const json = (file) => JSON.parse(read(file, 'utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const buildFailurePrefix = 'ALLNEWMTS_UI_BUILD_FAILURE=';
const buildFailureCommand = 'node scripts/run-ui-development-build.mjs';
const buildFailureEnvelopeSchema = 'allnewmts.ui.build-failure-envelope.v1';
const buildFailureEvidenceSchema = 'allnewmts.ui.build-failure-evidence.v1';
const genericFailureEvidenceSchema = 'allnewmts.ui.generic-failure-evidence.v1';
const buildFailureForwardSchema = 'allnewmts.ui.build-failure-forward.v1';
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
  if (file === 'node' && args[0] === 'scripts/run-ui-development-build.mjs') {
    forwardBuildFailure(result, emit);
    assert.fail(`${buildFailureCommand} failed; bounded evidence forwarded`);
  }
  const diagnostic = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  assert.equal(result.status, 0, `${file} ${args.join(' ')} failed:\n${diagnostic.slice(-20000)}`);
}

function forwardingRegressionEvidence() {
  const child = spawnSync('node', ['scripts/run-ui-development-build.mjs', '--build-failure-marker-transport-child'], {
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
  const writerLine = String(child.stderr ?? '').split(/\r?\n/).find((line) => line.startsWith('UI_BUILD_FAILURE_WRITER_REGRESSION='));
  assert.ok(writerLine, 'build-failure marker child emitted no writer-failure evidence');
  const writerFailure = JSON.parse(writerLine.slice('UI_BUILD_FAILURE_WRITER_REGRESSION='.length));
  const genericChild = spawnSync('node', ['scripts/run-ui-development-build.mjs', '--generic-failure-marker-transport-child'], {
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
  assert.doesNotMatch(genericMarkers[0], /UI_GENERIC_CHILD_SECRET/);
  const genericWriterLine = String(genericChild.stderr ?? '').split(/\r?\n/).find((line) => line.startsWith('UI_GENERIC_FAILURE_WRITER_REGRESSION='));
  assert.ok(genericWriterLine, 'generic failure marker child emitted no writer-failure evidence');
  const genericWriterRegression = JSON.parse(genericWriterLine.slice('UI_GENERIC_FAILURE_WRITER_REGRESSION='.length));
  const { phaseMarkers, ...genericWriterFailure } = genericWriterRegression;
  assert.deepEqual(genericWriterFailure.productionPhases, genericFailurePhases);
  assert.equal(phaseMarkers.length, genericFailurePhases.length);
  const forwardedPhases = phaseMarkers.map((marker, index) => {
    const phase = genericFailurePhases[index];
    assert.equal(validBuildFailureSuffix(marker.slice(buildFailurePrefix.length)), true, phase);
    const emitted = [];
    assert.throws(
      () => assertSuccessfulRun('node', ['scripts/run-ui-development-build.mjs'], { status: 1, signal: null, stdout: marker, stderr: '' }, (line) => emitted.push(line)),
      (error) => error?.message === `${buildFailureCommand} failed; bounded evidence forwarded`,
      phase
    );
    assert.deepEqual(emitted, [marker], phase);
    return JSON.parse(marker.slice(buildFailurePrefix.length)).buildFailureEvidence.phase;
  });
  assert.deepEqual(forwardedPhases, genericFailurePhases);
  const genericForwarded = [];
  assert.throws(
    () => assertSuccessfulRun('node', ['scripts/run-ui-development-build.mjs'], genericChild, (line) => genericForwarded.push(line)),
    (error) => error?.message === `${buildFailureCommand} failed; bounded evidence forwarded`
  );
  assert.deepEqual(genericForwarded, genericMarkers);
  const forwarded = [];
  assert.throws(
    () => assertSuccessfulRun('node', ['scripts/run-ui-development-build.mjs'], child, (line) => {
      forwarded.push(line);
      emitBuildFailureMarker(line);
    }),
    (error) => error?.message === `${buildFailureCommand} failed; bounded evidence forwarded`
  );
  assert.deepEqual(forwarded, [producerMarker]);
  const secret = 'UI_FORWARDING_PLANTED_SECRET';
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
    ['generic-unknown-schema', `${buildFailurePrefix}${envelopeForEvidence({ ...genericEvidence, schema: 'allnewmts.ui.unknown.v1' })}`],
    ['generic-extra-key', `${buildFailurePrefix}${envelopeForEvidence({ ...genericEvidence, secret })}`],
    ['generic-invalid-code', `${buildFailurePrefix}${envelopeForEvidence({ ...genericEvidence, errorCode: 'UI_FORWARDING_PLANTED_SECRET' })}`],
    ['generic-unknown-phase', `${buildFailurePrefix}${envelopeForEvidence({ ...genericEvidence, phase: 'unknown-phase' })}`],
    ['generic-oversize', `${buildFailurePrefix}${envelopeForEvidence({ ...genericEvidence, errorName: 'A'.repeat(genericFailureEvidenceCap + 1) })}`]
  ];
  for (const [name, stdout] of cases) {
    const emitted = [];
    assert.throws(
      () => assertSuccessfulRun('node', ['scripts/run-ui-development-build.mjs'], { status: 1, signal: null, stdout, stderr: secret }, (line) => emitted.push(line)),
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
  const output = `UI_BUILD_FAILURE_FORWARDING_REGRESSION=${canonicalJson(evidence)}\n`;
  await new Promise((resolve, reject) => process.stdout.write(output, (error) => error ? reject(error) : resolve()));
  process.exit(0);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'allnewmts-ui-verifier-'));
const originalPath = 'test/oracles/sources/mts_screen/HS1200P08.xmf_';
const syntheticPath = 'test/oracles/synthetic/renamed-reordered.xmf_';
const expectedSourceHash = '4d63ba22ac5339cfd3068cffa91710e0099481da81d974e2aff0ce7ae39ed53e';
const sourceManifest = json('native/lua-source-manifest.json');
const expectedGolden = read('test/ui/runtime-client-golden.json', 'utf8').trim();
const independentGrammar = Object.freeze([
  { parent: 'document', order: 1, tag: 'ROOT', form: 'paired', cardinality: '1', required: [], optional: [], body: 'MAP_INFO,FORM_INFO,CONTROL_INFO,SCRIPT_INFO,DATAIO_INFO; no trailing data' },
  { parent: 'ROOT', order: 1, tag: 'MAP_INFO', form: 'self', cardinality: '1', required: ['scrno', 'scrname', 'version', 'writer', 'scrtype', 'scripttype'], optional: [], body: 'token/text/decimal metadata bounds' },
  { parent: 'ROOT', order: 2, tag: 'FORM_INFO', form: 'self', cardinality: '1', required: ['name', 'bgcolor', 'ly_vert'], optional: [], body: 'identifier,encoded-color,layout' },
  { parent: 'ROOT', order: 3, tag: 'CONTROL_INFO', form: 'paired', cardinality: '1', required: [], optional: [], body: 'five base controls plus 0..64 IMAGE in arbitrary order then TABORDER_INFO; unique names' },
  { parent: 'CONTROL_INFO', order: 1, tag: 'LABEL', form: 'self', cardinality: '2', required: ['name', 'caption', 'ly_vert'], optional: ['fontsize', 'fontstyle'], body: 'identifier,text<=2048,registry projection' },
  { parent: 'CONTROL_INFO', order: 1, tag: 'EDIT', form: 'self', cardinality: '1', required: ['name', 'hintcaption', 'imetype', 'maxlength', 'leadheight', 'paddinginfo', 'ly_vert'], optional: ['caption'], body: 'identifier,text<=2048,registry projection' },
  { parent: 'CONTROL_INFO', order: 1, tag: 'BUTTON', form: 'self', cardinality: '2', required: ['name', 'caption', 'fgcolor', 'fontsize', 'ly_vert'], optional: ['enable', 'bgcolor', 'bordersize'], body: 'identifier,text<=2048,registry projection' },
  { parent: 'CONTROL_INFO', order: 1, tag: 'IMAGE', form: 'self', cardinality: '0..64', required: ['name', 'ly_vert'], optional: ['imgpath', 'imagetarget', 'defaultimg', 'visible', 'enable', 'autosize', 'circle', 'bgcolor', 'borderradius', 'border', 'bordersize', 'tmpdnfiledel'], body: 'canonical Image owner; exact provider keys and flat layout' },
  { parent: 'CONTROL_INFO', order: 2, tag: 'TABORDER_INFO', form: 'self', cardinality: '1', required: ['horz', 'vert'], optional: [], body: 'backtick list 1..5; unique declared Edit/Button; <=644 bytes' },
  { parent: 'ROOT', order: 4, tag: 'SCRIPT_INFO', form: 'paired', cardinality: '1', required: ['_len', '_ulen'], optional: [], body: 'opaque 0..2097152 bytes; exact single close' },
  { parent: 'ROOT', order: 5, tag: 'DATAIO_INFO', form: 'paired', cardinality: '1', required: [], optional: [], body: 'TRID_INFO then TRIO_INFO' },
  { parent: 'DATAIO_INFO', order: 1, tag: 'TRID_INFO', form: 'paired', cardinality: '1', required: [], optional: [], body: 'two self-closing TRAN; unique tranid' },
  { parent: 'TRID_INFO', order: 1, tag: 'TRAN', form: 'self', cardinality: '2', required: ['tranid', 'trcode', 'encryption', 'useattr'], optional: [], body: 'identifier/token/decimal metadata' },
  { parent: 'DATAIO_INFO', order: 2, tag: 'TRIO_INFO', form: 'paired', cardinality: '1', required: [], optional: [], body: 'two paired TRAN; names equal TRID_INFO set' },
  { parent: 'TRIO_INFO', order: 1, tag: 'TRAN', form: 'paired', cardinality: '2', required: ['name', 'title', 'realdata', 'dessvr', 'occurslen', 'memfieldlen'], optional: [], body: 'four TRBLOCK: two in/two out and one occurs=1 per direction' },
  { parent: 'TRIO_INFO/TRAN', order: 1, tag: 'TRBLOCK', form: 'paired', cardinality: '4 each/8 total', required: ['name', 'inout', '_len', '_ulen'], optional: ['occurs'], body: 'opaque 1..262144; LF xor CRLF; 1..1024 unique identifier^ rows; first close wins' }
]);
const invocationPids = { ui: new Set([process.pid]) };

function run(file, args, options = {}) {
  const result = spawnSync(file, args, { cwd: root, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024, ...options });
  assert.equal(result.error, undefined, `${file} could not start: ${result.error?.message}`);
  assertSuccessfulRun(file, args, result);
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
  console.log(JSON.stringify({ event: 'UI_PHASE_START', phase: name }));
  return Promise.resolve(work()).then((evidence) => {
    console.log(JSON.stringify({ event: 'UI_PHASE_END', phase: name, status: 'PASS', durationMs: Math.round(performance.now() - started), ...evidence }));
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
    images: model.controls.filter(({ type }) => type === 'Image').length,
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
  assert.deepEqual(summary(model), { forms: 1, labels: 2, edits: 1, buttons: 2, images: 0, transactionIds: 2, transactions: 2, blocks: 8 });
  assert.deepEqual(Buffer.from(model.script.bytes), Buffer.from(scriptSlice(source)));
  assert.ok(Buffer.from(model.script.bytes).includes(Buffer.from('&USER_ID')));
  assert.ok(Object.isFrozen(model) && Object.isFrozen(model.controls) && Object.isFrozen(model.transactions));
  assert.ok(model.transactions.every(({ blocks }) => blocks.length === 4));
}

function contractRegistry() {
  const registry = json('contracts/control-registry.json');
  validateSchema(json('contracts/control-registry.schema.json'), registry, 'UI control registry');
  assert.deepEqual(registry.inputRoles.map(({ name, decision, diagnostic }) => [name, decision, diagnostic]), [
    ['XMF', 'include', null], ['XMS', 'unsupported', 'UNSUPPORTED_INPUT_ROLE']
  ]);
  assert.deepEqual(registry.controls.filter(({ decision }) => decision === 'include').map(({ normalizedType }) => normalizedType), ['Label', 'Edit', 'Button', 'Image']);
  const image = registry.controls.find(({ normalizedType }) => normalizedType === 'Image');
  assert.equal(image.maxPerScope, 64);
  assert.deepEqual(image.properties.map(({ name }) => name), [
    'name', 'imgpath', 'imagetarget', 'defaultimg', 'visible', 'enable', 'autosize', 'circle',
    'bgcolor', 'borderradius', 'border', 'bordersize', 'tmpdnfiledel', 'ly_vert'
  ]);
  assert.deepEqual(image.mutableProperties, ['imgpath', 'imagetarget', 'visible', 'enable', 'left', 'top', 'width', 'height', 'autosize', 'circle']);
  assert.deepEqual(image.events, [{ name: 'OnClick', handlerSuffix: '_OnClick', controlMutations: [] }]);
  assert.ok(image.capabilities.includes('image-provider-target') && image.capabilities.includes('accessibility-button'));
  assert.equal(image.migration.candidates.length, 53);
  assert.equal(new Set(image.migration.candidates.map(({ kind, name }) => `${kind}:${name}`)).size, 53);
  const candidate = (kind, name) => image.migration.candidates.find((item) => item.kind === kind && item.name === name);
  assert.deepEqual([candidate('method', 'SetCircleBorder').decision, candidate('property', 'circleborder').decision], ['unsupported', 'unsupported']);
  assert.deepEqual([0, 1, 2, 3].map((target) => candidate('resource-mode', `${target}-${['local', 'http-link', 'http-direct', 'temporary'][target]}`).decision), ['include', 'include', 'include', 'include']);
  assert.equal(candidate('resource-mode', '4-ci').decision, 'unsupported');
  assert.deepEqual(registry.controls.flatMap(({ events }) => events.map(({ name, handlerSuffix }) => [name, handlerSuffix])), [
    ['OnEditComplete', '_OnEditComplete'], ['OnClick', '_OnClick'], ['OnClick', '_OnClick']
  ]);
  assert.equal(new Set(registry.policies.map(({ id }) => id)).size, registry.policies.length);
  const parserSource = read('src/xmf.ts', 'utf8');
  assert.doesNotMatch(parserSource, /export\s+(?:const|let|var)\s+.*(?:grammar|policy)/i, 'parser must not export a shadow grammar/policy table');
  const contract = read('docs/specs/xmf-lua-runtime.md', 'utf8');
  const imageContract = read('docs/specs/controls/image.md', 'utf8');
  assert.equal(new Set(independentGrammar.map(({ parent, tag, form }) => `${parent}:${tag}:${form}`)).size, independentGrammar.length);
  for (const row of independentGrammar) {
    const owner = row.tag === 'IMAGE' ? `${contract}\n${imageContract}` : contract;
    assert.ok(owner.includes(`\`${row.tag}\``), `canonical grammar omits ${row.tag}`);
    assert.ok(['paired', 'self'].includes(row.form) && row.order > 0 && row.cardinality && row.body);
    for (const attribute of [...row.required, ...row.optional]) assert.ok(owner.includes(`\`${attribute}\``), `canonical grammar omits ${row.tag}.${attribute}`);
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
  assert.equal(safeRepoFile(approvedName, 'UI integrity', integrityRoot), fs.realpathSync.native(path.join(integrityRoot, approvedName)));
  for (const hostile of [`../${outsideName}`, path.join(path.sep, 'tmp', outsideName), linkName]) assert.throws(() => safeRepoFile(hostile, 'UI integrity', integrityRoot));
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
  assert.deepEqual(descriptors.map(({ component }) => component), model.controls.map(({ type }) => ({ Label: 'Text', Edit: 'TextInput', Button: 'Pressable', Image: 'Image' })[type]));
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
  const screen = read('src/XmfScreen.tsx', 'utf8');
  const renderer = read('src/controls/ControlView.tsx', 'utf8');
  assert.match(renderer, /TextInput/);
  assert.match(renderer, /Pressable/);
  assert.match(screen, /toRenderDescriptors\(model,\s*Object\.fromEntries/);
  assert.match(screen, /<ControlView /);
  assert.doesNotMatch(`${screen}\n${renderer}`, /runtimeControls\?\.[^\n]*(?:caption|border|dfgcolor|enabled)|state\.properties\.(?:caption|border|dfgcolor|enabled)/);
  assert.doesNotMatch(`${screen}\n${renderer}`, /Platform\.(?:OS|select)|requireNativeComponent|HS1200P08|edtGroupNm|btnAdd|btnCancel/);
  for (const descriptor of descriptors) {
    assert.equal(Object.hasOwn(descriptor, 'fontSize'), false);
    assert.equal(Object.hasOwn(descriptor, 'fontWeight'), false);
    assert.equal(Object.hasOwn(descriptor, 'fontStyle'), false);
    assert.equal(Object.hasOwn(descriptor, 'fontFamily'), false);
  }
  return { descriptors: descriptors.length, runtimeTokens: 8, rejectedRuntimeStates: 7, components: ['Text', 'TextInput', 'Pressable'] };
}

function ctlImage() {
  const contract = read('docs/specs/controls/image.md', 'utf8');
  for (const heading of [
    '# Image control contract',
    '## Parsing and normalized model',
    '## Resource resolution',
    '## Runtime behavior',
    '## Rendering and accessibility',
    '## Diagnostics and atomicity',
    '## Security boundary and unsupported behavior',
    '## Verification'
  ]) assert.ok(contract.includes(heading), `Image canonical owner omits ${heading}`);
  for (const boundary of ['<IMAGE>', '<CTLIMAGE>', 'SetCircleBorder', 'UNSUPPORTED_INPUT_ROLE', 'UNSUPPORTED_CONTROL_TYPE', 'INVALID_STRUCTURE', 'INVALID_PROPERTY', 'HOST_ARGUMENT_ERROR', 'HOST_LOOKUP_MISS', 'UNRESOLVED_IMAGE_RESOURCE', 'resizeMode="contain"']) {
    assert.ok(contract.includes(boundary), `Image canonical owner omits ${boundary}`);
  }
  const row = '<IMAGE name="imgStatus" imgpath="https://example.invalid/icon" imagetarget="2" defaultimg="fallback" visible="0" enable="0" autosize="1" circle="1" bgcolor="010:001002003" borderradius="7" border="1" bordersize="2" tmpdnfiledel="1" ly_vert="-4,8,16,20,0" />';
  const blankRow = '<IMAGE name="imgBlank" ly_vert="20,8,16,20,1" />';
  const bytes = mutate(original, '\t\t<TABORDER_INFO', `\t\t${row}\r\n\t\t${blankRow}\r\n\t\t<TABORDER_INFO`);
  const model = parses(bytes);
  assert.deepEqual(summary(model), { forms: 1, labels: 2, edits: 1, buttons: 2, images: 2, transactionIds: 2, transactions: 2, blocks: 8 });
  const image = model.controls.find(({ type }) => type === 'Image');
  assert.deepEqual(image, {
    type: 'Image',
    name: 'imgStatus',
    imageResource: 'https://example.invalid/icon',
    imageTarget: 2,
    defaultImageResource: 'fallback',
    visible: false,
    enabled: false,
    autosize: true,
    circle: true,
    backgroundColor: { source: '010:001002003', prefix: '010', value: 'rgb(1,2,3)' },
    borderRadius: 7,
    layout: { left: -4, top: 8, width: 16, height: 20 }
  });
  assert.ok(Object.isFrozen(image) && Object.isFrozen(image.layout));
  assert.deepEqual(model.controls.find(({ name }) => name === 'imgBlank'), {
    type: 'Image', name: 'imgBlank', imageResource: '', imageTarget: 0, defaultImageResource: '',
    visible: true, enabled: true, autosize: false, circle: false, borderRadius: 0,
    layout: { left: 20, top: 8, width: 16, height: 20 }
  });
  assert.deepEqual(model.warnings.filter(({ normalizedType }) => normalizedType === 'Image'), [
    { code: 'UNSUPPORTED_IMAGE_PRESENTATION', normalizedType: 'Image', property: 'border' },
    { code: 'UNSUPPORTED_IMAGE_PRESENTATION', normalizedType: 'Image', property: 'bordersize' },
    { code: 'UNSUPPORTED_IMAGE_METADATA', normalizedType: 'Image', property: 'tmpdnfiledel' }
  ]);
  const descriptor = modules.xmf.toRenderDescriptors(model).find(({ control }) => control === 'imgStatus');
  assert.deepEqual(descriptor, {
    key: 'imgStatus',
    control: 'imgStatus',
    component: 'Image',
    imageResource: 'https://example.invalid/icon',
    imageTarget: 2,
    defaultImageResource: 'fallback',
    visible: false,
    enabled: false,
    resizeMode: 'stretch',
    circle: true,
    backgroundColor: 'rgb(1,2,3)',
    borderWidth: 0,
    borderRadius: 7,
    style: { left: -4, top: 8, width: 16, height: 20 },
    accessibilityLabel: 'imgStatus',
    accessibilityRole: 'button',
    event: 'OnClick'
  });
  const runtime = modules.xmf.toRenderDescriptors(model, { imgStatus: {
    imgpath: 'runtime-key', imagetarget: 3, visible: true, enabled: true,
    left: -8, top: 12, width: 0, height: 48, autosize: false, circle: false
  } }).find(({ control }) => control === 'imgStatus');
  assert.deepEqual({
    imageResource: runtime.imageResource, imageTarget: runtime.imageTarget, visible: runtime.visible, enabled: runtime.enabled,
    resizeMode: runtime.resizeMode, circle: runtime.circle, borderRadius: runtime.borderRadius, style: runtime.style
  }, {
    imageResource: 'runtime-key', imageTarget: 3, visible: true, enabled: true,
    resizeMode: 'contain', circle: false, borderRadius: 0, style: { left: -8, top: 12, width: 0, height: 48 }
  });
  assert.deepEqual(modules.xmf.buildControlEvent(image, 'OnClick'), {
    handler: 'imgStatus_OnClick', controlMutations: []
  });
  const baseline = structuredClone(modules.xmf.toRenderDescriptors(model));
  for (const state of [
    { imgStatus: { imagetarget: 4 } },
    { imgStatus: { visible: 0 } },
    { imgStatus: { left: -8193 } },
    { imgStatus: { width: -1 } },
    { imgStatus: { imgpath: 'x'.repeat(2049) } },
    { imgStatus: { unknown: true } }
  ]) {
    assert.throws(() => modules.xmf.toRenderDescriptors(model, state), ({ code }) => code === 'INVALID_PROPERTY');
    assert.deepEqual(modules.xmf.toRenderDescriptors(model), baseline);
  }
  parses(mutate(bytes, 'imgpath="https://example.invalid/icon"', 'imgpath=""'));
  parses(mutate(bytes, 'imgpath="https://example.invalid/icon"', `imgpath="${'x'.repeat(2048)}"`));
  for (const [invalid, code] of [
    [mutate(bytes, 'imgpath="https://example.invalid/icon"', `imgpath="${'x'.repeat(2049)}"`), 'INVALID_PROPERTY'],
    [mutate(bytes, 'imagetarget="2"', 'imagetarget="4"'), 'INVALID_PROPERTY'],
    [mutate(bytes, 'visible="0"', 'visible="1"'), 'INVALID_PROPERTY'],
    [mutate(bytes, 'borderradius="7"', 'borderradius="8193"'), 'INVALID_PROPERTY'],
    [mutate(bytes, 'ly_vert="-4,8,16,20,0"', 'ly_vert="-0,8,16,20,0"'), 'INVALID_PROPERTY'],
    [mutate(bytes, 'ly_vert="-4,8,16,20,0"', 'ly_vert="-4,8,0,20,0"'), 'INVALID_PROPERTY'],
    [mutate(bytes, ' ly_vert="-4,8,16,20,0"', ' unknown="1" ly_vert="-4,8,16,20,0"'), 'INVALID_STRUCTURE'],
    [mutate(bytes, ' ly_vert="-4,8,16,20,0"', ' circleborder="1" ly_vert="-4,8,16,20,0"'), 'INVALID_STRUCTURE'],
    [mutate(bytes, 'name="imgStatus"', 'name="lbl0"'), 'INVALID_STRUCTURE'],
    [mutate(bytes, 'name="imgBlank"', 'name="imgStatus"'), 'INVALID_STRUCTURE']
  ]) rejects(invalid, code);
  const rows = (count) => Array.from({ length: count }, (_, index) => `\t\t<IMAGE name="img${index}" ly_vert="0,0,1,1,1" />`).join('\r\n');
  parses(mutate(original, '\t\t<TABORDER_INFO', `${rows(64)}\r\n\t\t<TABORDER_INFO`));
  rejects(mutate(original, '\t\t<TABORDER_INFO', `${rows(65)}\r\n\t\t<TABORDER_INFO`), 'INVALID_STRUCTURE');
  const screen = read('src/XmfScreen.tsx', 'utf8');
  const renderer = read('src/controls/ControlView.tsx', 'utf8');
  assert.match(screen, /<ControlView /);
  assert.match(renderer, /ImageSourcePropType/);
  assert.match(renderer, /Object\.hasOwn\(imageSources, target\)/);
  assert.match(renderer, /Object\.hasOwn\(bucket, resource\)/);
  assert.match(renderer, /Object\.hasOwn\(imageSources, 0\)/);
  assert.match(renderer, /Object\.hasOwn\(local, fallback\)/);
  assert.match(renderer, /if \(descriptor\.visible === false\) return null/);
  assert.match(renderer, /left: \(descriptor\.style\.width - size\) \/ 2/);
  assert.match(renderer, /top: \(descriptor\.style\.height - size\) \/ 2/);
  assert.match(renderer, /accessibilityState=\{\{ disabled: !enabled \}\}/);
  assert.match(renderer, /accessible=\{false\}/);
  assert.match(renderer, /UNRESOLVED_IMAGE_RESOURCE/);
  assert.doesNotMatch(renderer, /source=\{\{\s*uri:|(?:https?|ftp|sftp):\/\//i);
  return { fixtureSha256: sha256(bytes), imageControls: 2, maximumImages: 64, negativeCases: 17, runtimeProperties: 10, events: 1, remoteOperations: 0 };
}

function controlModules() {
  const types = read('src/controls/types.ts', 'utf8');
  assert.match(types, /interface ControlModule<T extends XmfControl>/);
  const expected = [
    ['button', 'ButtonControl', 'Button'],
    ['edit', 'EditControl', 'Edit'],
    ['image', 'ImageControl', 'Image'],
    ['label', 'LabelControl', 'Label']
  ];
  for (const [file, controlType, normalizedType] of expected) {
    const source = read(`src/controls/${file}.ts`, 'utf8');
    assert.match(source, new RegExp(`ControlModule<${controlType}>`));
    assert.match(source, new RegExp(`type: '${normalizedType}'`));
    assert.match(source, /create:/);
    assert.match(source, /project:/);
    assert.doesNotMatch(source, /Platform\.(?:OS|select)|require\(|import\(|readdir|glob|(?:https?|ftp|sftp):\/\//i);
  }
  const dispatch = read('src/controls/index.ts', 'utf8');
  for (const [file, , normalizedType] of expected) {
    assert.match(dispatch, new RegExp(`from './${file}'`));
    assert.equal((dispatch.match(new RegExp(`case '${normalizedType}'`, 'g')) ?? []).length, 2);
  }
  assert.doesNotMatch(dispatch, /require\(|import\(|readdir|glob|Platform\.(?:OS|select)/);
  const parser = read('src/xmf.ts', 'utf8');
  assert.match(parser, /return createControl\(descriptor\.normalizedType,/);
  assert.match(parser, /projectControl\(control, normalized\.get\(control\.name\) \?\? \{\}\)/);
  assert.doesNotMatch(parser, /descriptor\.normalizedType === '(?:Label|Edit|Button|Image)'/);
  const screen = read('src/XmfScreen.tsx', 'utf8');
  assert.match(screen, /<ControlView key=\{descriptor\.key\}/);
  assert.doesNotMatch(screen, /<(?:Text|TextInput|Pressable|Image)\b|switch \(descriptor\.component\)/);

  const model = parses(original);
  assert.deepEqual(summary(model), { forms: 1, labels: 2, edits: 1, buttons: 2, images: 0, transactionIds: 2, transactions: 2, blocks: 8 });
  assert.deepEqual(modules.xmf.toRenderDescriptors(model).map(({ component }) => component), ['Text', 'Text', 'TextInput', 'Pressable', 'Pressable']);
  const imageBytes = mutate(original, '\t\t<TABORDER_INFO', '\t\t<IMAGE name="imgStatus" imgpath="icon_status" ly_vert="0,0,16,16,1" />\r\n\t\t<TABORDER_INFO');
  const imageModel = parses(imageBytes);
  assert.deepEqual(imageModel.controls.find(({ type }) => type === 'Image'), {
    type: 'Image', name: 'imgStatus', imageResource: 'icon_status', imageTarget: 0, defaultImageResource: '',
    visible: true, enabled: true, autosize: false, circle: false, borderRadius: 0,
    layout: { left: 0, top: 0, width: 16, height: 16 }
  });
  assert.equal(modules.xmf.toRenderDescriptors(imageModel).find(({ control }) => control === 'imgStatus').component, 'Image');
  return { modules: expected.length, explicitCreateCases: expected.length, explicitProjectionCases: expected.length, reactNativeBoundaries: 1, dynamicRegistrations: 0, osSelections: 0 };
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
  const delayed = harness({ destroy(runtimeId) {
    return new Promise((resolve) => { releaseDestroy = () => resolve({ code: 'OK', runtimeId, reservedRevision: '1' }); });
  } });
  await delayed.client.create(config);
  delayed.listener(null);
  assert.equal(delayed.client.getState().error, 'INVALID_RUNTIME_RESULT');
  await Promise.resolve();
  assert.deepEqual(delayed.evidence.events, ['native-destroy']);
  const pendingDestroy = delayed.client.destroy();
  let settled = false;
  pendingDestroy.finally(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(delayed.evidence.listenerRemoved, 0);
  releaseDestroy();
  await pendingDestroy;
  assert.deepEqual(delayed.evidence.events, ['native-destroy', 'listener-remove']);
  assert.equal(delayed.evidence.destroyed, 1);

  const afterDestroy = harness();
  await afterDestroy.client.create(config);
  const retainedListener = afterDestroy.listener;
  await afterDestroy.client.destroy();
  const closedState = structuredClone(afterDestroy.client.getState());
  retainedListener(resultEvent());
  assert.deepEqual(afterDestroy.client.getState(), closedState);
  await afterDestroy.client.destroy();
  assert.equal(afterDestroy.evidence.destroyed, 1);

  const imageGolden = json('native/test/image-runtime-golden.json');
  const imageConfig = {
    ...config,
    entry: { path: 'fixtures/image-runtime.lua', sha256: sourceManifest.resources.find(({ logicalPath }) => logicalPath === 'fixtures/image-runtime.lua').sha256 },
    controls: [{ id: 'Hero', type: 'Image', properties: {
      imgpath: 'initial', imagetarget: 0, visible: true, enabled: true,
      left: -4, top: 8, width: 32, height: 24, autosize: false, circle: false
    } }],
    transactions: []
  };
  const imageHarness = harness({ dispatch(runtimeId, parsed, listener) {
    assert.equal(parsed.handler, 'ImageState');
    listener({ runtimeId, canonicalJSON: JSON.stringify(imageGolden) });
    return { code: 'OK', runtimeId, reservedRevision: '1' };
  } });
  await imageHarness.client.create(imageConfig);
  assert.equal(imageHarness.client.dispatch({ handler: 'ImageState', controlMutations: [] }).code, 'OK');
  assert.deepEqual(imageHarness.client.getState().snapshot.state.controls.Hero, imageGolden.snapshot.state.controls.Hero);
  await imageHarness.client.destroy();

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
  return { admissionRevision: '1', appliedRevision: '1', commands: 1, imageRuntimeState: true, hostileResults: invalidResults.length + 2, maximumDerivedHandlers: 2 };
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
  return Object.fromEntries(['src/xmf.ts', 'src/runtime-client.ts', 'src/XmfScreen.tsx', 'src/controls/ControlView.tsx', ...controlModuleFiles, 'src/controls/index.ts', 'src/controls/types.ts', 'App.tsx', 'contracts/control-registry.json']
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
  assert.equal(stub.requests.includes('AllNewMTSLua'), false, 'ordinary package entry reached the NATIVE_HARNESS harness');
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
  const swiftExecutable = path.join(temp, 'ui-swift-module-smoke');
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
  run('node', ['scripts/generate-xmf-assets.mjs', '--check']);
  const generated = read('src/generated/approved-xmf.ts', 'utf8');
  const values = [...generated.matchAll(/(?:^|\s)([0-9]{1,3}),/gm)].map((match) => Number(match[1]));
  assert.equal(values.length, 10_179);
  assert.deepEqual(Buffer.from(values), original);
  assert.match(generated, /approvedXmfBytesCount = 10179/);
  assert.match(generated, new RegExp(`approvedXmfSha256 = '${expectedSourceHash}'`));
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
  assert.deepEqual(callText('ingestApprovedXmf'), [['{\n  bytes: approvedXmfBytes,\n  byteCount: approvedXmfBytesCount,\n  sha256: approvedXmfSha256,\n}']], 'App must ingest only the generated approved asset');
  assert.deepEqual(callText('client.create'), [['buildAppRuntimeConfig(model)']], 'App must create exactly once from the model-owned config');
  assert.equal(calls.some(({ expression }) => expression.getText(source).endsWith('.dispatch')), false, 'Development Build App must not dispatch');
  const imports = nodes.filter(ts.isImportDeclaration).map((node) => [node.moduleSpecifier.text, node.importClause?.namedBindings?.getText(source)]);
  assert.ok(imports.some(([module, names]) => module === './modules/allnewmts-lua/src' && names === '{ runtime }'));
  assert.ok(imports.some(([module, names]) => module === './src/generated/approved-xmf' && names?.includes('approvedXmfBytes') && names.includes('approvedXmfBytesCount') && names.includes('approvedXmfSha256')));
  const builder = nodes.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'buildAppRuntimeConfig');
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
  assert.match(controls?.getText(source) ?? '', /case 'Label': return \[\];[\s\S]+case 'Edit':[\s\S]+case 'Button':[\s\S]+case 'Image': return \[\{/);
  return { sourceSha256: expectedSourceHash, generatedBytes: values.length, appAstValueFlow: true, createCalls: callText('client.create').length };
}

const work = { 'parser-model': parserModel, 'projection-render': projectionRender, 'runtime-client': runtimeClient, 'unseen-generality': unseenGenerality, 'module-stub-smoke': moduleStubSmoke, ctlimage: ctlImage, 'control-modules': controlModules };
try {
  if (selected) {
    await phase(selected, work[selected]);
  } else {
    const evidence = {};
    evidence.contract = await phase('contract-registry', contractRegistry);
    for (const name of phases) evidence[name] = await phase(name, work[name]);
    const uiCommandInvocations = invocationPids.ui.size;
    assert.equal(uiCommandInvocations, 1);
    console.log(`UI_SUMMARY=${JSON.stringify({ status: 'PASS', sourceSha256: expectedSourceHash, syntheticSha256: sha256(synthetic), ...evidence, uiCommandInvocations })}`);
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
