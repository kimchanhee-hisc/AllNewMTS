import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeRepoFile, validateSchema } from './verify-foundation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(safeRepoFile(file), 'utf8');
const json = (file) => JSON.parse(read(file));
const run = (file, args, options = {}) => {
  const value = spawnSync(file, args, { cwd: root, encoding: 'utf8', ...options });
  assert.equal(value.error, undefined, `${file} failed to start: ${value.error?.message}`);
  assert.equal(value.status, 0, `${file} ${args.join(' ')} failed:\n${value.stdout ?? ''}${value.stderr ?? ''}`);
  return value.stdout ?? '';
};
const phase = (name, work) => { work(); console.log(`PASS runtime ${name}`); };

const host = json('contracts/host-api.json');
const sourceManifest = json('native/lua-source-manifest.json');

phase('contract-ledger', () => {
  validateSchema(json('contracts/host-api.schema.json'), host, 'Host API ledger');
  validateSchema(json('contracts/runtime-result.schema.json'), {
    schemaVersion: 1,
    snapshot: { runtimeId: '1', revision: '1', status: 'ok', event: 'Noop', lifecycle: 'OPEN', state: { controls: {}, data: {} } },
    commands: [], diagnostics: []
  }, 'runtime result sample');
  assert.equal(host.inventoryStatus, 'active'); assert.equal(host.publicApis.length, 18);
  assert.deepEqual(host.publicApis.map(({ name }) => name), [
    'Form.GetOpenLinkData','Form.GetSharedData','Form.GetItemCodeInfo','Form.MsgBoxEx','Form.Toast','Form.SendReturnToParent','Form.CloseForm',
    'DATAMANAGER.RequestTranData','DATAMANAGER.SetDataValue','DATAMANAGER.GetDataCount','DATAMANAGER.GetDataValue','Trim','dofile','Edit.caption','Button.border','Button.dfgcolor','Button.enable','Button.SetRadius'
  ]);
  assert.ok(host.publicApis.every(({ decision, affectedPlatforms, test }) => decision === 'include' && affectedPlatforms.join(',') === 'ios,android' && test));
});

phase('limits-security', () => {
  const source = read('modules/allnewmts-lua/shared/allnewmts_runtime.cpp');
  const luaBoundary = read('modules/allnewmts-lua/shared/allnewmts_runtime_lua.c');
  for (const literal of ['32u * 1024u * 1024u','8u * 1024u * 1024u','4u * 1024u * 1024u','256u * 1024u','1000000','milliseconds(500)','kPendingEvents = 64','kStageCommands = 1024','kTokens = 32']) assert.ok(source.includes(literal), `missing runtime limit ${literal}`);
  assert.doesNotMatch(source + luaBoundary, /luaL_openlibs\s*\(/); assert.match(luaBoundary, /clear_global\(state, "(?:loadfile|package|io|os|debug)"\)/);
  assert.doesNotMatch(source, /MVigsEngine|ftp|sftp|https?:\/\/|react-native-lua/i);
  const production = [source, read('modules/allnewmts-lua/src/runtime.ts'), read('modules/allnewmts-lua/ios/AllNewMTSRuntimeAdapter.mm'), read('modules/allnewmts-lua/android/runtime_jni.cpp')].join('\n');
  assert.doesNotMatch(production, /Success|Rollback|Timeout|CloseTwice|T_ALPHA/); assert.doesNotMatch(read('modules/allnewmts-lua/src/runtime.ts'), /Platform\.|Platform\.OS|\bios\b|\bandroid\b/);
});

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'allnewmts-runtime-'));
const include = ['-I','modules/allnewmts-lua/vendor/lua-5.1.5/src','-I','modules/allnewmts-lua/shared'];
const providerObjects = sourceManifest.compiledSources.map((source, index) => {
  const object = path.join(temp, `lua-${index}.o`); run(process.env.CC || 'cc', ['-w','-std=c99',...include,'-c',`${sourceManifest.vendoredRoot}/${source}`,'-o',object]); return object;
});
const provider = path.join(temp, 'liblua51.a'); run('ar',['rcs',provider,...providerObjects]);
const compileC = (source, name, definitions = []) => { const object=path.join(temp,`${name}.o`);run(process.env.CC||'cc',['-std=c99','-Wall','-Wextra','-Werror',...definitions,...include,'-c',source,'-o',object]);return object; };
const compileCxx = (source, name, definitions = []) => { const object=path.join(temp,`${name}.o`);run(process.env.CXX||'c++',['-std=c++17','-Wall','-Wextra','-Werror',...definitions,...include,'-c',source,'-o',object]);return object; };
const common = [compileC('modules/allnewmts-lua/shared/resource_bundle.c','resources',['-DALLNEWMTS_LUA_TESTING']),compileC('modules/allnewmts-lua/shared/sha256.c','sha')];
const runtimeObjects = [compileCxx('modules/allnewmts-lua/shared/allnewmts_runtime.cpp','runtime',['-DALLNEWMTS_RUNTIME_TESTING']),compileC('modules/allnewmts-lua/shared/allnewmts_runtime_lua.c','runtime-lua',['-DALLNEWMTS_RUNTIME_TESTING']),compileC('modules/allnewmts-lua/shared/allnewmts_runtime_adapters.c','runtime-adapter-common'),compileC('modules/allnewmts-lua/ios/allnewmts_runtime_ios_adapter.c','runtime-ios'),compileC('modules/allnewmts-lua/android/allnewmts_runtime_android_adapter.c','runtime-android'),...common];
const runtimeTest = compileCxx('native/test/runtime_conformance_test.cpp','runtime-test',['-DALLNEWMTS_RUNTIME_TESTING']);
const executable = path.join(temp,'runtime-test'); run(process.env.CXX||'c++',[runtimeTest,...runtimeObjects,provider,'-lm','-pthread','-o',executable]);
const runtimeOutput = run(executable,[]); assert.match(runtimeOutput,/PASS production runtime conformance/);
phase('core-atomicity', () => assert.match(runtimeOutput,/PASS production runtime conformance/));
phase('lifecycle-tokens', () => assert.match(runtimeOutput,/PASS production runtime conformance/));
phase('isolation', () => assert.match(runtimeOutput,/PASS production runtime conformance/));

