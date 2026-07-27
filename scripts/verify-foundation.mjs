import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contained = (base, candidate) => candidate === base || candidate.startsWith(`${base}${path.sep}`);

export function safeRepoFile(file, label = 'repository path', base = root) {
  assert.equal(typeof file, 'string', `${label}: path must be a string`);
  assert.ok(file && !file.includes('\0') && !file.includes('\\'), `${label}: invalid path`);
  assert.doesNotMatch(file, /^[A-Za-z]:/, `${label}: drive-relative path is forbidden`);
  assert.equal(path.posix.isAbsolute(file) || path.win32.isAbsolute(file), false, `${label}: path must be relative`);
  const segments = file.split('/');
  assert.ok(segments.every((segment) => segment && segment !== '.' && segment !== '..'), `${label}: path must be normalized`);
  assert.equal(path.posix.normalize(file), file, `${label}: path must be normalized`);
  const realBase = fs.realpathSync.native(base);
  const candidate = path.resolve(realBase, file);
  assert.ok(contained(realBase, candidate), `${label}: path escapes repository`);
  const stat = fs.lstatSync(candidate);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), `${label}: path must be a regular file`);
  const realCandidate = fs.realpathSync.native(candidate);
  assert.ok(contained(realBase, realCandidate), `${label}: real path escapes repository`);
  return realCandidate;
}

const read = (file) => fs.readFileSync(safeRepoFile(file, file), 'utf8');
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
  if (schema === true) return;
  if (schema === false) assert.fail(`${label}: boolean schema rejected value`);
  if (schema.$ref) {
    assert.ok(schema.$ref.startsWith('#/$defs/'), `${label}: unsupported schema reference`);
    return validateSchema(document.$defs[schema.$ref.slice('#/$defs/'.length)], value, label, document);
  }
  for (const child of schema.allOf ?? []) validateSchema(child, value, label, document);
  if (schema.not) {
    let matches = true;
    try {
      validateSchema(schema.not, value, label, document);
    } catch {
      matches = false;
    }
    assert.equal(matches, false, `${label}: matched forbidden schema`);
  }
  if (schema.oneOf) {
    let matches = 0;
    for (const child of schema.oneOf) {
      try {
        validateSchema(child, value, label, document);
        matches += 1;
      } catch {
        // A oneOf branch is allowed to reject; exactly one branch must accept.
      }
    }
    assert.equal(matches, 1, `${label}: expected exactly one oneOf match`);
  }
  if (schema.if) {
    let matches = true;
    try {
      validateSchema(schema.if, value, label, document);
    } catch {
      matches = false;
    }
    if (matches && schema.then) validateSchema(schema.then, value, label, document);
    if (!matches && schema.else) validateSchema(schema.else, value, label, document);
  }
  if (schema.type) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    assert.ok(expected.some((type) => hasType(value, type)), `${label}: expected ${expected.join('|')}`);
  }
  if ('const' in schema) assert.deepEqual(value, schema.const, `${label}: const mismatch`);
  if (schema.enum) assert.ok(schema.enum.includes(value), `${label}: value is not in enum`);
  if (schema.minLength !== undefined) assert.ok(value.length >= schema.minLength, `${label}: too short`);
  if (schema.maxLength !== undefined) assert.ok(value.length <= schema.maxLength, `${label}: too long`);
  if (schema.minimum !== undefined) assert.ok(value >= schema.minimum, `${label}: below minimum`);
  if (schema.pattern) assert.match(value, new RegExp(schema.pattern), `${label}: pattern mismatch`);
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined) assert.ok(value.length >= schema.minItems, `${label}: too few items`);
    if (schema.maxItems !== undefined) assert.ok(value.length <= schema.maxItems, `${label}: too many items`);
    if (schema.uniqueItems) assert.equal(new Set(value.map((item) => JSON.stringify(item))).size, value.length, `${label}: duplicate items`);
    const prefixLength = schema.prefixItems?.length ?? 0;
    schema.prefixItems?.forEach((child, index) => {
      if (index < value.length) validateSchema(child, value[index], `${label}[${index}]`, document);
    });
    if (schema.items === false) assert.ok(value.length <= prefixLength, `${label}: unexpected trailing items`);
    else if (schema.items) value.slice(prefixLength).forEach((item, offset) => validateSchema(schema.items, item, `${label}[${prefixLength + offset}]`, document));
    if (schema.contains) {
      let matches = 0;
      for (const [index, item] of value.entries()) {
        try {
          validateSchema(schema.contains, item, `${label}[${index}]`, document);
          matches += 1;
        } catch {
          // Non-matching array members are permitted outside the contains count.
        }
      }
      assert.ok(matches >= (schema.minContains ?? 1), `${label}: too few matching items`);
      if (schema.maxContains !== undefined) assert.ok(matches <= schema.maxContains, `${label}: too many matching items`);
    }
  }
  if (hasType(value, 'object')) {
    for (const key of schema.required ?? []) assert.ok(Object.hasOwn(value, key), `${label}: missing ${key}`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) assert.ok(Object.hasOwn(schema.properties ?? {}, key), `${label}: unknown ${key}`);
    } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (!Object.hasOwn(schema.properties ?? {}, key)) validateSchema(schema.additionalProperties, child, `${label}.${key}`, document);
      }
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, key)) validateSchema(child, value[key], `${label}.${key}`, document);
    }
  }
}

