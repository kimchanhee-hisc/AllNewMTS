import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSyntheticFixture } from './generate-g001-synthetic.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const json = (file) => JSON.parse(read(file).toString('utf8'));
const manifest = json('test/oracles/manifest.json');

function safePath(file) {
  assert.equal(path.isAbsolute(file), false, `artifact path must be relative: ${file}`);
  const resolved = path.resolve(root, file);
  assert.ok(resolved.startsWith(`${root}${path.sep}`), `artifact escapes repository: ${file}`);
  return resolved;
}

function inventory(directory) {
  const base = path.join(root, directory);
  const files = [];
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...inventory(relative));
    else files.push(relative.split(path.sep).join('/'));
  }
  return files.sort();
}

function productionFiles(directory = '.') {
  const base = path.join(root, directory);
  const files = [];
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['.git', '.omx', 'node_modules', 'test', 'scripts', 'assets'].includes(entry.name)) files.push(...productionFiles(relative));
    } else if (/\.(?:js|jsx|ts|tsx|m|mm|swift|kt|cpp|h)$/.test(entry.name)) {
      files.push(relative.split(path.sep).join('/'));
    }
  }
  return files;
}

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.goal, 'G001-freeze-independent-oracles');
assert.deepEqual(manifest.noEngineAttestation, {
  prohibitedEngineMaterialUsed: false,
  runtimeOrEngineGeneratedGoldenTraces: false,
  statement: 'No engine source, headers, binaries, traces, fixtures, output, behavior, or derived evidence was inspected, copied, executed, cited, or used to create these oracles.'
});

const expectedProvenance = {
  'test/oracles/sources/mts_screen/HS1200P08.xmf_': ['/Users/chanheekim/Dev/mts_screen/SmartMTS/Resource/Main/scr_xmf/HS1200P08.xmf_', '/Users/chanheekim/Dev/mts_screen', '7708dd5b089352c7531dbee4334f2a9aa53cde13', 'approved-original-xmf'],
  'test/oracles/sources/mts_screen/script.lua': ['/Users/chanheekim/Dev/mts_screen/SmartMTS/Resource/Main/scr/script.lua', '/Users/chanheekim/Dev/mts_screen', '7708dd5b089352c7531dbee4334f2a9aa53cde13', 'approved-original-common-lua'],
  'test/oracles/sources/mts_screen/json.lua': ['/Users/chanheekim/Dev/mts_screen/SmartMTS/Resource/Main/scr/json.lua', '/Users/chanheekim/Dev/mts_screen', '7708dd5b089352c7531dbee4334f2a9aa53cde13', 'approved-original-common-lua'],
  'test/oracles/sources/plus/android/CCS20000.qry': ['/Users/chanheekim/Dev/Plus/android/Main/MTSMain/src/main/assets/qry/CCS20000.qry', '/Users/chanheekim/Dev/Plus/android', '164d28c3094bae4e8a0df9b55bde41ba742bbb5e', 'engine-independent-qry-contract'],
  'test/oracles/sources/plus/android/CCS20001.qry': ['/Users/chanheekim/Dev/Plus/android/Main/MTSMain/src/main/assets/qry/CCS20001.qry', '/Users/chanheekim/Dev/Plus/android', '164d28c3094bae4e8a0df9b55bde41ba742bbb5e', 'engine-independent-qry-contract'],
  'test/oracles/sources/plus/typescript/CCS20000Request.ts.source': ['/Users/chanheekim/Dev/Plus/src/infra/networking/models/CCS20000Request.ts', '/Users/chanheekim/Dev/Plus', '0fb74c33b19b89dec0ee8c6863dce42b5c0f650a', 'engine-independent-network-contract'],
  'test/oracles/sources/plus/typescript/CCS20001Request.ts.source': ['/Users/chanheekim/Dev/Plus/src/infra/networking/models/CCS20001Request.ts', '/Users/chanheekim/Dev/Plus', '0fb74c33b19b89dec0ee8c6863dce42b5c0f650a', 'engine-independent-network-contract'],
  'test/oracles/sources/plus/typescript/WatchlistTransportRequests.ts.source': ['/Users/chanheekim/Dev/Plus/src/infra/networking/models/watchlist/WatchlistTransportRequests.ts', '/Users/chanheekim/Dev/Plus', '0fb74c33b19b89dec0ee8c6863dce42b5c0f650a', 'engine-independent-network-contract'],
  'test/oracles/sources/plus/typescript/WatchlistTransportRequests.test.ts.source': ['/Users/chanheekim/Dev/Plus/src/infra/networking/models/watchlist/WatchlistTransportRequests.test.ts', '/Users/chanheekim/Dev/Plus', '0fb74c33b19b89dec0ee8c6863dce42b5c0f650a', 'engine-independent-service-test'],
  'test/oracles/sources/plus/typescript/WatchlistApiService.test.ts.source': ['/Users/chanheekim/Dev/Plus/src/api/services/WatchlistApiService.test.ts', '/Users/chanheekim/Dev/Plus', '0fb74c33b19b89dec0ee8c6863dce42b5c0f650a', 'engine-independent-service-test']
};
assert.deepEqual(Object.fromEntries(manifest.sources.map((source) => [source.path, [source.sourcePath, source.sourceRepository, source.sourceRepositoryCommit, source.classification]])), expectedProvenance, 'source provenance drift');

