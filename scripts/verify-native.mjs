import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeRepoFile, validateSchema } from './verify-foundation.mjs';
import { generateNativeAssets } from './generate-native-assets.mjs';
import * as developmentBuildRunner from './run-gate0-development-build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(safeRepoFile('native/lua-source-manifest.json'), 'utf8'));
const schema = JSON.parse(fs.readFileSync(safeRepoFile('native/lua-source-manifest.schema.json'), 'utf8'));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (file) => fs.readFileSync(safeRepoFile(file));
const command = (file, args, options = {}) => {
  const result = spawnSync(file, args, { cwd: root, encoding: 'utf8', ...options });
  assert.equal(result.error, undefined, `${file} could not start: ${result.error?.message}`);
  assert.equal(result.status, 0, `${file} ${args.join(' ')} failed:\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  return result.stdout ?? '';
};

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(item) : [item];
  });
}

function verifyUpstream(temp) {
  validateSchema(schema, manifest, 'Lua source manifest');
  const archive = read(manifest.upstream.archivePath);
  assert.equal(archive.length, manifest.upstream.archiveBytes, 'official archive byte count drift');
  assert.equal(sha256(archive), manifest.upstream.archiveSha256, 'official archive SHA-256 drift');
  const listed = command('tar', ['-tzf', manifest.upstream.archivePath]).trim().split('\n');
  for (const item of listed) {
    assert.ok(item.startsWith('lua-5.1.5/') && !item.split('/').includes('..') && !path.isAbsolute(item), `unsafe archive path: ${item}`);
  }
  command('tar', ['-xzf', manifest.upstream.archivePath, '-C', temp]);

  const vendored = safeRepoFile(`${manifest.vendoredRoot}/COPYRIGHT`);
  const vendoredRoot = path.dirname(vendored);
  const actualInventory = walk(vendoredRoot).map((file) => path.relative(vendoredRoot, file).split(path.sep).join('/')).sort();
  assert.deepEqual(actualInventory, manifest.inventory.map(({ path: file }) => file).sort(), 'vendored inventory drift');
  for (const entry of manifest.inventory) {
    const local = fs.readFileSync(safeRepoFile(`${manifest.vendoredRoot}/${entry.path}`));
    const upstream = fs.readFileSync(path.join(temp, 'lua-5.1.5', entry.path));
    assert.equal(local.length, entry.bytes, `vendored byte drift: ${entry.path}`);
    assert.equal(sha256(local), entry.sha256, `vendored hash drift: ${entry.path}`);
    assert.deepEqual(local, upstream, `upstream zero-diff failure: ${entry.path}`);
  }
  assert.equal(sha256(read(manifest.license.path)), manifest.license.sha256, 'license hash drift');
  const luaconf = manifest.inventory.find(({ path: file }) => file === 'src/luaconf.h');
  assert.ok(luaconf, 'luaconf.h missing from immutable inventory');
  console.log(`PASS native upstream: ${archive.length} archive bytes, ${manifest.inventory.length} zero-diff files, license and luaconf.h immutable`);
}

function verifyContracts() {
  const moduleRoot = path.join(root, 'modules/allnewmts-lua');
  const authoredPaths = [
    safeRepoFile('app.json'),
    safeRepoFile('index.ts'),
    ...walk(moduleRoot).filter((file) => !file.startsWith(path.join(moduleRoot, 'vendor') + path.sep)),
    ...walk(path.join(root, 'native/resources')),
    ...walk(path.join(root, 'native/test'))
  ].map((file) => path.relative(root, file).split(path.sep).join('/')).sort();
  assert.deepEqual(authoredPaths, manifest.authoredInventory.map(({ path: file }) => file).sort(), 'authored native inventory drift');
  for (const entry of manifest.authoredInventory) {
    const bytes = read(entry.path);
    assert.equal(bytes.length, entry.bytes, `authored byte drift: ${entry.path}`);
    assert.equal(sha256(bytes), entry.sha256, `authored hash drift: ${entry.path}`);
  }
  const expectedCompiled = [
    'lapi.c', 'lauxlib.c', 'lbaselib.c', 'lcode.c', 'ldebug.c', 'ldo.c', 'ldump.c', 'lfunc.c',
    'lgc.c', 'llex.c', 'lmathlib.c', 'lmem.c', 'lobject.c', 'lopcodes.c', 'lparser.c', 'lstate.c',
    'lstring.c', 'lstrlib.c', 'ltable.c', 'ltablib.c', 'ltm.c', 'lundump.c', 'lvm.c', 'lzio.c'
  ].map((file) => `src/${file}`);
  assert.deepEqual(manifest.compiledSources, expectedCompiled, 'compiled Lua source list drift');
  assert.deepEqual(manifest.excludedProviderEntrypoints, ['src/lua.c', 'src/luac.c', 'src/print.c']);
  const compiled = new Set(manifest.compiledSources);
  for (const file of [...manifest.excludedProviderEntrypoints, ...manifest.intentionallyUncompiledLibraries]) assert.equal(compiled.has(file), false, `${file} must not compile`);
  assert.deepEqual(manifest.sandboxLibraries, ['base', 'coroutine', 'table', 'string', 'math']);
  assert.deepEqual(manifest.absentGlobals, ['loadfile', 'package', 'io', 'os', 'debug']);

  const projectNative = [
    'modules/allnewmts-lua/shared/allnewmts_lua.c',
    'modules/allnewmts-lua/ios/allnewmts_lua_ios_adapter.c',
    'modules/allnewmts-lua/android/allnewmts_lua_android_adapter.c'
  ].map((file) => read(file).toString('utf8')).join('\n');
  assert.doesNotMatch(projectNative, /luaL_openlibs\s*\(/, 'sandbox must never call luaL_openlibs');
  const cmake = read('modules/allnewmts-lua/android/CMakeLists.txt').toString('utf8');
  const cmakeSources = [...cmake.matchAll(/\$\{LUA_ROOT\}\/(l[^\s)]+\.c)/g)].map((match) => `src/${match[1]}`);
  assert.deepEqual(cmakeSources, manifest.compiledSources, 'Android compiled Lua source list drift');
  const androidGradle = read('modules/allnewmts-lua/android/build.gradle').toString('utf8');
  assert.match(androidGradle, /project\.getProperties\(\)\.get\('reactNativeArchitectures'\)/, 'Android module must read the React Native ABI property');
  assert.match(androidGradle, /value \? value\.split\(','\) : \['armeabi-v7a', 'x86', 'x86_64', 'arm64-v8a'\]/, 'Android module must retain the standard four-ABI fallback');
  assert.match(androidGradle, /abiFilters\(\*reactNativeArchitectures\(\)\)/, 'Android module must apply the shared React Native ABI selection');

  for (const resource of manifest.resources) assert.equal(sha256(read(resource.path)), resource.sha256, `resource hash drift: ${resource.path}`);
  assert.equal(sha256(read(manifest.testOnlyHashMismatch.path)), manifest.testOnlyHashMismatch.actualSha256, 'hostile resource drift');
  assert.notEqual(manifest.testOnlyHashMismatch.actualSha256, manifest.testOnlyHashMismatch.compiledExpectedSha256, 'hostile resource must carry a mismatched expected hash');
  safeRepoFile(manifest.adapterFixture.source);
  safeRepoFile(manifest.adapterFixture.golden);

  const appleFunctions = [...read('modules/allnewmts-lua/ios/AllNewMTSLuaModule.swift').toString().matchAll(/Function\("([^"]+)"/g)].map((match) => match[1]);
  const androidFunctions = [...read('modules/allnewmts-lua/android/src/main/java/com/allnewmts/lua/AllNewMTSLuaModule.kt').toString().matchAll(/Function\("([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(appleFunctions, ['create', 'evaluate', 'destroy']);
  assert.deepEqual(androidFunctions, appleFunctions);
  const appEntry = read('index.ts').toString('utf8');
  assert.doesNotMatch(appEntry, /^import .*gate0-runtime/m, 'ordinary app startup must not load the native harness');
  assert.match(appEntry, /if \(process\.env\.EXPO_PUBLIC_G002_NATIVE_HARNESS === '1'\)[\s\S]+await import\('\.\/modules\/allnewmts-lua\/src\/gate0-runtime'\)/, 'native harness must load only behind its explicit verification flag');
  const generated = generateNativeAssets(manifest);
  for (const [file, expected] of generated) assert.equal(read(file).toString('utf8'), expected, `compiled resource/runtime fixture drift: ${file}`);
  const logicalDrift = structuredClone(manifest);
  logicalDrift.resources[0].logicalPath = 'fixtures/drift.lua';
  assert.notEqual(generateNativeAssets(logicalDrift).get('modules/allnewmts-lua/shared/resource_bundle.c'), generated.get('modules/allnewmts-lua/shared/resource_bundle.c'), 'logical-path drift escaped generated bundle check');
  const byteDrift = structuredClone(manifest);
  const mutatedBytes = Buffer.from('return "mutated"\n');
  byteDrift.resources[0].sha256 = sha256(mutatedBytes);
  const mutatedGenerated = generateNativeAssets(byteDrift, (file) => file === byteDrift.resources[0].path ? mutatedBytes : read(file));
  assert.notEqual(mutatedGenerated.get('modules/allnewmts-lua/shared/resource_bundle.c'), generated.get('modules/allnewmts-lua/shared/resource_bundle.c'), 'resource byte/hash drift escaped generated bundle check');
  console.log('PASS native contracts: exact sources, allowlist, resources, limits, and create/evaluate/destroy-only adapters');
}

function compileHost(temp) {
  const cc = process.env.CC || 'cc';
  const include = ['-I', 'modules/allnewmts-lua/vendor/lua-5.1.5/src', '-I', 'modules/allnewmts-lua/shared'];
  const provider = path.join(temp, 'provider');
  const wrapper = path.join(temp, 'wrapper');
  fs.mkdirSync(provider); fs.mkdirSync(wrapper);
  const providerObjects = manifest.compiledSources.map((source) => {
    const object = path.join(provider, `${path.basename(source, '.c')}.o`);
    command(cc, ['-std=c99', ...include, '-c', `${manifest.vendoredRoot}/${source}`, '-o', object]);
    return object;
  });
  const library = path.join(temp, 'liballnewmts_lua51.a');
  command('ar', ['rcs', library, ...providerObjects]);
  const authoredSources = [
    'modules/allnewmts-lua/shared/allnewmts_lua.c',
    'modules/allnewmts-lua/shared/resource_bundle.c',
    'modules/allnewmts-lua/shared/sha256.c',
    'modules/allnewmts-lua/ios/allnewmts_lua_ios_adapter.c',
    'modules/allnewmts-lua/android/allnewmts_lua_android_adapter.c',
    'native/test/native_harness_test.c'
  ];
  const authoredObjects = authoredSources.map((source, index) => {
    const object = path.join(wrapper, `${index}.o`);
    command(cc, ['-std=c99', '-Wall', '-Wextra', '-Werror', '-DALLNEWMTS_LUA_TESTING', ...include, '-c', source, '-o', object]);
    return object;
  });
  const executable = path.join(temp, 'native-harness-test');
  command(cc, [...authoredObjects, library, '-lm', '-o', executable]);
  const output = command(executable, [manifest.adapterFixture.source, manifest.adapterFixture.golden]);
  assert.match(output, /PASS native harness/);

  const providerSymbols = command('nm', ['-g', library]).split('\n').filter((line) => / [Tt] _?(?:lua_|luaL_|luaopen_)/.test(line));
  assert.ok(providerSymbols.length > 50, 'official provider exported too few Lua symbols');
  for (const object of authoredObjects) {
    const symbols = command('nm', ['-g', object]).split('\n');
    assert.equal(symbols.some((line) => / [Tt] _?(?:lua_|luaL_|luaopen_)/.test(line)), false, `second Lua provider in ${object}`);
  }
  console.log(`PASS native host: ${providerSymbols.length} Lua symbols resolve from sole allnewmts_lua51 archive; guarded adapter fixture passed`);
}

function expandBraces(pattern) {
  const match = pattern.match(/\{([^{}]+)\}/);
  return match ? match[1].split(',').flatMap((value) => expandBraces(`${pattern.slice(0, match.index)}${value}${pattern.slice(match.index + match[0].length)}`)) : [pattern];
}

function expandPodSources(patterns) {
  const podDirectory = path.join(root, 'modules/allnewmts-lua');
  return [...new Set(patterns.flatMap(expandBraces).flatMap((pattern) => {
    assert.doesNotMatch(pattern, /\*\*|\?|\[/, `unsupported Pod source glob: ${pattern}`);
    const absolute = path.resolve(podDirectory, pattern);
    assert.ok(absolute.startsWith(`${root}${path.sep}`), `Pod source escapes repository: ${pattern}`);
    if (!pattern.includes('*')) return [absolute];
    const directory = path.dirname(absolute);
    const expression = new RegExp(`^${path.basename(absolute).replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')}$`);
    return fs.readdirSync(directory).filter((name) => expression.test(name)).map((name) => path.join(directory, name));
  }).map((file) => {
    const stat = fs.lstatSync(file);
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), `Pod source is not a regular file: ${file}`);
    return path.relative(root, file).split(path.sep).join('/');
  }))].sort();
}

