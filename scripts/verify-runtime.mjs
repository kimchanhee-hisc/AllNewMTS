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
const filesUnder = (directory, suffix) => {
  const output = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) visit(candidate);
      else if (!suffix || entry.name.endsWith(suffix)) output.push(candidate);
    }
  };
  visit(directory);
  return output.sort();
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
  assert.doesNotMatch(source, /std::map<uint64_t,std::string>\s+\w+\s*=\s*tokens_/, 'token commit must not copy the published token map');
  assert.match(source, /for\(const auto &token:stage\.tokens\)if\(tokens_\.count\(token\.first\)\)throw std::bad_alloc\(\);tokens_\.merge\(stage\.tokens\)/, 'token commit must precheck collisions and transfer nodes without copying strings');
  for (const literal of ['32u * 1024u * 1024u','8u * 1024u * 1024u','4u * 1024u * 1024u','256u * 1024u','1000000','milliseconds(500)','kPendingEvents = 64','kStageCommands = 1024','kTokens = 32']) assert.ok(source.includes(literal), `missing runtime limit ${literal}`);
  assert.doesNotMatch(source + luaBoundary, /luaL_openlibs\s*\(/); assert.match(luaBoundary, /clear_global\(state, "(?:loadfile|package|io|os|debug)"\)/);
  assert.doesNotMatch(source, /MVigsEngine|ftp|sftp|https?:\/\/|react-native-lua/i);
  const production = [source, read('modules/allnewmts-lua/src/runtime.ts'), read('modules/allnewmts-lua/ios/AllNewMTSRuntimeAdapter.mm'), read('modules/allnewmts-lua/android/runtime_jni.cpp')].join('\n');
  assert.doesNotMatch(production, /Success|Rollback|Timeout|CloseTwice|T_ALPHA/); assert.doesNotMatch(read('modules/allnewmts-lua/src/runtime.ts'), /Platform\.|Platform\.OS|\bios\b|\bandroid\b/);
});

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'allnewmts-runtime-'));
const cleanupTemp = () => fs.rmSync(temp, { recursive: true, force: true });
process.once('exit', cleanupTemp);
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
const captureDirectory = path.join(temp, 'envelopes'); fs.mkdirSync(captureDirectory);
const runtimeOutput = run(executable,[],{ env: { ...process.env, ALLNEWMTS_RUNTIME_CAPTURE_DIR: captureDirectory } }); assert.match(runtimeOutput,/PASS production runtime conformance/);
const emittedEnvelopes = fs.readdirSync(captureDirectory).map((file) => JSON.parse(fs.readFileSync(path.join(captureDirectory, file), 'utf8')));
assert.ok(emittedEnvelopes.length >= 30, 'hostile conformance emitted too few canonical envelopes');
for (const [index, envelope] of emittedEnvelopes.entries()) validateSchema(json('contracts/runtime-result.schema.json'), envelope, `runtime envelope ${index}`);
phase('core-atomicity', () => assert.match(runtimeOutput,/PASS production runtime conformance/));
phase('lifecycle-tokens', () => assert.match(runtimeOutput,/PASS production runtime conformance/));
phase('isolation', () => assert.match(runtimeOutput,/PASS production runtime conformance/));