phase('adapter-parity', () => {
  const ios = read('modules/allnewmts-lua/ios/allnewmts_runtime_ios_adapter.c').replaceAll('ios','platform');
  const android = read('modules/allnewmts-lua/android/allnewmts_runtime_android_adapter.c').replaceAll('android','platform');
  assert.equal(ios, android); assert.match(read('modules/allnewmts-lua/ios/AllNewMTSRuntimeModule.swift'),/create[\s\S]+dispatch[\s\S]+destroy/);
  assert.match(read('modules/allnewmts-lua/android/src/main/java/com/allnewmts/lua/AllNewMTSRuntimeModule.kt'),/create[\s\S]+dispatch[\s\S]+destroy/);
  const sdk = run('xcrun', ['--sdk','iphonesimulator','--show-sdk-path']).trim();
  const appleCore=path.join(temp,'runtime-apple-core.o'),appleCommon=path.join(temp,'runtime-apple-common.o'),appleShim=path.join(temp,'runtime-apple-shim.o'),appleObjc=path.join(temp,'runtime-objc.o');
  run('xcrun', ['--sdk','iphonesimulator','clang++','-std=c++17','-arch','arm64','-mios-simulator-version-min=16.4','-isysroot',sdk,...include,'-c','modules/allnewmts-lua/shared/allnewmts_runtime.cpp','-o',appleCore]);
  for(const [source,output] of [['modules/allnewmts-lua/shared/allnewmts_runtime_adapters.c',appleCommon],['modules/allnewmts-lua/ios/allnewmts_runtime_ios_adapter.c',appleShim]])run('xcrun',['--sdk','iphonesimulator','clang','-std=c99','-arch','arm64','-mios-simulator-version-min=16.4','-isysroot',sdk,...include,'-c',source,'-o',output]);
  run('xcrun', ['--sdk','iphonesimulator','clang++','-std=c++17','-fobjc-arc','-arch','arm64','-mios-simulator-version-min=16.4','-isysroot',sdk,...include,'-c','modules/allnewmts-lua/ios/AllNewMTSRuntimeAdapter.mm','-o',appleObjc]);
  run('xcrun',['libtool','-static','-o',path.join(temp,'libAllNewMTSRuntime-focused.a'),appleCore,appleCommon,appleShim,appleObjc]);
  const androidSdk = process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk');
  const ndk = path.join(androidSdk, 'ndk/27.1.12297006');
  const cmake = path.join(androidSdk, 'cmake/3.22.1/bin/cmake');
  const ninja = path.join(androidSdk, 'cmake/3.22.1/bin/ninja');
  for (const required of [path.join(ndk,'build/cmake/android.toolchain.cmake'),cmake,ninja]) assert.ok(fs.existsSync(required), `missing pinned Android adapter compiler: ${required}`);
  const build = path.join(temp,'android');
  run(cmake,['-S','modules/allnewmts-lua/android','-B',build,'-G','Ninja',`-DCMAKE_TOOLCHAIN_FILE=${path.join(ndk,'build/cmake/android.toolchain.cmake')}`,'-DANDROID_ABI=arm64-v8a','-DANDROID_PLATFORM=android-23','-DANDROID_STL=c++_shared',`-DCMAKE_MAKE_PROGRAM=${ninja}`]);
  run(cmake,['--build',build,'--target','allnewmts_lua','-j','4']);
});

phase('narrow-g002-smokes', () => {
  const objects=[compileC('modules/allnewmts-lua/shared/allnewmts_lua.c','g002-core',['-DALLNEWMTS_LUA_TESTING']),compileC('modules/allnewmts-lua/ios/allnewmts_lua_ios_adapter.c','g002-ios'),compileC('modules/allnewmts-lua/android/allnewmts_lua_android_adapter.c','g002-android'),compileC('native/test/g002_narrow_smoke_test.c','g002-test'),...common];
  const smoke=path.join(temp,'g002-smoke');run(process.env.CC||'cc',[...objects,provider,'-lm','-o',smoke]);assert.match(run(smoke,[]),/PASS narrow G002 smokes/);
});

fs.rmSync(temp, { recursive: true, force: true });
console.log('PASS verify:runtime (focused; no story, UI, network, upstream adoption, or full native aggregator)');
