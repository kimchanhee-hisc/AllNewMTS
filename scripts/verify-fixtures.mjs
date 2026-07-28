import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSyntheticFixture } from './generate-synthetic-xmf.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const realRoot = fs.realpathSync.native(root);
const read = (file) => fs.readFileSync(safePath(file));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const json = (file) => JSON.parse(read(file).toString('utf8'));
const manifest = json('test/oracles/manifest.json');
const git = (repository, args, encoding = 'utf8') => {
  const output = execFileSync('git', ['-C', repository, ...args], { encoding });
  return typeof output === 'string' ? output.trim() : output;
};

function assertContained(base, candidate, label) {
  const realBase = fs.realpathSync.native(base);
  const realCandidate = fs.realpathSync.native(candidate);
  assert.ok(realCandidate.startsWith(`${realBase}${path.sep}`), `${label} escapes ${realBase}`);
  return realCandidate;
}

function safePath(file) {
  assert.equal(path.isAbsolute(file), false, `artifact path must be relative: ${file}`);
  return assertContained(realRoot, path.resolve(root, file), `artifact ${file}`);
}

function inventory(directory) {
  const files = [];
  for (const entry of fs.readdirSync(safePath(directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name).split(path.sep).join('/');
    assert.equal(entry.isSymbolicLink(), false, `oracle inventory contains symlink: ${relative}`);
    if (entry.isDirectory()) files.push(...inventory(relative));
    else files.push(relative);
  }
  return files.sort();
}

const productionExtensions = /(?:^|\.)(?:c|cc|cxx|cpp|h|hh|hpp|m|mm|swift|java|kt|kts|js|jsx|ts|tsx|lua|gradle|xml|json|properties|plist|pbxproj|xcconfig|cmake|mk|ya?ml|toml|cfg|conf|ini|txt|xmf_)$/i;
const productionNames = /(?:^|\/)(?:CMakeLists\.txt|Podfile|Makefile|AndroidManifest\.xml)$/;
const pinnedThirdPartyRoot = 'modules/allnewmts-runtime/vendor/lua-5.1.5/';
const integrityMetadataFiles = new Set(['native/lua-source-manifest.json', 'verification/manifest.json']);
function isProductBehavioralFile(mode, file) {
  return (mode === '100755' || productionExtensions.test(file) || productionNames.test(file)) &&
    !file.startsWith('contracts/') &&
    !file.startsWith('verification/') &&
    !file.startsWith('test/oracles/') &&
    file !== 'apps/labs/xmf-runtime/generated/approved-xmf.ts' &&
    !file.startsWith(pinnedThirdPartyRoot) &&
    !['scripts/generate-synthetic-xmf.mjs', 'scripts/verify-fixtures.mjs'].includes(file);
}
function productBehaviorText(file, source) {
  if (!integrityMetadataFiles.has(file)) return source;
  return source.replace(/"(?:sha256|archiveSha256|actualSha256|compiledExpectedSha256)"\s*:\s*"[a-f0-9]{64}"/gi, '');
}
function productionFiles(repository = root) {
  return git(repository, ['ls-files', '-s', '-z'], 'buffer').toString().split('\0').filter(Boolean).map((entry) => {
    const match = entry.match(/^(\d+) [a-f0-9]+ \d+\t([\s\S]+)$/);
    assert.ok(match, `unrecognized git index entry: ${entry}`);
    return { mode: match[1], file: match[2] };
  }).filter(({ file }) => fs.existsSync(path.join(repository, file)))
    .filter(({ mode, file }) => isProductBehavioralFile(mode, file)).map(({ file }) => file);
}

function verifyProvenance(source) {
  assert.match(source.sourceRepositoryCommit, /^[a-f0-9]{40}$/);
  assert.match(source.gitBlobOid, /^[a-f0-9]{40}$/);
  assert.equal(path.posix.isAbsolute(source.sourceRepositoryPath), false);
  assert.equal(source.sourceRepositoryPath.includes('\\'), false);
  assert.equal(source.sourceRepositoryPath.includes('\0'), false);
  assert.equal(source.sourceRepositoryPath.split('/').includes('..'), false);

  if (source.rawGitBlob) {
    assert.equal(source.rawGitBlob.checkoutEncoding, 'crlf');
    assert.ok(read(source.path).includes(Buffer.from('\r\n')), 'XMF checkout must retain CRLF bytes');
  }
}

function eventGroups(trace) {
  return trace.events ? [trace.events] : trace.cases.map((item) => item.events);
}

function verifyLifecycle(traces) {
  for (const trace of Object.values(traces)) {
    assert.equal(trace.stateTiming, 'after Lua handler and before queued command application');
    for (const events of eventGroups(trace)) {
      for (const event of events) {
        const closeCall = event.hostCalls.find((call) => call.target === 'Form.SendReturnToParent' && call.args.at(-1) === true);
        const closeRequest = event.hostCalls.some((call) => call.target === 'Form.CloseForm');
        const closeCommand = event.commands.find((command) => command.type === 'returnToParent' && command.close === true);
        if (closeCall || closeCommand) {
          assert.ok(closeCall && closeCommand, `${trace.scenario}: close host call/command mismatch`);
          assert.deepEqual(closeCall.args, [closeCommand.name, closeCommand.payload, true]);
          assert.equal(event.state.lifecycle, event.event === 'Form_OnFormClose' ? 'CLOSING' : 'ACTIVE');
          assert.equal(event.stateAfterCommands.lifecycle, event.event === 'Form_OnFormClose' ? 'CLOSED' : 'CLOSING');
        }
        if (closeRequest) {
          assert.equal(event.state.lifecycle, 'ACTIVE');
          assert.equal(event.stateAfterCommands.lifecycle, 'CLOSING');
        }
        if (event.event === 'Form_OnFormClose') {
          assert.equal(event.state.lifecycle, 'CLOSING');
          assert.equal(event.commands.at(-1).type, 'closeForm');
          assert.equal(event.stateAfterCommands.lifecycle, 'CLOSED');
        }
      }
    }
  }
}

function verifyEquivalentCloseReturns(traces) {
  const snapshots = new Map();
  for (const trace of Object.values(traces)) for (const events of eventGroups(trace)) for (const event of events) {
    for (const call of event.hostCalls.filter((item) => item.target === 'Form.SendReturnToParent' && item.args.at(-1) === true)) {
      const key = JSON.stringify([event.event, call.args]);
      if (snapshots.has(key)) assert.deepEqual(event.state, snapshots.get(key), `${trace.scenario}: equivalent close-return state mismatch`);
      else snapshots.set(key, event.state);
    }
  }
}

const warningMessage = '관심그룹에 종목은 최대 100개까지 추가할 수 있어요.\n100개가 넘어가는 종목은 제외하고 추가할게요.';
function verifyOver100(over) {
  const inputProducts = JSON.parse(over.inputs.openLinkData);
  const warningIndex = over.events.findIndex((event) => event.event === 'DATAMANAGER_OnReceiveTranComplete' && event.commands.some((command) => command.type === 'messageBox'));
  const confirmationIndex = over.events.findIndex((event) => event.event === 'Form_OnMsgBoxClose');
  const warning = over.events[warningIndex];
  const confirmation = over.events[confirmationIndex];
  const overBlock = warning.blocks.CCS20000;
  assert.ok(inputProducts.length > 100);
  assert.equal(overBlock.InBlock1.arr_cnt, inputProducts.length);
  assert.equal(overBlock.InBlock2.length, 100);
  assert.deepEqual(overBlock.InBlock2.map((row) => row.shrn_iscd), inputProducts.slice(0, 100).map((row) => row.Code));
  assert.ok(warningIndex < confirmationIndex);
  assert.deepEqual(warning.hostCalls.at(-1), { api: 'call', target: 'Form.MsgBoxEx', args: ['', warningMessage, 'OnlyShow', '', '확인', 0] });
  assert.deepEqual(warning.commands, [{ type: 'messageBox', title: '', message: warningMessage, key: 'OnlyShow', confirmLabel: '확인' }]);
  assert.equal(over.events.slice(0, confirmationIndex).some((event) => event.hostCalls.some((call) => call.target === 'DATAMANAGER.RequestTranData' && call.args[0] === 'CCS20000')), false);
  assert.equal(over.events.slice(0, confirmationIndex).some((event) => event.transportRequests.some((request) => request.tranId === 'CCS20000')), false);
  assert.deepEqual(confirmation.args, ['OnlyShow', 'confirm']);
  assert.deepEqual(confirmation.hostCalls, [
    { api: 'call', target: 'DATAMANAGER.RequestTranData', args: ['CCS20000'] },
    { api: 'call', target: 'Form.GetSharedData', args: ['&USER_ID', false], returns: 'U000000001' },
    { api: 'call', target: 'DATAMANAGER.SetDataValue', args: [false, 'CCS20000', 'InBlock1', 'usid', 0, 'U000000001'] },
    { api: 'call', target: 'DATAMANAGER.SetDataValue', args: [false, 'CCS20000', 'InBlock1', 'wk_tp', 0, '1'] }
  ]);
  assert.deepEqual(confirmation.transportRequests, [{ tranId: 'CCS20000' }]);
  assert.deepEqual(over.nonConfirmCase, {
    description: 'Dismissing the >100 warning does not request CCS20000.', event: 'Form_OnMsgBoxClose', args: ['OnlyShow', 'dismiss'],
    hostCalls: [], commands: [], transportRequests: [], state: { lifecycle: 'ACTIVE' }
  });
}

function verifyError(error) {
  const event = error.events.at(-1);
  const message = '요청을 처리할 수 없습니다.';
  const decorated = `<color=4\`size=2\`font=0\`style=1\`bgcolor=>${message}`;
  assert.equal(event.event, 'DATAMANAGER_OnReceiveTranError');
  assert.deepEqual(event.args, ['CCS20001', 'E_FIXTURE', message]);
  assert.deepEqual(event.hostCalls, [
    { api: 'call', target: 'Trim', args: [message], returns: message },
    { api: 'call', target: 'Form.GetSharedData', args: ['&TEST_MODE', false], returns: '0' },
    { api: 'call', target: 'Form.MsgBoxEx', args: ['', decorated, 'OnlyShow', '', '확인', 0] }
  ]);
  assert.deepEqual(event.commands, [{ type: 'messageBox', title: '', message: decorated, key: 'OnlyShow', confirmLabel: '확인' }]);
  const diagnostic = JSON.stringify(event.commands);
  for (const value of error.inputs.forbiddenDiagnosticValues) assert.equal(diagnostic.includes(value), false, `diagnostic leaked: ${value}`);
  assert.equal(error.events.some((item) => item.commands.some((command) => command.type === 'returnToParent')), false);
}

function verifyClose(close) {
  const cancel = close.cases.find((item) => item.name === 'cancel-returns-no-change').events;
  assert.deepEqual(cancel[1].hostCalls, [{ api: 'call', target: 'Form.CloseForm', args: [] }]);
  assert.equal(cancel.flatMap((event) => event.commands).filter((command) => command.payload === 'NoChange').length, 1);
  assert.equal(cancel.at(-1).commands.at(-1).type, 'closeForm');
  assert.deepEqual(cancel.flatMap((event) => event.transportRequests), []);
  const success = close.cases.find((item) => item.name === 'successful-return-suppresses-no-change').events;
  assert.equal(success.at(-1).state.globals.g_bOnlyClose, false);
  assert.equal(JSON.stringify(success).includes('NoChange'), false);
  assert.equal(success.at(-1).commands.at(-1).type, 'closeForm');
  return success;
}

const forbiddenIdentities = [
  'HS1200P08', '관심종목_그룹추가', 'CCS20000', 'CCS20001', 'btnAdd', 'btnCancel', 'edtGroupNm', 'lbl0', 'lbl1',
  '1200', '9907', '4d63ba22ac5339cfd3068cffa91710e0099481da81d974e2aff0ce7ae39ed53e',
  '18,0,324,26,1', '18,42,324,20,1', '18,68,324,40,1', '185,142,157,56,1', '18,142,157,56,1'
];
function hardcodingHit(text) {
  const compact = text.replace(/[\s'"`+]/g, '');
  return forbiddenIdentities.find((identity) => text.includes(identity) || compact.includes(identity));
}

assert.equal(manifest.schemaVersion, 1);
assert.deepEqual(manifest.noEngineAttestation, {
  prohibitedEngineMaterialUsed: false,
  runtimeOrEngineGeneratedGoldenTraces: false,
  statement: 'No engine source, headers, binaries, traces, fixtures, output, behavior, or derived evidence was inspected, copied, executed, cited, or used to create these oracles.'
});

const entries = [...manifest.sources, ...manifest.artifacts];
assert.equal(new Set(entries.map((entry) => entry.path)).size, entries.length, 'duplicate manifest path');
for (const entry of entries) {
  assert.match(entry.sha256, /^[a-f0-9]{64}$/);
  assert.ok(Number.isInteger(entry.bytes) && entry.bytes >= 0);
  assert.ok(entry.classification && entry.allowedDerivation);
  const bytes = read(entry.path);
  assert.equal(bytes.length, entry.bytes, `byte drift: ${entry.path}`);
  assert.equal(sha256(bytes), entry.sha256, `hash drift: ${entry.path}`);
}
for (const source of manifest.sources) verifyProvenance(source);
for (const artifact of manifest.artifacts) {
  assert.ok(Array.isArray(artifact.sourcePaths) && artifact.sourcePaths.length > 0, `missing source paths: ${artifact.path}`);
  assert.ok(artifact.sourcePaths.every((file) => manifest.sources.some((source) => source.path === file)), `unknown artifact source: ${artifact.path}`);
  assert.ok(artifact.sourceRepositoryCommits.every((commit) => /^[a-f0-9]{40}$/.test(commit)), `bad source commit: ${artifact.path}`);
}

assert.deepEqual(inventory('test/oracles/sources'), manifest.sources.map((entry) => entry.path).sort(), 'source inventory drift');
const traceEntries = manifest.artifacts.filter((entry) => entry.classification === 'hand-authored-golden-trace');
assert.deepEqual(inventory('test/oracles/golden'), traceEntries.map((entry) => entry.path).sort(), 'golden trace inventory drift');
assert.equal(traceEntries.length, 6);
const traces = Object.fromEntries(traceEntries.map((entry) => { const trace = json(entry.path); return [trace.scenario, trace]; }));
assert.deepEqual(Object.keys(traces).sort(), ['close-cancel-lifecycle', 'empty-open-link', 'json-products-over-100', 'json-products-up-to-100', 'open-link-now', 'transaction-error']);

for (const trace of Object.values(traces)) {
  assert.equal(trace.schemaVersion, 1);
  assert.equal(trace.handAuthored, true);
  for (const events of eventGroups(trace)) {
    assert.deepEqual(events.map((event) => event.revision), events.map((_, index) => index + 1), `${trace.scenario}: revision drift`);
    for (const event of events) {
      assert.equal(event.status, 'ok');
      for (const field of ['hostCalls', 'commands', 'transportRequests']) assert.ok(Array.isArray(event[field]), `${trace.scenario}: ${field}`);
    }
  }
}
verifyLifecycle(traces);
verifyEquivalentCloseReturns(traces);

const requests = (trace) => eventGroups(trace).flat(2).flatMap((event) => event.transportRequests.map((request) => request.tranId));
const empty = traces['empty-open-link'];
assert.deepEqual(requests(empty), []);
assert.deepEqual(empty.events.at(-1).commands, [{ type: 'returnToParent', name: 'AddNewGroup', payload: '새그룹', close: true }]);

const now = traces['open-link-now'];
assert.deepEqual(requests(now), ['CCS20001']);
assert.deepEqual(now.events.at(-1).commands[0], { type: 'returnToParent', name: 'AddNewGroup', payload: '', close: true });
assert.equal(JSON.stringify(now).includes('CCS20000'), false);

const bounded = traces['json-products-up-to-100'];
assert.deepEqual(requests(bounded), ['CCS20001', 'CCS20000']);
const boundedRequest = bounded.events.find((event) => event.transportRequests.some((request) => request.tranId === 'CCS20000'));
const boundedBlock = boundedRequest.blocks.CCS20000;
assert.equal(boundedBlock.InBlock1.arr_cnt, 3);
assert.deepEqual(boundedBlock.InBlock2.map((row) => row.shrn_iscd), ['005930', 'AAPL', 'BTC']);
assert.ok(boundedRequest.hostCalls.findIndex((call) => call.target === 'DATAMANAGER.RequestTranData' && call.args[0] === 'CCS20000') < boundedRequest.hostCalls.findIndex((call) => call.target === 'Form.GetSharedData'));
assert.deepEqual(bounded.events.at(-1).commands.map((command) => command.type), ['toast', 'returnToParent']);

verifyOver100(traces['json-products-over-100']);
verifyError(traces['transaction-error']);

const close = traces['close-cancel-lifecycle'];
const success = verifyClose(close);

const original = read('test/oracles/sources/mts_screen/HS1200P08.xmf_');
const synthetic = read('test/oracles/synthetic/renamed-reordered.xmf_');
assert.deepEqual(generateSyntheticFixture(original), synthetic, 'synthetic generator drift');
assert.notEqual(sha256(original), sha256(synthetic), 'synthetic source hash did not change');
const syntheticText = synthetic.toString('utf8');
for (const token of ['scrno="1200"', 'name="Form"', 'lbl0', 'lbl1', 'edtGroupNm', 'btnAdd', 'btnCancel', 'CCS20000', 'CCS20001', sha256(original)]) assert.equal(syntheticText.includes(token), false, `synthetic retained original identity: ${token}`);
assert.equal(/(^|[^A-Za-z])Form[._]/m.test(syntheticText), false, 'synthetic retained original Form identity');
assert.deepEqual([...syntheticText.matchAll(/<(?:LABEL|EDIT|BUTTON) name="([^"]+)"/g)].map((match) => match[1]), ['syntheticDismiss', 'syntheticPrompt', 'syntheticAccept', 'syntheticInput', 'syntheticTitle']);

for (const file of productionFiles()) {
  const hit = hardcodingHit(productBehaviorText(file, read(file).toString('utf8')));
  assert.equal(hit, undefined, `production static anti-hardcoding tripwire (${hit}): ${file}`);
}
assert.equal(isProductBehavioralFile('100644', 'modules/allnewmts-runtime/vendor/lua-5.1.5/src/lapi.h'), false, 'pinned third-party source entered product behavior scan');
assert.equal(isProductBehavioralFile('100644', 'apps/labs/xmf-runtime/generated/approved-xmf.ts'), false, 'generated XMF data entered product behavior scan');
assert.equal(isProductBehavioralFile('100644', 'src/product-behavior.ts'), true, 'product-authored source escaped behavior scan');
assert.equal(hardcodingHit('const transaction = "CCS20000";'), 'CCS20000', 'product-authored hardcoding tripwire weakened');
assert.equal(hardcodingHit(productBehaviorText('native/lua-source-manifest.json', '{"sha256":"9907000000000000000000000000000000000000000000000000000000000000"}')), undefined, 'integrity hash bytes entered product behavior scan');
assert.equal(hardcodingHit(productBehaviorText('native/lua-source-manifest.json', '{"screen":9907}')), '9907', 'integrity manifest behavior escaped product scan');

// Deterministic negative checks for the independent review's exact bypass classes.
for (const mutation of ['CCS20000', 'const id = "CCS" + "20000";', 'const screen = 9907;', 'const ordinal = "lbl" + "0";', 'const layout = "18,68," + "324,40,1";']) assert.ok(hardcodingHit(mutation), `tripwire self-test missed: ${mutation}`);
const wrongWarning = structuredClone(traces['json-products-over-100']);
wrongWarning.events.find((event) => event.commands.some((command) => command.type === 'messageBox')).commands[0].message = 'WRONG WARNING';
assert.throws(() => verifyOver100(wrongWarning));
const earlyRequest = structuredClone(traces['json-products-over-100']);
earlyRequest.events[0].hostCalls.push({ api: 'call', target: 'DATAMANAGER.RequestTranData', args: ['CCS20000'] });
assert.throws(() => verifyOver100(earlyRequest));
const wrongError = structuredClone(traces['transaction-error']);
wrongError.events.at(-1).hostCalls[0].args = ['WRONG'];
assert.throws(() => verifyError(wrongError));
const noChangeLeak = structuredClone(close);
noChangeLeak.cases.find((item) => item.name === 'successful-return-suppresses-no-change').events[0].commands.push({ type: 'returnToParent', payload: 'NoChange' });
assert.throws(() => verifyClose(noChangeLeak));
const snapshotMismatch = structuredClone(traces);
delete snapshotMismatch['close-cancel-lifecycle'].cases.find((item) => item.name === 'successful-return-suppresses-no-change').events.find((event) => event.event === 'btnAdd_OnClick').state.controls.btnAdd.border;
assert.throws(() => verifyEquivalentCloseReturns(snapshotMismatch));
assert.throws(() => assertMaterializedMatches(Buffer.from('mutated frozen source'), Buffer.from('approved materialized source'), 'self-test source'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-path-'));
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-outside-'));
fs.writeFileSync(path.join(outside, 'escape.txt'), 'escape');
fs.symlinkSync(path.join(outside, 'escape.txt'), path.join(temp, 'escape.txt'));
assert.throws(() => assertContained(temp, path.join(temp, 'escape.txt'), 'self-test symlink'));
fs.rmSync(temp, { recursive: true, force: true });
fs.rmSync(outside, { recursive: true, force: true });
const executableRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-executable-'));
git(executableRepo, ['init']);
fs.writeFileSync(path.join(executableRepo, 'probe'), '#!/bin/sh\n# CCS20000\n', { mode: 0o755 });
git(executableRepo, ['add', 'probe']);
assert.throws(() => {
  for (const file of productionFiles(executableRepo)) assert.equal(hardcodingHit(fs.readFileSync(path.join(executableRepo, file), 'utf8')), undefined);
});
fs.rmSync(executableRepo, { recursive: true, force: true });

console.log('PASS FIXTURE negative checks: provenance mutation, trace mutations, composed identities, equivalent snapshot drift, executable hardcoding, and symlink escape are rejected');
console.log('PASS FIXTURE static anti-hardcoding tripwires; original-plus-synthetic execution provides the dynamic proof');
console.log(`PASS FIXTURE: ${manifest.sources.length} immutable sources, 6 golden traces, provenance, generator, and anti-hardcoding tripwires`);