function expectedPodSources() {
  const authored = manifest.authoredInventory.map(({ path: file }) => file).filter((file) =>
    file.startsWith('modules/allnewmts-lua/shared/') ||
    (file.startsWith('modules/allnewmts-lua/ios/') && /\.(?:c|h|mm|swift)$/.test(file))
  );
  const headers = manifest.inventory.filter(({ path: file }) => file.startsWith('src/') && file.endsWith('.h')).map(({ path: file }) => `${manifest.vendoredRoot}/${file}`);
  return [...authored, ...headers, ...manifest.compiledSources.map((file) => `${manifest.vendoredRoot}/${file}`)].sort();
}

function validatePodGraph(sources, dependencies) {
  assert.deepEqual(sources, expectedPodSources(), 'evaluated Pod source graph drift');
  assert.deepEqual(dependencies, { ExpoModulesCore: [] }, 'evaluated Pod dependencies must contain only ExpoModulesCore');
}

function evaluatedPodGraph() {
  const spec = JSON.parse(command('pod', ['ipc', 'spec', 'modules/allnewmts-lua/AllNewMTSLua.podspec']));
  const sources = expandPodSources(Array.isArray(spec.source_files) ? spec.source_files : [spec.source_files]);
  validatePodGraph(sources, spec.dependencies ?? {});
  const badSources = [...sources, `${manifest.vendoredRoot}/src/lua.c`].sort();
  assert.throws(() => validatePodGraph(badSources, spec.dependencies ?? {}), 'excluded Lua source mutation must fail');
  assert.throws(() => validatePodGraph(sources, { ...spec.dependencies, LuaKit: [] }), 'second Lua dependency mutation must fail');
  return { sources, dependencies: spec.dependencies };
}