const entries = [...manifest.sources, ...manifest.artifacts];
assert.equal(new Set(entries.map((entry) => entry.path)).size, entries.length, 'duplicate manifest path');
for (const entry of entries) {
  safePath(entry.path);
  assert.match(entry.sha256, /^[a-f0-9]{64}$/);
  assert.ok(Number.isInteger(entry.bytes) && entry.bytes >= 0);
  assert.ok(entry.classification && entry.allowedDerivation);
  const bytes = read(entry.path);
  assert.equal(bytes.length, entry.bytes, `byte drift: ${entry.path}`);
  assert.equal(sha256(bytes), entry.sha256, `hash drift: ${entry.path}`);
}

for (const source of manifest.sources) {
  assert.ok(path.isAbsolute(source.sourcePath), `sourcePath must be absolute: ${source.path}`);
  assert.ok(path.isAbsolute(source.sourceRepository), `sourceRepository must be absolute: ${source.path}`);
  assert.match(source.sourceRepositoryCommit, /^[a-f0-9]{40}$/);
}
for (const artifact of manifest.artifacts) {
  assert.ok(Array.isArray(artifact.sourcePaths) && artifact.sourcePaths.length > 0, `missing source paths: ${artifact.path}`);
  assert.ok(artifact.sourcePaths.every((file) => manifest.sources.some((source) => source.path === file)), `unknown artifact source: ${artifact.path}`);
  assert.ok(artifact.sourceRepositoryCommits.every((commit) => /^[a-f0-9]{40}$/.test(commit)), `bad source commit: ${artifact.path}`);
}

assert.deepEqual(inventory('test/oracles/sources'), manifest.sources.map((entry) => entry.path).sort(), 'source inventory drift');
const traceEntries = manifest.artifacts.filter((entry) => entry.classification === 'hand-authored-golden-trace');
assert.deepEqual(inventory('test/oracles/golden'), traceEntries.map((entry) => entry.path).sort(), 'golden trace inventory drift');
assert.equal(traceEntries.length, 6);

const traces = Object.fromEntries(traceEntries.map((entry) => {
  const trace = json(entry.path);
  return [trace.scenario, trace];
}));
assert.deepEqual(Object.keys(traces).sort(), [
  'close-cancel-lifecycle',
  'empty-open-link',
  'json-products-over-100',
  'json-products-up-to-100',
  'open-link-now',
  'transaction-error'
]);

const eventGroups = (trace) => trace.events ? [trace.events] : trace.cases.map((item) => item.events);
for (const trace of Object.values(traces)) {
  assert.equal(trace.schemaVersion, 1);
  assert.equal(trace.handAuthored, true);
  assert.equal(trace.stateTiming, 'after Lua handler and before queued command application');
  for (const events of eventGroups(trace)) {
    assert.deepEqual(events.map((event) => event.revision), events.map((_, index) => index + 1), `${trace.scenario}: revision drift`);
    for (const event of events) {
      assert.equal(event.status, 'ok');
      for (const field of ['hostCalls', 'commands', 'transportRequests']) assert.ok(Array.isArray(event[field]), `${trace.scenario}: ${field}`);
    }
  }
}

const requests = (trace) => eventGroups(trace).flat(2).flatMap((event) => event.transportRequests.map((request) => request.tranId));
const empty = traces['empty-open-link'];
assert.deepEqual(requests(empty), []);
assert.deepEqual(empty.events.at(-1).commands, [{ type: 'returnToParent', name: 'AddNewGroup', payload: '새그룹', close: true }]);

const now = traces['open-link-now'];
assert.deepEqual(requests(now), ['CCS20001']);
assert.equal(now.events.at(-1).commands[0].name, 'AddNewGroup');
assert.equal(now.events.at(-1).commands[0].payload, '');
assert.equal(JSON.stringify(now).includes('CCS20000'), false);

const bounded = traces['json-products-up-to-100'];
assert.deepEqual(requests(bounded), ['CCS20001', 'CCS20000']);
const boundedBlock = bounded.events.find((event) => event.blocks.CCS20000?.InBlock2).blocks.CCS20000;
assert.equal(boundedBlock.InBlock1.arr_cnt, 3);
assert.deepEqual(boundedBlock.InBlock2.map((row) => row.shrn_iscd), ['005930', 'AAPL', 'BTC']);
assert.equal(bounded.events.some((event) => event.commands.some((command) => command.type === 'messageBox')), false);
assert.deepEqual(bounded.events.at(-1).commands.map((command) => command.type), ['toast', 'returnToParent']);