function allCandidateFiles() {
  const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root });
  return output.toString().split('\0').filter((file) => file && fs.existsSync(path.join(root, file)));
}

function foundationFiles() {
  return [
    '.gitattributes',
    'AGENTS.md',
    'README.md',
    'docs/specs/xmf-lua-runtime.md',
    'docs/specs/runtime-contract.md',
    'docs/testing.md',
    'docs/adr/0001-official-lua-5.1.5.md',
    'contracts/host-api.json',
    'contracts/host-api.schema.json',
    'contracts/runtime-result.schema.json',
    'contracts/control-registry.json',
    'contracts/control-registry.schema.json',
    'native/lua-source-manifest.json',
    'native/lua-source-manifest.schema.json',
    'verification/manifest.json',
    'verification/manifest.schema.json',
    'scripts/generate-g004-assets.mjs',
    'scripts/generate-native-assets.mjs',
    'scripts/patch-expo-modules-core.mjs',
    'scripts/run-g004-development-build.mjs',
    'scripts/run-gate0-development-build.mjs',
    'scripts/verify-foundation.mjs',
    'scripts/verify-native.mjs',
    'scripts/verify-runtime.mjs',
    'scripts/verify-ui.mjs',
    'test/foundation.test.mjs',
    'test/g004/g003-baseline.json',
    'test/g004/runtime-client-golden.json',
    'package.json'
  ];
}

export const expectedIntegrityPaths = [
  '.gitattributes',
  'AGENTS.md',
  'README.md',
  'docs/specs/xmf-lua-runtime.md',
  'docs/specs/runtime-contract.md',
  'docs/testing.md',
  'docs/adr/0001-official-lua-5.1.5.md',
  'contracts/host-api.json',
  'contracts/host-api.schema.json',
  'contracts/runtime-result.schema.json',
  'contracts/control-registry.json',
  'contracts/control-registry.schema.json',
  'native/lua-source-manifest.json',
  'native/lua-source-manifest.schema.json',
  'verification/manifest.schema.json',
  'package.json',
  'scripts/generate-g004-assets.mjs',
  'scripts/generate-native-assets.mjs',
  'scripts/patch-expo-modules-core.mjs',
  'scripts/run-g004-development-build.mjs',
  'scripts/run-gate0-development-build.mjs',
  'scripts/verify-foundation.mjs',
  'scripts/verify-native.mjs',
  'scripts/verify-runtime.mjs',
  'scripts/verify-ui.mjs',
  'test/foundation.test.mjs',
  'test/g004/g003-baseline.json',
  'test/g004/runtime-client-golden.json'
];

function verifyFormat() {
  for (const file of foundationFiles()) {
    safeRepoFile(file, `foundation input ${file}`);
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
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
    safeRepoFile(resolved, `docs link ${link} in ${file}`);
  }
}

function unique(items, label) {
  assert.equal(new Set(items).size, items.length, `docs contract: duplicate ${label}; rerun npm run verify:docs`);
}

export function verifyStoryDefinitions(manifest) {
  unique(manifest.stories.map(({ id }) => id), 'story id');
  for (const story of manifest.stories.filter(({ activation }) => activation === 'active')) {
    assert.ok(story.checks.length > 0, `story contract: active ${story.id} has no checks`);
    unique(story.checks, `${story.id} check`);
    for (const id of story.checks) {
      const check = manifest.focusedChecks.find((item) => item.id === id);
      assert.ok(check, `story contract: ${story.id} references missing ${id}`);
      assert.equal(check.activation, 'active', `story contract: ${story.id} references non-active ${id}`);
      assert.equal(check.owner, story.id, `story contract: ${story.id} does not own ${id}`);
    }
  }
}

