import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(root, 'node_modules/expo-modules-core');
const eventEmitter = path.join(packageRoot, 'ios/Core/Events/EventEmitter.swift');
const utilities = path.join(packageRoot, 'ios/Utilities/Utilities.swift');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const legacyHash = '66b5033150d788e6c392fda9c1abfe597ede029e08d378205847ee026cd1793d';
const fixedHash = '425a0e5c5b26fbee0ef668b620ca9d3686aa3bcd0ff770dfd7f897bc3ac761ce';
const utilitiesHash = '115312ddb3a4219b48ba5ae68a714481ae89a3c7ced6cf600f46de2b5a86e76e';

assert.deepEqual(process.argv.slice(2), process.argv[2] === '--check' ? ['--check'] : []);
const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
assert.deepEqual([metadata.name, metadata.version], ['expo-modules-core', '57.0.3']);
assert.equal(sha256(fs.readFileSync(utilities)), utilitiesHash, 'ExpoModulesCore weak Sendable wrapper drifted');

const original = fs.readFileSync(eventEmitter, 'utf8');
if (sha256(original) === fixedHash) {
  console.log('PASS ExpoModulesCore EventEmitter compatibility patch is present');
  process.exit(0);
}
assert.equal(process.argv[2], undefined, 'ExpoModulesCore EventEmitter compatibility patch is missing');
assert.equal(sha256(original), legacyHash, 'ExpoModulesCore EventEmitter source drifted');

const replacements = [
  [
    '    // the compiler send `self` into the `@JavaScriptActor` region. Capturing it as `nonisolated(unsafe)` is\n    // safe here because the scheduled closure only calls `withEventTarget`, which touches `@JavaScriptActor`-\n    // isolated or `Sendable` state (the JS object, the registry, `appContext`) and the emitter\'s identity -\n    // never the module\'s own mutable state.\n    nonisolated(unsafe) weak let emitter = self\n\n    runtime.schedule {\n      guard let emitter else {',
    '    // the compiler send `self` into the `@JavaScriptActor` region. Wrapping it in a weak, `@unchecked\n    // Sendable` box is safe here because the scheduled closure only calls `withEventTarget`, which touches\n    // `@JavaScriptActor`-isolated or `Sendable` state (the JS object, the registry, `appContext`) and the\n    // emitter\'s identity - never the module\'s own mutable state.\n    let emitter = NonisolatedUnsafeWeakVar(self)\n\n    runtime.schedule {\n      guard let emitter = emitter.value else {'
  ],
  [
    '    // See the note in `emit(event:payload:)` above - the emitter is captured as `nonisolated(unsafe)`\n    // because it isn\'t necessarily `Sendable`, and the scheduled closure only reaches `@JavaScriptActor`-\n    // isolated or `Sendable` state through it.\n    nonisolated(unsafe) weak let emitter = self\n\n    runtime.schedule { [weak appContext] in\n      guard let emitter, let appContext else {',
    '    // See the note in `emit(event:payload:)` above - the emitter is captured in a weak, `@unchecked\n    // Sendable` box because it isn\'t necessarily `Sendable`, and the scheduled closure only reaches\n    // `@JavaScriptActor`-isolated or `Sendable` state through it.\n    let emitter = NonisolatedUnsafeWeakVar(self)\n\n    runtime.schedule { [weak appContext] in\n      guard let emitter = emitter.value, let appContext else {'
  ]
];

const patched = replacements.reduce((source, [before, after]) => {
  assert.equal(source.split(before).length, 2, 'ExpoModulesCore EventEmitter patch context drifted');
  return source.replace(before, after);
}, original);
assert.equal(sha256(patched), fixedHash, 'ExpoModulesCore EventEmitter patch output drifted');
fs.writeFileSync(eventEmitter, patched);
console.log('PATCHED ExpoModulesCore EventEmitter for Xcode 26.3');