function compileApple(temp) {
  const graph = evaluatedPodGraph();
  const sdk = command('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path']).trim();
  const output = path.join(temp, 'apple');
  fs.mkdirSync(output);
  const include = ['-I', 'modules/allnewmts-lua/vendor/lua-5.1.5/src', '-I', 'modules/allnewmts-lua/shared'];
  const sources = graph.sources.filter((file) => /\.(?:c|mm)$/.test(file));
  const objects = sources.map((source, index) => {
    const object = path.join(output, `${index}.o`);
    const compiler = source.endsWith('.mm') ? 'clang++' : 'clang';
    const language = source.endsWith('.mm') ? ['-fobjc-arc'] : ['-std=c99'];
    command('xcrun', ['--sdk', 'iphonesimulator', compiler, ...language, '-arch', 'arm64', '-mios-simulator-version-min=16.4', '-isysroot', sdk, ...include, '-c', source, '-o', object]);
    return object;
  });
  const library = path.join(output, 'libAllNewMTSLua.a');
  command('xcrun', ['libtool', '-static', '-o', library, ...objects]);
  const symbols = command('nm', ['-g', library]);
  for (const name of ['create', 'evaluate', 'destroy']) assert.equal(symbols.split('\n').filter((line) => new RegExp(` [Tt] _allnewmts_lua_ios_${name}$`).test(line)).length, 1, `evaluated Pod graph omits iOS ${name} provider`);
  assert.equal(symbols.split('\n').filter((line) => / [Tt] _lua_newstate$/.test(line)).length, 1, 'evaluated Pod graph has multiple Lua providers');
  fs.writeFileSync(path.join(output, 'pod-source-inventory.json'), JSON.stringify(graph, null, 2));
  console.log(`PASS native Apple Pod graph: ${graph.sources.length} exact sources, ExpoModulesCore-only dependency, linked adapter and sole Lua provider`);
}