const over = traces['json-products-over-100'];
const inputProducts = JSON.parse(over.inputs.openLinkData);
const warningIndex = over.events.findIndex((event) => event.commands.some((command) => command.type === 'messageBox'));
const confirmationIndex = over.events.findIndex((event) => event.event === 'Form_OnMsgBoxClose');
const overBlock = over.events[warningIndex].blocks.CCS20000;
assert.ok(inputProducts.length > 100);
assert.equal(overBlock.InBlock1.arr_cnt, inputProducts.length);
assert.equal(overBlock.InBlock2.length, 100);
assert.deepEqual(overBlock.InBlock2.map((row) => row.shrn_iscd), inputProducts.slice(0, 100).map((row) => row.Code));
assert.ok(warningIndex < confirmationIndex);
assert.deepEqual(over.events[warningIndex].transportRequests, []);
assert.deepEqual(over.events[confirmationIndex].args, ['OnlyShow', 'confirm']);
assert.deepEqual(over.events[confirmationIndex].transportRequests, [{ tranId: 'CCS20000' }]);
assert.equal(over.events.slice(0, confirmationIndex).some((event) => event.transportRequests.some((request) => request.tranId === 'CCS20000')), false);

const error = traces['transaction-error'];
assert.deepEqual(error.events.at(-1).hostCalls.map((call) => call.target), ['Trim', 'Form.GetSharedData', 'Form.MsgBoxEx']);
const diagnostic = JSON.stringify(error.events.at(-1).commands);
for (const value of error.inputs.forbiddenDiagnosticValues) assert.equal(diagnostic.includes(value), false, `diagnostic leaked: ${value}`);
assert.equal(error.events.some((event) => event.commands.some((command) => command.type === 'returnToParent')), false);

const close = traces['close-cancel-lifecycle'];
const cancel = close.cases.find((item) => item.name === 'cancel-returns-no-change').events;
assert.deepEqual(cancel[1].hostCalls, [{ api: 'call', target: 'Form.CloseForm', args: [] }]);
assert.equal(cancel.flatMap((event) => event.commands).filter((command) => command.payload === 'NoChange').length, 1);
assert.equal(cancel.at(-1).commands.at(-1).type, 'closeForm');
assert.deepEqual(cancel.flatMap((event) => event.transportRequests), []);
const success = close.cases.find((item) => item.name === 'successful-return-suppresses-no-change').events;
assert.equal(success.at(-1).state.globals.g_bOnlyClose, false);
assert.equal(JSON.stringify(success.at(-1)).includes('NoChange'), false);
assert.equal(success.at(-1).commands.at(-1).type, 'closeForm');

const original = read('test/oracles/sources/mts_screen/HS1200P08.xmf_');
const synthetic = read('test/oracles/synthetic/renamed-reordered.xmf_');
assert.deepEqual(generateSyntheticFixture(original), synthetic, 'synthetic generator drift');
assert.notEqual(sha256(original), sha256(synthetic), 'synthetic source hash did not change');
const syntheticText = synthetic.toString('utf8');
for (const token of ['scrno="1200"', 'name="Form"', 'lbl0', 'lbl1', 'edtGroupNm', 'btnAdd', 'btnCancel', 'CCS20000', 'CCS20001', sha256(original)]) {
  assert.equal(syntheticText.includes(token), false, `synthetic retained original identity: ${token}`);
}
assert.equal(/(^|[^A-Za-z])Form[._]/m.test(syntheticText), false, 'synthetic retained original Form identity');
for (const layout of ['18,0,324,26,1', '18,42,324,20,1', '18,68,324,40,1', '185,142,157,56,1', '18,142,157,56,1']) {
  assert.equal(syntheticText.includes(layout), false, `synthetic retained original layout: ${layout}`);
}
assert.deepEqual([...syntheticText.matchAll(/<(?:LABEL|EDIT|BUTTON) name="([^"]+)"/g)].map((match) => match[1]), [
  'syntheticDismiss', 'syntheticPrompt', 'syntheticAccept', 'syntheticInput', 'syntheticTitle'
]);

const productionForbidden = /HS1200P08|CCS20000|CCS20001|btnAdd|btnCancel|edtGroupNm|4d63ba22ac5339cfd3068cffa91710e0099481da81d974e2aff0ce7ae39ed53e/;
for (const file of productionFiles()) {
  assert.equal(productionForbidden.test(read(file).toString('utf8')), false, `production hardcoding: ${file}`);
}

console.log(`PASS G001: ${manifest.sources.length} immutable sources, 6 golden traces, provenance, generator, and anti-hardcoding checks`);