phase('adapter-parity', () => {
  const adapterGoldenTest = compileCxx('native/test/runtime_adapter_golden_test.cpp', 'runtime-adapter-golden-test');
  const adapterGoldenExecutable = path.join(temp, 'runtime-adapter-golden-test');
  run(process.env.CXX || 'c++', [adapterGoldenTest, ...runtimeObjects, provider, '-lm', '-pthread', '-o', adapterGoldenExecutable]);
  const expectedGolden = read('native/test/runtime-adapter-golden.json').trim();
  const fixtureHash = sourceManifest.resources.find(({ logicalPath }) => logicalPath === 'fixtures/runtime-conformance.lua').sha256;
  const adapterConfig = JSON.stringify({
    schemaVersion: 1,
    entry: { path: 'fixtures/runtime-conformance.lua', sha256: fixtureHash },
    host: { openLinkData: 'open', sharedData: { shared: 'shared-value' }, itemCodeInfo: [{ code: 'item', kind: 'markettext', marketLink: '', value: 'item-value' }] },
    controls: [{ id: 'Input', type: 'Edit', properties: { caption: 'initial' } }, { id: 'Action', type: 'Button', properties: { border: 'none', dfgcolor: 'black', enabled: false } }],
    transactions: [{ id: 'T_ALPHA', blocks: [{ id: 'input', fields: ['value'] }, { id: 'output', fields: ['value'] }] }]
  });
  const adapterEvent = JSON.stringify({ schemaVersion: 1, kind: 'handler', baseRevision: '0', handler: 'Noop', arguments: [], controlMutations: [] });
  const iosGolden = run(adapterGoldenExecutable, ['ios']).trim();
  const androidGolden = run(adapterGoldenExecutable, ['android']).trim();
  assert.equal(iosGolden, expectedGolden); assert.equal(androidGolden, expectedGolden);
  validateSchema(json('contracts/runtime-result.schema.json'), JSON.parse(iosGolden), 'iOS adapter golden');
  validateSchema(json('contracts/runtime-result.schema.json'), JSON.parse(androidGolden), 'Android adapter golden');
  const ios = read('modules/allnewmts-lua/ios/allnewmts_runtime_ios_adapter.c').replaceAll('ios','platform');
  const android = read('modules/allnewmts-lua/android/allnewmts_runtime_android_adapter.c').replaceAll('android','platform');
  assert.equal(ios, android); assert.match(read('modules/allnewmts-lua/ios/AllNewMTSRuntimeModule.swift'),/create[\s\S]+dispatch[\s\S]+destroy/);
  assert.match(read('modules/allnewmts-lua/android/src/main/java/com/allnewmts/lua/AllNewMTSRuntimeModule.kt'),/create[\s\S]+dispatch[\s\S]+destroy/);

  const objcAdapter = path.join(temp, 'runtime-objc-host.o');
  const objcGoldenTest = path.join(temp, 'runtime-objc-golden-test.o');
  for (const [source, output] of [
    ['modules/allnewmts-lua/ios/AllNewMTSRuntimeAdapter.mm', objcAdapter],
    ['native/test/runtime_objc_adapter_golden_test.mm', objcGoldenTest]
  ]) run('xcrun', ['clang++','-std=c++17','-fobjc-arc','-fblocks','-Wall','-Wextra','-Werror','-I','modules/allnewmts-lua/ios',...include,'-c',source,'-o',output]);
  const objcGoldenExecutable = path.join(temp, 'runtime-objc-golden-test');
  run('xcrun', ['clang++',objcAdapter,objcGoldenTest,...runtimeObjects,provider,'-framework','Foundation','-lm','-pthread','-o',objcGoldenExecutable]);
  assert.equal(run(objcGoldenExecutable, [adapterConfig, adapterEvent, expectedGolden]).trim(), expectedGolden);

  const swiftStubLibrary = path.join(temp, 'libExpoModulesCore.dylib');
  run('xcrun', ['swiftc','-emit-library','-emit-module','-module-name','ExpoModulesCore','native/test/runtime_swift_expo_stub.swift','-o',swiftStubLibrary]);
  const swiftGoldenExecutable = path.join(temp, 'runtime-swift-module-golden-test');
  run('xcrun', ['swiftc','-I',temp,'-L',temp,'-lExpoModulesCore','-import-objc-header','modules/allnewmts-lua/ios/AllNewMTSRuntimeAdapter.h','modules/allnewmts-lua/ios/AllNewMTSRuntimeModule.swift','native/test/runtime_swift_module_golden_test.swift',objcAdapter,...runtimeObjects,provider,'-Xlinker','-lm','-Xlinker','-lc++','-o',swiftGoldenExecutable]);
  assert.equal(run(swiftGoldenExecutable, [adapterConfig, adapterEvent], { env: { ...process.env, DYLD_LIBRARY_PATH: temp } }).trim(), expectedGolden);

  const productionKotlinRoot = path.join(root, 'modules/allnewmts-lua/android/src/main/java');
  const verificationKotlinRoot = path.join(root, 'modules/allnewmts-lua/android/src/g002/java');
  const productionKotlin = filesUnder(productionKotlinRoot, '.kt');
  const verificationKotlin = filesUnder(verificationKotlinRoot, '.kt');
  assert.ok(productionKotlin.every((file) => !/AllNewMTSLuaModule\.kt$/.test(file) && !read(path.relative(root, file)).includes('Function("evaluate")')));
  assert.deepEqual(verificationKotlin.map((file) => path.basename(file)), ['AllNewMTSLuaModule.kt']);
  const gradleSourceSets = read('modules/allnewmts-lua/android/build.gradle');
  assert.match(gradleSourceSets, /EXPO_PUBLIC_G002_NATIVE_HARNESS[\s\S]+src\/g002\/java/);

  const javaHome = process.env.JAVA_HOME || '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
  const java = path.join(javaHome, 'bin/java');
  const hostAndroidSdk = process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk');
  const javaInclude = path.join(hostAndroidSdk, 'ndk/27.1.12297006/toolchains/llvm/prebuilt/darwin-x86_64/sysroot/usr/include');
  assert.ok(fs.existsSync(java), `missing pinned Android Studio JBR: ${javaHome}`);
  assert.ok(fs.existsSync(path.join(javaInclude, 'jni.h')), `missing pinned Android JNI headers: ${javaInclude}`);
  const gradleRoot = path.join(os.homedir(), '.gradle/wrapper/dists/gradle-8.13-bin');
  const gradleLibraries = filesUnder(gradleRoot, '.jar').find((file) => /gradle-8\.13\/lib\/kotlin-compiler-embeddable-[^/]+\.jar$/.test(file));
  assert.ok(gradleLibraries, 'missing cached Gradle 8.13 Kotlin compiler');
  const gradleLib = path.dirname(gradleLibraries);
  const kotlinStdlib = filesUnder(gradleLib, '.jar').find((file) => /kotlin-stdlib-[^/]+\.jar$/.test(file));
  assert.ok(kotlinStdlib, 'missing cached Kotlin stdlib');
  const kotlinClasses = path.join(temp, 'kotlin-classes'); fs.mkdirSync(kotlinClasses);
  const kotlinSources = [
    'native/test/runtime_android_os_stubs.kt',
    'native/test/runtime_expo_kotlin_stubs.kt',
    ...productionKotlin,
    'native/test/runtime_kotlin_module_golden_test.kt'
  ];
  run(java, ['-cp',`${gradleLib}/*`,'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-jvm-target','17','-classpath',kotlinStdlib,'-d',kotlinClasses,...kotlinSources]);
  const g002Classes = path.join(temp, 'g002-kotlin-classes'); fs.mkdirSync(g002Classes);
  run(java, ['-cp',`${gradleLib}/*`,'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-jvm-target','17','-classpath',kotlinStdlib,'-d',g002Classes,'native/test/runtime_expo_kotlin_g002_stubs.kt',...verificationKotlin], { env: { ...process.env, EXPO_PUBLIC_G002_NATIVE_HARNESS: '1' } });

  const hostJni = path.join(temp, 'runtime-host-jni.o');
  run(process.env.CXX || 'c++', ['-std=c++17','-Wall','-Wextra','-Werror','-fPIC','-idirafter',javaInclude,...include,'-c','modules/allnewmts-lua/android/runtime_jni.cpp','-o',hostJni]);
  const hostJniLibrary = path.join(temp, 'liballnewmts_lua.dylib');
  run(process.env.CXX || 'c++', ['-dynamiclib',hostJni,...runtimeObjects,provider,'-lm','-pthread','-o',hostJniLibrary]);
  const kotlinGolden = run(java, ['-Djava.library.path='+temp,'-cp',`${kotlinClasses}${path.delimiter}${kotlinStdlib}`,'RuntimeKotlinModuleGoldenTest',adapterConfig,adapterEvent,expectedGolden]).trim();
  assert.equal(kotlinGolden, expectedGolden);

  const sdk = run('xcrun', ['--sdk','iphonesimulator','--show-sdk-path']).trim();
  const appleCore=path.join(temp,'runtime-apple-core.o'),appleLua=path.join(temp,'runtime-apple-lua.o'),appleCommon=path.join(temp,'runtime-apple-common.o'),appleShim=path.join(temp,'runtime-apple-shim.o'),appleObjc=path.join(temp,'runtime-objc.o');
  run('xcrun', ['--sdk','iphonesimulator','clang++','-std=c++17','-arch','arm64','-mios-simulator-version-min=16.4','-isysroot',sdk,...include,'-c','modules/allnewmts-lua/shared/allnewmts_runtime.cpp','-o',appleCore]);
  run('xcrun', ['--sdk','iphonesimulator','clang','-std=c99','-arch','arm64','-mios-simulator-version-min=16.4','-isysroot',sdk,...include,'-c','modules/allnewmts-lua/shared/allnewmts_runtime_lua.c','-o',appleLua]);
  for(const [source,output] of [['modules/allnewmts-lua/shared/allnewmts_runtime_adapters.c',appleCommon],['modules/allnewmts-lua/ios/allnewmts_runtime_ios_adapter.c',appleShim]])run('xcrun',['--sdk','iphonesimulator','clang','-std=c99','-arch','arm64','-mios-simulator-version-min=16.4','-isysroot',sdk,...include,'-c',source,'-o',output]);
  run('xcrun', ['--sdk','iphonesimulator','clang++','-std=c++17','-fobjc-arc','-arch','arm64','-mios-simulator-version-min=16.4','-isysroot',sdk,...include,'-c','modules/allnewmts-lua/ios/AllNewMTSRuntimeAdapter.mm','-o',appleObjc]);
  run('xcrun',['libtool','-static','-o',path.join(temp,'libAllNewMTSRuntime-focused.a'),appleCore,appleLua,appleCommon,appleShim,appleObjc]);
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

cleanupTemp();
console.log('PASS verify:runtime (focused; no story, UI, network, upstream adoption, or full native aggregator)');