export function verifyFocusedCommands(manifest, packageJson) {
  unique(manifest.focusedChecks.map(({ id }) => id), 'focused check id');
  unique(manifest.focusedChecks.map(({ packageScript }) => packageScript), 'focused package script');
  for (const check of manifest.focusedChecks) {
    assert.ok(packageJson.scripts[check.packageScript], `docs contract: missing package script ${check.packageScript}`);
    assert.equal(check.command, `npm run ${check.packageScript}`, `docs contract: command drift for ${check.id}`);
    assert.equal(packageJson.scripts[check.packageScript], check.argv.join(' '), `docs contract: executable drift for ${check.id}`);
  }
}

export function verifyActiveVerifierPaths(manifest, readVerifier = read) {
  const verifierScripts = [...new Set(manifest.focusedChecks
    .filter(({ activation }) => activation === 'active')
    .flatMap(({ argv }) => argv.filter((argument) => /^scripts\/.+\.mjs$/.test(argument))))];
  const sources = new Map();
  for (const verifier of verifierScripts) {
    safeRepoFile(verifier, `active verifier ${verifier}`);
    const source = readVerifier(verifier);
    sources.set(verifier, source);
    for (const match of source.matchAll(/\b(?:read|safeRepoFile)\(\s*(['"])([^'"`]+)\1/g)) {
      safeRepoFile(match[2], `literal repository input in active verifier ${verifier}`);
    }
  }
  const native = sources.get('scripts/verify-native.mjs');
  assert.ok(native, 'active G002 verifier source is missing');
  assert.match(native, /modules\/allnewmts-lua\/android\/src\/g002\/java\/com\/allnewmts\/lua\/AllNewMTSLuaModule\.kt/, 'active G002 verifier must read the flag-gated Kotlin source set');
  assert.doesNotMatch(native, /modules\/allnewmts-lua\/android\/src\/main\/java\/com\/allnewmts\/lua\/AllNewMTSLuaModule\.kt/, 'active G002 verifier must not reference the production Kotlin source set for the harness');
}

export function verifyContractInventories(host, controls) {
  unique(host.publicApis.map(({ name }) => name), 'Host API name');
  unique(host.compatibilityDecisions.map(({ id }) => id), 'Host decision id');
  unique(controls.inputRoles.map(({ name }) => name), 'input role');
  unique(controls.controls.map(({ id }) => id), 'control id');
  unique(controls.controls.map(({ normalizedType }) => normalizedType), 'normalized control type');
  unique(controls.controls.flatMap(({ sourceTags }) => sourceTags), 'source tag');
  unique(controls.controls.flatMap(({ semanticFamilies }) => semanticFamilies), 'semantic family');

  const included = controls.controls.filter(({ decision }) => decision === 'include');
  unique(included.map(({ normalizedType }) => normalizedType), 'included normalized control type');
  const tags = included.flatMap(({ sourceTags }) => sourceTags);
  const families = included.flatMap(({ semanticFamilies }) => semanticFamilies);
  unique(tags, 'included source tag');
  unique(families, 'included semantic family');
  assert.deepEqual(included.map(({ normalizedType }) => normalizedType).sort(), ['Button', 'Edit', 'Image', 'Label']);
  assert.deepEqual(tags.sort(), ['BUTTON', 'EDIT', 'IMAGE', 'LABEL']);
  assert.deepEqual(families, ['CtlButton', 'CtlImage']);
  for (const control of controls.controls.filter(({ decision }) => decision !== 'include')) {
    assert.ok(control.diagnostic, `control contract: ${control.id} must have an unsupported diagnostic`);
  }
}

export function verifyIntegrityInventory(manifest) {
  unique(manifest.integrity.map(({ path: file }) => file), 'integrity path');
  assert.deepEqual(manifest.integrity.map(({ path: file }) => file).sort(), [...expectedIntegrityPaths].sort(), 'docs contract: integrity inventory drift');
  for (const entry of manifest.integrity) {
    const bytes = fs.readFileSync(safeRepoFile(entry.path, `integrity ${entry.path}`));
    assert.equal(sha256(bytes), entry.sha256, `docs contract: integrity drift in ${entry.path}; rerun npm run verify:docs after updating the manifest with reviewed bytes`);
  }
}

function verifyDocs() {
  const manifest = loadManifest();
  const host = json('contracts/host-api.json');
  const controls = json('contracts/control-registry.json');
  validateSchema(json('verification/manifest.schema.json'), manifest, 'verification manifest');
  validateSchema(json('contracts/host-api.schema.json'), host, 'Host manifest');
  validateSchema(json('contracts/runtime-result.schema.json'), {
    schemaVersion: 1,
    snapshot: { runtimeId: '1', revision: '1', status: 'ok', event: 'Noop', lifecycle: 'OPEN', state: { controls: {}, data: {} } },
    commands: [],
    diagnostics: []
  }, 'runtime result sample');
  validateSchema(json('contracts/control-registry.schema.json'), controls, 'control registry');
  validateSchema(json('native/lua-source-manifest.schema.json'), json('native/lua-source-manifest.json'), 'Lua source manifest');

  const docs = ['AGENTS.md', 'README.md', ...manifest.canonicalOwners.map(({ path: file }) => file)];
  unique(docs, 'canonical owner path');
  docs.forEach((file) => safeRepoFile(file, `canonical owner ${file}`));
  docs.forEach(markdownLinks);
  for (const owner of manifest.canonicalOwners) {
    assert.ok(read(owner.path).includes(owner.heading), `docs contract: missing canonical heading in ${owner.path}; rerun npm run verify:docs`);
    assert.ok(read('AGENTS.md').includes(owner.path), `docs contract: AGENTS.md does not route ${owner.path}; rerun npm run verify:docs`);
  }

  const packageJson = json('package.json');
  verifyFocusedCommands(manifest, packageJson);
  verifyActiveVerifierPaths(manifest);
  assert.equal(packageJson.scripts['verify:ci'], 'npm run verify:milestone', 'docs contract: verify:ci must delegate to milestone once; rerun npm run verify:docs');
  for (const name of ['verify:fast', 'verify:story', 'verify:milestone', 'verify:ci']) {
    assert.ok(read('docs/testing.md').includes(`npm run ${name}`), `docs contract: docs/testing.md omits ${name}; rerun npm run verify:docs`);
  }

  verifyStoryDefinitions(manifest);
  const g001a = manifest.stories.find(({ id }) => id === 'G001A-establish-ai-native-foundation');
  assert.equal(g001a.activation, 'active');
  assert.equal(manifest.tiers.fast.readinessClaim, 'diagnostic-only');
  assert.deepEqual(manifest.tiers.ci.checks, ['milestone-once']);

  assert.equal(host.inventoryStatus, 'active');
  assert.equal(host.owningGoal, 'G003-implement-bounded-native-runtime');
  assert.deepEqual(host.publicApis.map(({ name }) => name), [
    'Form.GetOpenLinkData', 'Form.GetSharedData', 'Form.GetItemCodeInfo', 'Form.MsgBoxEx', 'Form.Toast', 'Form.SendReturnToParent', 'Form.CloseForm',
    'DATAMANAGER.RequestTranData', 'DATAMANAGER.SetDataValue', 'DATAMANAGER.GetDataCount', 'DATAMANAGER.GetDataValue', 'Trim', 'dofile',
    'Edit.caption', 'Button.border', 'Button.dfgcolor', 'Button.enable', 'Button.SetRadius'
  ]);
  assert.ok(host.publicApis.every(({ decision, affectedPlatforms, test }) => decision === 'include' && affectedPlatforms.join(',') === 'ios,android' && test));
  verifyContractInventories(host, controls);
  const roles = Object.fromEntries(controls.inputRoles.map((role) => [role.name, role]));
  assert.equal(roles.XMF.decision, 'include');
  assert.deepEqual({ decision: roles.XMS.decision, diagnostic: roles.XMS.diagnostic }, { decision: 'defer', diagnostic: 'UNSUPPORTED_INPUT_ROLE' });
  const registry = Object.fromEntries(controls.controls.map((control) => [control.normalizedType, control]));
  assert.deepEqual(registry.Label.sourceTags, ['LABEL']);
  assert.deepEqual(registry.Edit.sourceTags, ['EDIT']);
  assert.deepEqual(registry.Button.sourceTags, ['BUTTON']);
  assert.deepEqual(registry.Button.semanticFamilies, ['CtlButton']);
  assert.deepEqual(registry.Image.sourceTags, ['IMAGE']);
  assert.deepEqual(registry.Image.semanticFamilies, ['CtlImage']);
  assert.equal(registry.Image.decision, 'include');

  verifyIntegrityInventory(manifest);
  console.log('PASS docs: owners, links, schemas, commands, contracts, and hashes agree');
}

const jsTsFile = (file) => /\.(?:js|jsx|mjs|cjs|ts|tsx)$/i.test(file);
const behaviorFile = (file) => jsTsFile(file) && !/^(?:scripts|test|contracts|verification)\//.test(file) && !file.startsWith('.omx/');
const buildConfigFile = (file) => /(?:^|\/)(?:CMakeLists\.txt|Makefile|Podfile)$|\.(?:cmake|podspec|gradle|kts|pbxproj|xcconfig|xml|json|plist|properties|entitlements|mk)$/i.test(file);
const textPolicyFile = (file) => !file.startsWith('.omx/') && (jsTsFile(file) || buildConfigFile(file) || /\.(?:c|cc|cpp|cxx|h|hpp|m|mm|swift|java|kt|lua|sh|bash|zsh|ya?ml|toml|txt|source|qry|xmf_)$/i.test(file));
const forbiddenArtifact = /(?:^|[/'"_-])(?:mvigsengine|legacy-engine)(?:[/'"_.-]|$)/i;
const forbiddenReference = /\b(?:mvigsengine|legacy-engine)\b/i;
const remoteProtocol = /\b(?:s?ftp):\/\//i;
const remoteCommand = /\b(?:npm\s+publish|expo\s+publish|eas\s+(?:build|submit|update)|fastlane\b|rsync\b|scp\b|aws\s+s3\b|git\s+push|gh\s+release|vercel\b|netlify\s+deploy|firebase\s+deploy|kubectl\s+apply|curl\b[^\n]*(?:(?:--request|-X)\s*(?:POST|PUT|PATCH|DELETE)|(?:--upload-file|-T|--data(?:-raw|-binary|-urlencode)?|-d|--form|-F)\b))/i;
const cdnMutationName = /(?:cdn[A-Za-z0-9_]*(?:post|put|patch|deploy|publish|configure|config|purge|delete|remove|invalidate|upload)|(?:post|put|patch|deploy|publish|configure|config|purge|delete|remove|invalidate|upload)[A-Za-z0-9_]*cdn)/i;
const cdnMutationText = /(?:cdn[\s\S]{0,160}(?:POST|PUT|PATCH|DELETE|deploy|publish|configure|config|remove|purge|invalidate|upload)|(?:POST|PUT|PATCH|DELETE|deploy|publish|configure|config|remove|purge|invalidate|upload)[\s\S]{0,160}cdn)/i;

function scriptKind(file) {
  if (/\.tsx$/i.test(file)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(file)) return ts.ScriptKind.JSX;
  if (/\.(?:js|mjs|cjs)$/i.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function memberName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && node.argumentExpression && (ts.isStringLiteral(node.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))) {
    return node.argumentExpression.text;
  }
  return null;
}

function receiver(node) {
  return ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) ? node.expression : null;
}

function containsIdentity(node) {
  let found = false;
  const visit = (child) => {
    if (ts.isIdentifier(child) && /^(?:screen|control|transaction|asset|layout)(?:Id|Hash|Signature)$/i.test(child.text)) found = true;
    if (!found) ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function hasCdnIdentity(node) {
  let found = false;
  const visit = (child) => {
    if ((ts.isIdentifier(child) || ts.isStringLiteralLike(child)) && /cdn/i.test(child.text)) found = true;
    if (!found) ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

const mutationMethod = /^(?:POST|PUT|PATCH|DELETE|purge|remove|invalidate|upload)$/i;
function hasMutationMethod(node) {
  let found = false;
  const visit = (child) => {
    const property = ts.isPropertyAssignment(child) && (ts.isIdentifier(child.name) || ts.isStringLiteralLike(child.name)) ? child.name.text : null;
    if (ts.isPropertyAssignment(child) && /^(?:method|httpMethod)$/i.test(property ?? child.name.getText()) && ts.isStringLiteralLike(child.initializer) && mutationMethod.test(child.initializer.text)) found = true;
    if (!found) ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function astViolations(file, text, host, controls, behavioral) {
  const violations = [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const apiNames = new Set(host.publicApis.map(({ name }) => name));
  const controlNames = new Set(controls.controls.filter(({ decision }) => decision === 'include').map(({ normalizedType }) => normalizedType));
  const add = (message) => violations.push(`${file}: ${message}`);

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (forbiddenReference.test(specifier)) add('forbidden direct import');
      if (behavioral && /\.(?:ios|android)(?:\.[cm]?[jt]sx?)?$/i.test(specifier)) add('platform-suffixed RN/product import');
    }
    if (ts.isStringLiteralLike(node)) {
      if (/cdn/i.test(node.text) && remoteProtocol.test(node.text)) add('product CDN FTP/SFTP access');
      if (/cdn/i.test(node.text) && remoteCommand.test(node.text)) add('product CDN publication/mutation command');
    }
    if (behavioral) {
      const name = memberName(node);
      const base = receiver(node);
      if (base && ts.isIdentifier(base) && base.text === 'Platform' && /^(?:OS|select)$/.test(name ?? '')) add('OS-selected Host/control behavior');
      if (base && /^(?:process\.env|NativeModules)$/i.test(base.getText(source)) && /^(?:IOS|ANDROID|EXPO_OS|PLATFORM|IOSHost|AndroidHost)$/i.test(name ?? '')) add('OS-selected Host/control behavior');
      if (ts.isCallExpression(node)) {
        const calleeName = ts.isIdentifier(node.expression) ? node.expression.text : memberName(node.expression);
        const calleeBase = receiver(node.expression);
        const calleeText = node.expression.getText(source);
        if (/^(?:selectNativeModule)$/i.test(calleeName ?? '')) add('OS-selected native module');
        if (/^(?:(?:register|add|define).*Screen|Screen.*(?:register|add|define))$/i.test(calleeName ?? '') ||
            (calleeBase && /screen/i.test(calleeBase.getText(source)) && /^(?:register|add|set)$/.test(calleeName ?? ''))) add('build-time screen registration');
        const fetchMutation = calleeName === 'fetch' && node.arguments[0] && hasCdnIdentity(node.arguments[0]) && node.arguments.slice(1).some(hasMutationMethod);
        const clientMutation = (hasCdnIdentity(node.expression) || node.arguments.some(hasCdnIdentity)) && (mutationMethod.test(calleeName ?? '') || node.arguments.some(hasMutationMethod));
        if (cdnMutationName.test(calleeText) || fetchMutation || clientMutation) add('CDN mutation');
        if (ts.isIdentifier(node.expression) && node.expression.text === 'registerControl' && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) && !controlNames.has(node.arguments[0].text)) {
          add(`public control omitted from registry: ${node.arguments[0].text}`);
        }
      }
      if ((ts.isIfStatement(node) || ts.isSwitchStatement(node) || ts.isConditionalExpression(node)) && containsIdentity(ts.isIfStatement(node) ? node.expression : node.expression ?? node.condition)) {
        add('identity-selected behavior');
      }
      if (ts.isElementAccessExpression(node) && node.argumentExpression && containsIdentity(node.argumentExpression) && /(?:handler|behavior|screen|control|transaction|asset|layout)/i.test(node.expression.getText(source))) {
        add('computed identity-selected behavior');
      }
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Host' && !apiNames.has(node.name.text)) {
        add(`public Host API omitted from manifest: ${node.name.text}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}

function stripComments(text, lineMarkers, blockPairs) {
  let output = '';
  let quote = null;
  let blockEnd = null;
  for (let index = 0; index < text.length; index += 1) {
    if (blockEnd) {
      if (text.startsWith(blockEnd, index)) {
        index += blockEnd.length - 1;
        blockEnd = null;
      } else output += text[index] === '\n' ? '\n' : ' ';
      continue;
    }
    const char = text[index];
    if (quote) {
      output += char;
      if (char === '\\' && index + 1 < text.length) output += text[index += 1];
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      output += char;
      continue;
    }
    const block = blockPairs.find(([start]) => text.startsWith(start, index));
    if (block) {
      blockEnd = block[1];
      index += block[0].length - 1;
      continue;
    }
    const line = lineMarkers.find((marker) => text.startsWith(marker, index));
    if (line) {
      while (index < text.length && text[index] !== '\n') index += 1;
      output += '\n';
      continue;
    }
    output += char;
  }
  return output;
}

function stripRubyBlockComments(text) {
  let comment = false;
  return text.split('\n').map((line) => {
    if (!comment && /^\s*=begin(?:\s|$)/.test(line)) comment = true;
    const stripped = comment ? '' : line;
    if (comment && /^\s*=end(?:\s|$)/.test(line)) comment = false;
    return stripped;
  }).join('\n');
}

function configBehaviorText(file, text) {
  let normalized = text;
  if (/\.podspec$/i.test(file)) normalized = stripRubyBlockComments(normalized);
  if (/\.properties$/i.test(file)) normalized = normalized.split('\n').map((line) => /^\s*[#!]/.test(line) ? '' : line).join('\n');
  const lineMarkers = [];
  const blockPairs = [];
  if (/\.(?:gradle|kts|pbxproj|xcconfig)$/i.test(file)) {
    lineMarkers.push('//');
    blockPairs.push(['/*', '*/']);
  }
  if (/\.(?:xml|plist)$/i.test(file)) blockPairs.push(['<!--', '-->']);
  if (/\.cmake$/i.test(file) || /(?:^|\/)CMakeLists\.txt$/.test(file)) blockPairs.push(['#[[', ']]']);
  if (/\.(?:cmake|podspec|mk)$/i.test(file) || /(?:^|\/)(?:CMakeLists\.txt|Makefile|Podfile)$/.test(file)) lineMarkers.push('#');
  return stripComments(normalized, lineMarkers, blockPairs);
}

export function policyViolations(files, packageJson, host, controls) {
  const violations = [];
  for (const { file, text = '' } of files) {
    if (forbiddenArtifact.test(file)) violations.push(`${file}: forbidden artifact/path`);
    const behavioral = behaviorFile(file);
    if (behavioral && /\.(?:ios|android)\.(?:js|jsx|ts|tsx)$/i.test(file)) violations.push(`${file}: platform-suffixed RN/product module`);
    if (jsTsFile(file)) violations.push(...astViolations(file, text, host, controls, behavioral));
    else if (text) {
      if (/cdn/i.test(text) && remoteProtocol.test(text)) violations.push(`${file}: product CDN FTP/SFTP access`);
      if ((buildConfigFile(file) || /^(?:test|evidence)\//.test(file)) && forbiddenReference.test(text)) violations.push(`${file}: forbidden artifact/reference`);
      const behaviorText = buildConfigFile(file) ? configBehaviorText(file, text) : text;
      if (/cdn/i.test(behaviorText) && remoteCommand.test(behaviorText)) violations.push(`${file}: product CDN publication/mutation command`);
      if (buildConfigFile(file) && (cdnMutationName.test(behaviorText) || cdnMutationText.test(behaviorText))) violations.push(`${file}: CDN mutation`);
    }
  }

  for (const dependency of Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies })) {
    if (/^mvigsengine$/i.test(dependency)) violations.push(`package.json: forbidden dependency ${dependency}`);
  }
  for (const [script, command] of Object.entries(packageJson.scripts ?? {})) {
    if ((/cdn/i.test(command) && (remoteCommand.test(command) || remoteProtocol.test(command))) || cdnMutationText.test(command)) violations.push(`package.json: prohibited product CDN command in ${script}`);
  }
  return violations;
}

function verifyPolicy() {
  const candidates = allCandidateFiles();
  const files = candidates.map((file) => ({ file, text: textPolicyFile(file) ? read(file) : '' }));
  const violations = policyViolations(files, json('package.json'), json('contracts/host-api.json'), json('contracts/control-registry.json'));
  assert.deepEqual(violations, [], `policy contract:\n${violations.join('\n')}\nrerun npm run verify:policy`);
  console.log(`PASS policy: ${candidates.length} repository paths and ${files.filter(({ text }) => text).length} text/build/config surfaces satisfy objective gates`);
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
  verifyStoryDefinitions(manifest);
  const story = manifest.stories.find(({ id }) => id === goalId);
  assert.ok(story, `story contract: unknown goal ${goalId}`);
  if (story.activation === 'deferred') return { deferred: goalId, checks: [] };
  assert.ok(story.checks.length > 0, `story contract: active ${goalId} has no checks`);
  return { deferred: null, checks: story.checks };
}

export function deferredMilestoneLayers(manifest = loadManifest()) {
  return manifest.layers.filter((layer) => layer.requiredForMilestone && layer.status === 'deferred');
}

function runChecks(ids, tier, manifest = loadManifest()) {
  assert.ok(ids.length > 0, `${tier} contract: no checks resolved`);
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
