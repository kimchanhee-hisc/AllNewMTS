import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

export const loadManifest = () => json('verification/manifest.json');

function hasType(value, expected) {
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'null') return value === null;
  if (expected === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (expected === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  return typeof value === expected;
}

export function validateSchema(schema, value, label = '$', document = schema) {
  if (schema.$ref) {
    assert.ok(schema.$ref.startsWith('#/$defs/'), `${label}: unsupported schema reference`);
    return validateSchema(document.$defs[schema.$ref.slice('#/$defs/'.length)], value, label, document);
  }
  if (schema.type) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    assert.ok(expected.some((type) => hasType(value, type)), `${label}: expected ${expected.join('|')}`);
  }
  if ('const' in schema) assert.deepEqual(value, schema.const, `${label}: const mismatch`);
  if (schema.enum) assert.ok(schema.enum.includes(value), `${label}: value is not in enum`);
  if (schema.minLength !== undefined) assert.ok(value.length >= schema.minLength, `${label}: too short`);
  if (schema.minimum !== undefined) assert.ok(value >= schema.minimum, `${label}: below minimum`);
  if (schema.pattern) assert.match(value, new RegExp(schema.pattern), `${label}: pattern mismatch`);
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined) assert.ok(value.length >= schema.minItems, `${label}: too few items`);
    if (schema.uniqueItems) assert.equal(new Set(value.map((item) => JSON.stringify(item))).size, value.length, `${label}: duplicate items`);
    if (schema.items) value.forEach((item, index) => validateSchema(schema.items, item, `${label}[${index}]`, document));
  }
  if (hasType(value, 'object')) {
    for (const key of schema.required ?? []) assert.ok(Object.hasOwn(value, key), `${label}: missing ${key}`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) assert.ok(Object.hasOwn(schema.properties ?? {}, key), `${label}: unknown ${key}`);
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, key)) validateSchema(child, value[key], `${label}.${key}`, document);
    }
  }
}

function allCandidateFiles() {
  const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root });
  return output.toString().split('\0').filter(Boolean);
}

function foundationFiles() {
  return [
    'AGENTS.md',
    'README.md',
    'docs/specs/xmf-lua-runtime.md',
    'docs/specs/runtime-contract.md',
    'docs/testing.md',
    'docs/adr/0001-official-lua-5.1.5.md',
    'contracts/host-api.json',
    'contracts/host-api.schema.json',
    'contracts/control-registry.json',
    'contracts/control-registry.schema.json',
    'verification/manifest.json',
    'verification/manifest.schema.json',
    'scripts/verify-foundation.mjs',
    'test/foundation.test.mjs',
    'package.json'
  ];
}

function verifyFormat() {
  for (const file of foundationFiles()) {
    assert.ok(fs.existsSync(path.join(root, file)), `format contract: missing ${file}; rerun npm run verify:format`);
    const text = read(file);
    assert.ok(text.endsWith('\n'), `format contract: missing final newline in ${file}; rerun npm run verify:format`);
    assert.equal(text.includes('\r'), false, `format contract: CR byte in ${file}; rerun npm run verify:format`);
    assert.equal(/[ \t]+$/m.test(text), false, `format contract: trailing whitespace in ${file}; rerun npm run verify:format`);
    if (file.endsWith('.json')) JSON.parse(text);
  }
  console.log('PASS format: foundation text and JSON are stable');
}