function compileAndroid(temp) {
  const sdk = process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk');
  const ndk = path.join(sdk, 'ndk/27.1.12297006');
  const cmake = path.join(sdk, 'cmake/3.22.1/bin/cmake');
  const ninja = path.join(sdk, 'cmake/3.22.1/bin/ninja');
  const output = path.join(temp, 'android');
  assert.ok(fs.existsSync(cmake) && fs.existsSync(ninja) && fs.existsSync(ndk), 'declared Android SDK/NDK toolchain is unavailable');
  command(cmake, ['-S', 'modules/allnewmts-lua/android', '-B', output, '-G', 'Ninja',
    `-DCMAKE_MAKE_PROGRAM=${ninja}`, `-DCMAKE_TOOLCHAIN_FILE=${ndk}/build/cmake/android.toolchain.cmake`,
    '-DANDROID_ABI=arm64-v8a', '-DANDROID_PLATFORM=android-24', '-DCMAKE_BUILD_TYPE=Release']);
  command(cmake, ['--build', output]);
  const library = path.join(output, 'liballnewmts_lua.so');
  assert.ok(fs.existsSync(library), 'Android shared library missing');
  const tools = path.join(ndk, 'toolchains/llvm/prebuilt/darwin-x86_64/bin');
  const dynamic = command(path.join(tools, 'llvm-readelf'), ['-d', library]);
  assert.doesNotMatch(dynamic, /NEEDED.*(?:lua|luajit)/i, 'Android linked a second Lua provider');
  const symbols = command(path.join(tools, 'llvm-nm'), ['-D', '--defined-only', library]);
  assert.match(symbols, /Java_com_allnewmts_lua_AllNewMTSLuaModule_nativeCreate/);
  assert.match(symbols, /\blua_newstate\b/);
  console.log('PASS native Android compile: arm64-v8a JNI shared library, package symbols, and no second Lua dependency');
}

