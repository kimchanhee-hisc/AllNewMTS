import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deferredMilestoneLayers,
  loadManifest,
  policyViolations,
  storyChecks,
  validateSchema
} from '../scripts/verify-foundation.mjs';
import fs from 'node:fs';

const json = (file) => JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));

test('foundation contracts fail closed', () => {
  const manifest = loadManifest();
  validateSchema(json('verification/manifest.schema.json'), manifest);
  assert.deepEqual(storyChecks('G001A-establish-ai-native-foundation', manifest).checks, [
    'format', 'docs', 'policy', 'type', 'unit', 'fixtures', 'provenance'
  ]);
  assert.deepEqual(deferredMilestoneLayers(manifest).map(({ id }) => id), ['native', 'runtime', 'ui', 'package']);

  const host = json('contracts/host-api.json');
  const controls = json('contracts/control-registry.json');
  const packageJson = { dependencies: {}, devDependencies: {}, scripts: {} };
  const probes = [
    { file: 'src/os.ts', text: 'if (Platform.OS) chooseHost();' },
    { file: 'src/screen.ts', text: 'if (screenId === value) chooseBehavior();' },
    { file: 'src/registry.ts', text: 'registerScreen(value);' },
    { file: 'src/transport.ts', text: 'const endpoint = "sftp://example.invalid";' },
    { file: 'src/host.ts', text: 'Host.NotDeclared();' },
    { file: 'src/control.ts', text: 'registerControl("NotDeclared");' }
  ];
  assert.equal(policyViolations(probes, packageJson, host, controls).length, probes.length);
  assert.match(policyViolations([], { ...packageJson, scripts: { ship: 'eas update' } }, host, controls)[0], /prohibited remote/);
  assert.match(policyViolations([], { ...packageJson, dependencies: { 'react-native-lua': '0.0.0' } }, host, controls)[0], /forbidden dependency/);
  assert.throws(() => storyChecks('G999-unknown', manifest));
});