function markdownLinks(file) {
  const links = [...read(file).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
  for (const link of links) {
    if (/^(?:https?:|mailto:)/.test(link)) continue;
    const target = link.split('#')[0];
    if (!target) continue;
    assert.ok(fs.existsSync(path.resolve(root, path.dirname(file), target)), `docs contract: broken link ${link} in ${file}; rerun npm run verify:docs`);
  }
}

function unique(items, label) {
  assert.equal(new Set(items).size, items.length, `docs contract: duplicate ${label}; rerun npm run verify:docs`);
}

function verifyDocs() {
  const manifest = loadManifest();
  const host = json('contracts/host-api.json');
  const controls = json('contracts/control-registry.json');
  validateSchema(json('verification/manifest.schema.json'), manifest, 'verification manifest');
  validateSchema(json('contracts/host-api.schema.json'), host, 'Host manifest');
  validateSchema(json('contracts/control-registry.schema.json'), controls, 'control registry');

  const docs = ['AGENTS.md', 'README.md', ...manifest.canonicalOwners.map(({ path: file }) => file)];
  unique(docs, 'canonical owner path');
  docs.forEach(markdownLinks);
  for (const owner of manifest.canonicalOwners) {
    assert.ok(read(owner.path).includes(owner.heading), `docs contract: missing canonical heading in ${owner.path}; rerun npm run verify:docs`);
    assert.ok(read('AGENTS.md').includes(owner.path), `docs contract: AGENTS.md does not route ${owner.path}; rerun npm run verify:docs`);
  }

  const packageJson = json('package.json');
  unique(manifest.focusedChecks.map(({ id }) => id), 'focused check id');
  unique(manifest.focusedChecks.map(({ packageScript }) => packageScript), 'focused package script');
  for (const check of manifest.focusedChecks) {
    assert.ok(packageJson.scripts[check.packageScript], `docs contract: missing package script ${check.packageScript}; rerun npm run verify:docs`);
    assert.equal(check.command, `npm run ${check.packageScript}`, `docs contract: command drift for ${check.id}; rerun npm run verify:docs`);
  }
  assert.equal(packageJson.scripts['verify:ci'], 'npm run verify:milestone', 'docs contract: verify:ci must delegate to milestone once; rerun npm run verify:docs');
  for (const name of ['verify:fast', 'verify:story', 'verify:milestone', 'verify:ci']) {
    assert.ok(read('docs/testing.md').includes(`npm run ${name}`), `docs contract: docs/testing.md omits ${name}; rerun npm run verify:docs`);
  }

  const g001a = manifest.stories.find(({ id }) => id === 'G001A-establish-ai-native-foundation');
  assert.equal(g001a.activation, 'active');
  unique(g001a.checks, 'G001A check');
  for (const id of g001a.checks) assert.equal(manifest.focusedChecks.find((check) => check.id === id)?.activation, 'active', `docs contract: G001A invokes non-active ${id}`);
  assert.equal(manifest.tiers.fast.readinessClaim, 'diagnostic-only');
  assert.deepEqual(manifest.tiers.ci.checks, ['milestone-once']);

  assert.deepEqual(host.publicApis, [], 'Host contract: G001A public API inventory must remain empty');
  assert.equal(host.inventoryStatus, 'deferred');
  unique(host.compatibilityDecisions.map(({ id }) => id), 'Host decision id');
  const roles = Object.fromEntries(controls.inputRoles.map((role) => [role.name, role]));
  assert.equal(roles.XMF.decision, 'include');
  assert.deepEqual({ decision: roles.XMS.decision, diagnostic: roles.XMS.diagnostic }, { decision: 'defer', diagnostic: 'UNSUPPORTED_INPUT_ROLE' });
  const registry = Object.fromEntries(controls.controls.map((control) => [control.normalizedType, control]));
  assert.deepEqual(registry.Label.sourceTags, ['LABEL']);
  assert.deepEqual(registry.Edit.sourceTags, ['EDIT']);
  assert.deepEqual(registry.Button.sourceTags, ['BUTTON']);
  assert.deepEqual(registry.Button.semanticFamilies, ['CtlButton']);
  assert.deepEqual(registry.unsupported.semanticFamilies, ['CtlImage']);
  assert.equal(registry.unsupported.decision, 'defer');

  unique(manifest.integrity.map(({ path: file }) => file), 'integrity path');
  for (const entry of manifest.integrity) {
    const bytes = fs.readFileSync(path.join(root, entry.path));
    assert.equal(sha256(bytes), entry.sha256, `docs contract: integrity drift in ${entry.path}; rerun npm run verify:docs after updating the manifest with reviewed bytes`);
  }
  console.log('PASS docs: owners, links, schemas, commands, contracts, and hashes agree');
}

function productionFile(file) {
  return /\.(?:[cm]m?|c(?:c|pp|xx)?|h(?:h|pp)?|swift|java|kt|kts|js|jsx|ts|tsx)$/i.test(file) &&
    !/^(?:scripts|test|contracts|verification)\//.test(file) &&
    !file.startsWith('.omx/');
}

export function policyViolations(files, packageJson, host, controls) {
  const violations = [];
  const apiNames = new Set(host.publicApis.map(({ name }) => name));
  const controlNames = new Set(controls.controls.filter(({ decision }) => decision === 'include').map(({ normalizedType }) => normalizedType));
  const bannedPathOrImport = /(?:^|[/'"_-])(?:mvigsengine|legacy-engine)(?:[/'"_.-]|$)/i;
  const osDispatch = /\bPlatform\s*\.\s*(?:OS|select)\b|\bprocess\.env\.(?:IOS|ANDROID)\b|\bselectNativeModule\s*\(/;
  const identityDispatch = /\b(?:if|switch)\s*\([^\n)]*\b(?:screen|control|transaction|asset|layout)(?:Id|Hash|Signature)\b/i;
  const screenRegistration = /\b(?:registerScreen|screenIdMap|screenRegistry)\b/;
  const forbiddenTransport = /\b(?:s?ftp):\/\//i;
  const cdnMutation = /\bcdn\b[\s\S]{0,160}\b(?:POST|PUT|PATCH|DELETE|upload|purge|invalidate)\b/i;

  for (const { file, text } of files) {
    if (bannedPathOrImport.test(file) || bannedPathOrImport.test(text)) violations.push(`${file}: forbidden path/dependency/direct import`);
    if (/\.(?:ios|android)\.(?:js|jsx|ts|tsx)$/i.test(file)) violations.push(`${file}: platform-suffixed RN/product module`);
    if (osDispatch.test(text)) violations.push(`${file}: OS-selected Host/control behavior`);
    if (identityDispatch.test(text)) violations.push(`${file}: identity-selected behavior`);
    if (screenRegistration.test(text)) violations.push(`${file}: build-time screen registration`);
    if (forbiddenTransport.test(text)) violations.push(`${file}: FTP/SFTP access`);
    if (cdnMutation.test(text)) violations.push(`${file}: CDN mutation`);
    for (const match of text.matchAll(/\bHost\.([A-Za-z][A-Za-z0-9_.]*)/g)) {
      if (!apiNames.has(match[1])) violations.push(`${file}: public Host API omitted from manifest: ${match[1]}`);
    }
    for (const match of text.matchAll(/\bregisterControl\(\s*['"]([A-Za-z][A-Za-z0-9]*)['"]/g)) {
      if (!controlNames.has(match[1])) violations.push(`${file}: public control omitted from registry: ${match[1]}`);
    }
  }
  for (const dependency of Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies })) {
    if (/^(?:mvigsengine|react-native-lua)$/i.test(dependency)) violations.push(`package.json: forbidden dependency ${dependency}`);
  }
  for (const script of Object.keys(packageJson.scripts ?? {})) {
    if (/^(?:deploy|publish|release)(?::|$)/.test(script)) violations.push(`package.json: prohibited remote/deployment script ${script}`);
  }
  for (const [script, command] of Object.entries(packageJson.scripts ?? {})) {
    if (/\b(?:npm\s+publish|expo\s+publish|eas\s+(?:build|submit|update)|fastlane\b|s?ftp\b|aws\s+s3\b)/i.test(command)) {
      violations.push(`package.json: prohibited remote/deployment command in ${script}`);
    }
  }
  return violations;
}

function verifyPolicy() {
  const files = allCandidateFiles().filter(productionFile).map((file) => ({ file, text: read(file) }));
  const violations = policyViolations(files, json('package.json'), json('contracts/host-api.json'), json('contracts/control-registry.json'));
  assert.deepEqual(violations, [], `policy contract:\n${violations.join('\n')}\nrerun npm run verify:policy`);
  console.log(`PASS policy: ${files.length} product source files satisfy objective gates`);
}

function verifyProvenance() {
  const oracle = json('test/oracles/manifest.json');
  const entries = [...oracle.sources, ...oracle.artifacts];
  unique(entries.map(({ path: file }) => file), 'oracle artifact path');
  for (const entry of entries) {
    const bytes = fs.readFileSync(path.join(root, entry.path));
    assert.equal(bytes.length, entry.bytes, `provenance contract: byte drift in ${entry.path}; rerun npm run verify:provenance`);
    assert.equal(sha256(bytes), entry.sha256, `provenance contract: hash drift in ${entry.path}; rerun npm run verify:provenance`);
  }
  console.log(`PASS provenance: ${entries.length} local oracle inventory hashes agree`);
}

export function storyChecks(goalId, manifest = loadManifest()) {
  const story = manifest.stories.find(({ id }) => id === goalId);
  assert.ok(story, `story contract: unknown goal ${goalId}`);
  if (story.activation === 'deferred') return { deferred: goalId, checks: [] };
  unique(story.checks, `${goalId} check`);
  return { deferred: null, checks: story.checks };
}

export function deferredMilestoneLayers(manifest = loadManifest()) {
  return manifest.layers.filter((layer) => layer.requiredForMilestone && layer.status === 'deferred');
}

function runChecks(ids, tier, manifest = loadManifest()) {
  unique(ids, `${tier} check`);
  const evidence = [];
  for (const id of ids) {
    const check = manifest.focusedChecks.find((item) => item.id === id);
    assert.ok(check, `${tier} contract: missing focused check ${id}`);
    assert.equal(check.activation, 'active', `${tier} contract: cannot run ${id} while ${check.activation}`);
    const started = performance.now();
    console.log(JSON.stringify({ event: 'CHECK_START', tier, id, command: check.command }));
    const result = spawnSync(check.argv[0], check.argv.slice(1), { cwd: root, stdio: 'inherit', env: { ...process.env, CI: process.env.CI ?? '0' } });
    const durationMs = Math.round(performance.now() - started);
    assert.equal(result.error, undefined, `${tier} contract: ${id} could not start: ${result.error?.message}`);
    assert.equal(result.status, 0, `${tier} contract: ${id} failed; rerun ${check.command}`);
    evidence.push({ id, command: check.command, invocationCount: 1, durationMs, exitCode: result.status });
    console.log(JSON.stringify({ event: 'CHECK_END', tier, ...evidence.at(-1) }));
  }
  return evidence;
}

function reportDeferred(id) {
  const manifest = loadManifest();
  const item = manifest.focusedChecks.find((check) => check.id === id) ?? manifest.layers.find((layer) => layer.id === id);
  assert.ok(item, `deferred contract: unknown layer ${id}`);
  assert.equal(item.activation ?? item.status, 'deferred', `deferred contract: ${id} is active`);
  console.log(`DEFERRED(${item.owner})`);
  console.log(JSON.stringify({ status: 'DEFERRED', layer: id, owningGoal: item.owner }));
}

function main(argv) {
  const [command, argument] = argv;
  if (command === 'format') return verifyFormat();
  if (command === 'docs') return verifyDocs();
  if (command === 'policy') return verifyPolicy();
  if (command === 'provenance') return verifyProvenance();
  if (command === 'deferred') return reportDeferred(argument);
  if (command === 'fast') {
    const evidence = runChecks(loadManifest().tiers.fast.checks, 'fast');
    console.log(JSON.stringify({ status: 'PASS', tier: 'fast', readiness: 'diagnostic-only', checks: evidence }));
    return;
  }
  if (command === 'story') {
    assert.ok(argument, 'story contract: goal id is required; rerun npm run verify:story -- <goal-id>');
    const resolved = storyChecks(argument);
    if (resolved.deferred) {
      console.log(`DEFERRED(${resolved.deferred})`);
      console.log(JSON.stringify({ status: 'DEFERRED', story: resolved.deferred }));
      process.exitCode = 2;
      return;
    }
    const evidence = runChecks(resolved.checks, 'story');
    console.log(JSON.stringify({ status: 'PASS', tier: 'story', story: argument, checks: evidence }));
    return;
  }
  if (command === 'milestone') {
    const manifest = loadManifest();
    const evidence = runChecks(manifest.tiers.milestone.checks, 'milestone', manifest);
    const deferred = deferredMilestoneLayers(manifest);
    if (deferred.length) {
      deferred.forEach(({ owner }) => console.log(`DEFERRED(${owner})`));
      console.log(JSON.stringify({ status: 'DEFERRED', tier: 'milestone', checks: evidence, layers: deferred }));
      process.exitCode = 2;
      return;
    }
    console.log(JSON.stringify({ status: 'PASS', tier: 'milestone', checks: evidence }));
    return;
  }
  throw new Error(`unknown verification command: ${command ?? '<missing>'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