function verifyAutolinking() {
  const cli = 'node_modules/expo-modules-autolinking/bin/expo-modules-autolinking';
  for (const platform of ['ios', 'android']) {
    const found = JSON.parse(command(process.execPath, [cli, 'search', '--platform', platform, '--json']));
    assert.ok(found['allnewmts-lua'], `${platform} autolinking did not find allnewmts-lua`);
    assert.deepEqual(found['allnewmts-lua'].duplicates, []);
  }
  console.log('PASS native autolinking: Expo 57 found one local module for iOS and Android');
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'allnewmts-g002-'));
try {
  const forgedRuntime = { status: 'PASS', cycles: 3, golden: read(manifest.adapterFixture.golden).toString('utf8').trim() };
  const forgedPass = {
    status: 'PASS',
    ios: { runtime: forgedRuntime, package: { luaProviderCount: 1 } },
    android: { runtime: forgedRuntime, package: { luaProviderCount: 1 } }
  };
  assert.deepEqual(Object.keys(developmentBuildRunner), ['runGate0DevelopmentBuild'], 'Development Build runner must expose only real execution');
  assert.throws(() => developmentBuildRunner.validateDevelopmentBuildResult(forgedPass), 'complete synthetic PASS evidence must not have a public approval path');
  verifyUpstream(temp);
  verifyContracts();
  compileHost(temp);
  compileApple(temp);
  compileAndroid(temp);
  verifyAutolinking();
  const runtime = await developmentBuildRunner.runGate0DevelopmentBuild(temp);
  if (runtime.status === 'BLOCKED') {
    console.error(JSON.stringify(runtime));
    process.exitCode = 2;
  } else {
    console.log(JSON.stringify({ status: 'PASS', tier: 'native', runtime }));
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
