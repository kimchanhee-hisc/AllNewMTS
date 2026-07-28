import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeRepoFile, validateSchema } from './verify-foundation.mjs';
import { generateNativeAssets } from './generate-native-assets.mjs';
import * as developmentBuildRunner from './run-native-harness-development-build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(safeRepoFile('native/lua-source-manifest.json'), 'utf8'));
const schema = JSON.parse(fs.readFileSync(safeRepoFile('native/lua-source-manifest.schema.json'), 'utf8'));
const productConfig = JSON.parse(fs.readFileSync(safeRepoFile('config/product-config.json'), 'utf8'));
const productConfigSchema = JSON.parse(fs.readFileSync(safeRepoFile('config/product-config.schema.json'), 'utf8'));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (file) => fs.readFileSync(safeRepoFile(file));
const command = (file, args, options = {}) => {
  const result = spawnSync(file, args, { cwd: root, encoding: 'utf8', ...options });
  assert.equal(result.error, undefined, `${file} could not start: ${result.error?.message}`);
  assert.equal(result.status, 0, `${file} ${args.join(' ')} failed:\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  return result.stdout ?? '';
};
const harnessEnvironment = (enabled) => {
  const env = { ...process.env };
  if (enabled) env.EXPO_PUBLIC_NATIVE_HARNESS = '1';
  else delete env.EXPO_PUBLIC_NATIVE_HARNESS;
  return env;
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
  validateSchema(productConfigSchema, productConfig, 'product config');
  const runtimeRoot = path.join(root, 'modules/allnewmts-runtime');
  const networkingRoot = path.join(root, 'modules/allnewmts-networking');
  const authoredPaths = [
    safeRepoFile('apps/labs/xmf-runtime/app.json'),
    safeRepoFile('apps/labs/xmf-runtime/index.ts'),
    ...walk(runtimeRoot).filter((file) =>
      !file.startsWith(path.join(runtimeRoot, 'vendor') + path.sep) &&
      !file.startsWith(path.join(runtimeRoot, 'android/.cxx') + path.sep) &&
      !file.startsWith(path.join(runtimeRoot, 'android/build') + path.sep)
    ),
    ...walk(networkingRoot).filter((file) =>
      !file.startsWith(path.join(networkingRoot, 'android/.cxx') + path.sep) &&
      !file.startsWith(path.join(networkingRoot, 'android/build') + path.sep)
    ),
    ...walk(path.join(root, 'native/common')),
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
    'modules/allnewmts-runtime/shared/allnewmts_lua.c',
    'modules/allnewmts-runtime/ios/allnewmts_lua_ios_adapter.c',
    'modules/allnewmts-runtime/android/allnewmts_lua_android_adapter.c'
  ].map((file) => read(file).toString('utf8')).join('\n');
  assert.doesNotMatch(projectNative, /luaL_openlibs\s*\(/, 'sandbox must never call luaL_openlibs');
  const cmake = read('modules/allnewmts-runtime/android/CMakeLists.txt').toString('utf8');
  const cmakeSources = [...cmake.matchAll(/\$\{LUA_ROOT\}\/(l[^\s)]+\.c)/g)].map((match) => `src/${match[1]}`);
  assert.deepEqual(cmakeSources, manifest.compiledSources, 'Android compiled Lua source list drift');
  const androidGradle = read('modules/allnewmts-runtime/android/build.gradle').toString('utf8');
  assert.match(androidGradle, /project\.getProperties\(\)\.get\('reactNativeArchitectures'\)/, 'Android module must read the React Native ABI property');
  assert.match(androidGradle, /value \? value\.split\(','\) : \['armeabi-v7a', 'x86', 'x86_64', 'arm64-v8a'\]/, 'Android module must retain the standard four-ABI fallback');
  assert.match(androidGradle, /abiFilters\(\*reactNativeArchitectures\(\)\)/, 'Android module must apply the shared React Native ABI selection');
  assert.match(androidGradle, /def verificationHarnessEnabled = System\.getenv\('EXPO_PUBLIC_NATIVE_HARNESS'\) == '1'/, 'Gradle verification source set must use the explicit NATIVE_HARNESS flag');
  assert.match(androidGradle, /java\.srcDirs = \['src\/main\/java'\][\s\S]+if \(verificationHarnessEnabled\) java\.srcDir 'src\/verification\/java'/, 'Gradle default source set must exclude the verification harness and add it only under the explicit flag');
  assert.equal((androidGradle.match(/src\/verification\/java/g) ?? []).length, 1, 'Gradle must expose exactly one flag-gated verification source-set path');
  const networkingCmake = read('modules/allnewmts-networking/android/CMakeLists.txt').toString('utf8');
  assert.match(networkingCmake, /add_library\(allnewmts_networking SHARED/);
  assert.doesNotMatch(networkingCmake, /allnewmts_(?:runtime|lua)|LUA_ROOT/);
  const runtimeCmake = read('modules/allnewmts-runtime/android/CMakeLists.txt').toString('utf8');
  assert.doesNotMatch(runtimeCmake, /allnewmts_(?:mci|rest_auth|product_(?:config|mci))|PRODUCT_MCI/);

  for (const resource of manifest.resources) assert.equal(sha256(read(resource.path)), resource.sha256, `resource hash drift: ${resource.path}`);
  assert.equal(sha256(read(manifest.testOnlyHashMismatch.path)), manifest.testOnlyHashMismatch.actualSha256, 'hostile resource drift');
  assert.notEqual(manifest.testOnlyHashMismatch.actualSha256, manifest.testOnlyHashMismatch.compiledExpectedSha256, 'hostile resource must carry a mismatched expected hash');
  safeRepoFile(manifest.adapterFixture.source);
  safeRepoFile(manifest.adapterFixture.golden);

  const appleFunctions = [...read('modules/allnewmts-runtime/ios/AllNewMTSLuaModule.swift').toString().matchAll(/Function\("([^"]+)"/g)].map((match) => match[1]);
  const androidModule = read('modules/allnewmts-runtime/android/src/verification/java/com/allnewmts/lua/AllNewMTSLuaModule.kt').toString('utf8');
  const androidFunctions = [...androidModule.matchAll(/Function\("([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(appleFunctions, ['create', 'evaluate', 'destroy']);
  assert.deepEqual(androidFunctions, appleFunctions);
  const networkingApple = read('modules/allnewmts-networking/ios/AllNewMTSNetworkingModule.swift').toString('utf8');
  const networkingAndroid = read('modules/allnewmts-networking/android/src/main/java/com/allnewmts/networking/AllNewMTSNetworkingModule.kt').toString('utf8');
  const networkingAppleFunctions = [...networkingApple.matchAll(/AsyncFunction\("([^"]+)"/g)].map((match) => match[1]);
  const networkingAndroidFunctions = [...networkingAndroid.matchAll(/AsyncFunction\("([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(networkingAppleFunctions, [
    'probeLoopback',
    'connectMciBeta',
    'fetchSamsungElectronicsQuote',
    'disconnectMci',
  ]);
  assert.deepEqual(networkingAndroidFunctions, networkingAppleFunctions);
  assert.doesNotMatch(androidModule, /\b(?:val|var)\s+runtime\b/, 'Android module state must not hide Expo Module.runtime');
  const appEntry = read('apps/labs/xmf-runtime/index.ts').toString('utf8');
  assert.doesNotMatch(appEntry, /^import .*verification-harness-runtime/m, 'ordinary app startup must not load the native harness');
  assert.match(appEntry, /if \(process\.env\.EXPO_PUBLIC_NATIVE_HARNESS === '1'\)[\s\S]+await import\('allnewmts-runtime\/src\/verification-harness-runtime'\)/, 'native harness must load only behind its explicit verification flag');
  const generated = generateNativeAssets(manifest);
  for (const [file, expected] of generated) assert.equal(read(file).toString('utf8'), expected, `compiled resource/runtime fixture drift: ${file}`);
  const logicalDrift = structuredClone(manifest);
  logicalDrift.resources[0].logicalPath = 'fixtures/drift.lua';
  assert.notEqual(generateNativeAssets(logicalDrift).get('modules/allnewmts-runtime/shared/resource_bundle.c'), generated.get('modules/allnewmts-runtime/shared/resource_bundle.c'), 'logical-path drift escaped generated bundle check');
  const byteDrift = structuredClone(manifest);
  const mutatedBytes = Buffer.from('return "mutated"\n');
  byteDrift.resources[0].sha256 = sha256(mutatedBytes);
  const mutatedGenerated = generateNativeAssets(byteDrift, (file) => file === byteDrift.resources[0].path ? mutatedBytes : read(file));
  assert.notEqual(mutatedGenerated.get('modules/allnewmts-runtime/shared/resource_bundle.c'), generated.get('modules/allnewmts-runtime/shared/resource_bundle.c'), 'resource byte/hash drift escaped generated bundle check');
  console.log('PASS native contracts: exact sources, allowlist, resources, limits, and create/evaluate/destroy-only adapters');
}

function compileHost(temp) {
  const cc = process.env.CC || 'cc';
  const include = ['-I', 'modules/allnewmts-runtime/vendor/lua-5.1.5/src', '-I', 'modules/allnewmts-runtime/shared', '-I', 'native/common'];
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
    'modules/allnewmts-runtime/shared/allnewmts_lua.c',
    'modules/allnewmts-runtime/shared/resource_bundle.c',
    'native/common/sha256.c',
    'modules/allnewmts-runtime/ios/allnewmts_lua_ios_adapter.c',
    'modules/allnewmts-runtime/android/allnewmts_lua_android_adapter.c',
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

function expandPodSources(patterns, podDirectory) {
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

function expectedRuntimePodSources(includeVerification) {
  const authored = manifest.authoredInventory.map(({ path: file }) => file);
  const production = authored.filter((file) =>
    /^modules\/allnewmts-runtime\/shared\/(?:allnewmts_runtime.*|resource_bundle\.[ch])$/.test(file) ||
    /^modules\/allnewmts-runtime\/ios\/(?:AllNewMTSRuntime.*\.(?:h|mm|swift)|allnewmts_runtime_ios_adapter\.c)$/.test(file)
  );
  const verification = authored.filter((file) =>
    /^modules\/allnewmts-runtime\/shared\/(?:allnewmts_lua\.[ch]|allnewmts_lua_adapters\.h)$/.test(file) ||
    /^modules\/allnewmts-runtime\/ios\/(?:AllNewMTSLua.*\.(?:h|mm|swift)|allnewmts_lua_ios_adapter\.c)$/.test(file)
  );
  const headers = manifest.inventory.filter(({ path: file }) => file.startsWith('src/') && file.endsWith('.h')).map(({ path: file }) => `${manifest.vendoredRoot}/${file}`);
  return [...production, ...(includeVerification ? verification : []), ...headers, ...manifest.compiledSources.map((file) => `${manifest.vendoredRoot}/${file}`)].sort();
}

function validateRuntimePodGraph(sources, dependencies, includeVerification) {
  assert.deepEqual(sources, expectedRuntimePodSources(includeVerification), `evaluated ${includeVerification ? 'NATIVE_HARNESS verification' : 'default production'} Runtime Pod source graph drift`);
  assert.deepEqual(dependencies, { ExpoModulesCore: [] }, 'evaluated Pod dependencies must contain only ExpoModulesCore');
}

function evaluatedRuntimePodGraph(includeVerification) {
  const spec = JSON.parse(command('pod', ['ipc', 'spec', 'modules/allnewmts-runtime/AllNewMTSRuntime.podspec'], { env: harnessEnvironment(includeVerification) }));
  assert.equal(spec.pod_target_xcconfig.GCC_PREPROCESSOR_DEFINITIONS,
    '$(inherited) ALLNEWMTS_SHA256_NAME=allnewmts_runtime_sha256',
  'evaluated Runtime Pod graph has the wrong common-symbol namespace');
  const sources = expandPodSources(Array.isArray(spec.source_files) ? spec.source_files : [spec.source_files], path.join(root, 'modules/allnewmts-runtime'));
  validateRuntimePodGraph(sources, spec.dependencies ?? {}, includeVerification);
  const badSources = [...sources, `${manifest.vendoredRoot}/src/lua.c`].sort();
  assert.throws(() => validateRuntimePodGraph(badSources, spec.dependencies ?? {}, includeVerification), 'excluded Lua source mutation must fail');
  assert.throws(() => validateRuntimePodGraph(sources, { ...spec.dependencies, LuaKit: [] }, includeVerification), 'second Lua dependency mutation must fail');
  return { sources, dependencies: spec.dependencies };
}

function evaluatedNetworkingPodGraph() {
  const spec = JSON.parse(command('pod', ['ipc', 'spec', 'modules/allnewmts-networking/AllNewMTSNetworking.podspec']));
  assert.equal(spec.pod_target_xcconfig.GCC_PREPROCESSOR_DEFINITIONS,
    `$(inherited) ALLNEWMTS_SHA256_NAME=allnewmts_networking_sha256 ALLNEWMTS_PRODUCT_MCI_CHANNEL_DETAIL=\\\"${productConfig.platforms.ios.mciChannelDetail}\\\"`,
  'evaluated Networking Pod graph has the wrong iOS product config');
  const sources = expandPodSources(Array.isArray(spec.source_files) ? spec.source_files : [spec.source_files], path.join(root, 'modules/allnewmts-networking'));
  const expected = manifest.authoredInventory.map(({ path: file }) => file).filter((file) =>
    /^modules\/allnewmts-networking\/shared\/allnewmts_(?:mci.*|networking_sha256|product_(?:config|mci)|rest_auth)\.(?:c|cpp|h)$/.test(file) ||
    file === 'modules/allnewmts-networking/ios/AllNewMTSNetworkingModule.swift'
  ).sort();
  assert.deepEqual(sources, expected, 'evaluated Networking Pod source graph drift');
  assert.deepEqual(spec.dependencies ?? {}, { ExpoModulesCore: [] }, 'Networking Pod must depend only on ExpoModulesCore');
  return { sources, dependencies: spec.dependencies ?? {} };
}

function compileApple(temp) {
  const productionGraph = evaluatedRuntimePodGraph(false);
  const graph = evaluatedRuntimePodGraph(true);
  const networkingGraph = evaluatedNetworkingPodGraph();
  assert.deepEqual(graph.sources.filter((file) => networkingGraph.sources.includes(file)), [],
    'Apple native Pod graphs share a compiled source path');
  for (const wrapper of [
    'modules/allnewmts-runtime/shared/allnewmts_runtime_sha256.c',
    'modules/allnewmts-networking/shared/allnewmts_networking_sha256.c'
  ]) {
    assert.equal(read(wrapper).toString('utf8'), '#include "../../../native/common/sha256.c"\n',
      `${wrapper} must remain a one-line compiler wrapper over the common source`);
  }
  const verificationOnly = expectedRuntimePodSources(true).filter((file) => !expectedRuntimePodSources(false).includes(file));
  for (const file of verificationOnly) {
    assert.equal(productionGraph.sources.includes(file), false, `default Pod graph leaked NATIVE_HARNESS source: ${file}`);
    assert.equal(graph.sources.includes(file), true, `verification Pod graph omitted NATIVE_HARNESS source: ${file}`);
  }
  const sdk = command('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path']).trim();
  const output = path.join(temp, 'apple');
  fs.mkdirSync(output);
  const include = ['-I', 'modules/allnewmts-runtime/vendor/lua-5.1.5/src', '-I', 'modules/allnewmts-runtime/shared', '-I', 'native/common'];
  const sources = graph.sources.filter((file) => /\.(?:c|cpp|mm)$/.test(file));
  const networkingDefinition =
    `-DALLNEWMTS_PRODUCT_MCI_CHANNEL_DETAIL="${productConfig.platforms.ios.mciChannelDetail}"`;
  const runtimeShaDefinition = '-DALLNEWMTS_SHA256_NAME=allnewmts_runtime_sha256';
  const networkingShaDefinition = '-DALLNEWMTS_SHA256_NAME=allnewmts_networking_sha256';
  const objects = sources.map((source, index) => {
    const object = path.join(output, `${index}.o`);
    const compiler = source.endsWith('.c') ? 'clang' : 'clang++';
    const language = source.endsWith('.mm') ? ['-std=c++17', '-fobjc-arc'] : (source.endsWith('.cpp') ? ['-std=c++17'] : ['-std=c99']);
    command('xcrun', ['--sdk', 'iphonesimulator', compiler, ...language,
      runtimeShaDefinition, '-arch', 'arm64', '-mios-simulator-version-min=16.4',
      '-isysroot', sdk, ...include, '-c', source, '-o', object]);
    return object;
  });
  const library = path.join(output, 'libAllNewMTSLua.a');
  command('xcrun', ['libtool', '-static', '-o', library, ...objects]);
  const symbols = command('nm', ['-g', library]);
  for (const name of ['create', 'evaluate', 'destroy']) assert.equal(symbols.split('\n').filter((line) => new RegExp(` [Tt] _allnewmts_lua_ios_${name}$`).test(line)).length, 1, `evaluated Pod graph omits iOS ${name} provider`);
  assert.equal(symbols.split('\n').filter((line) => / [Tt] _lua_newstate$/.test(line)).length, 1, 'evaluated Pod graph has multiple Lua providers');
  assert.match(symbols, /_allnewmts_runtime_sha256$/m);
  assert.doesNotMatch(symbols, /_allnewmts_networking_sha256$/m);
  assert.doesNotMatch(symbols, /_allnewmts_(?:mci|rest|product)_/, 'Runtime Pod graph leaked networking symbols');
  const networkingObjects = networkingGraph.sources.filter((file) => /\.(?:c|cpp)$/.test(file)).map((source, index) => {
    const object = path.join(output, `network-${index}.o`);
    command('xcrun', ['--sdk', 'iphonesimulator', source.endsWith('.c') ? 'clang' : 'clang++',
      source.endsWith('.c') ? '-std=c99' : '-std=c++17', networkingDefinition, networkingShaDefinition,
      '-arch', 'arm64', '-mios-simulator-version-min=16.4', '-isysroot', sdk,
      '-I', 'modules/allnewmts-networking/shared', '-I', 'native/common', '-c', source, '-o', object]);
    return object;
  });
  const networkingLibrary = path.join(output, 'libAllNewMTSNetworking.a');
  command('xcrun', ['libtool', '-static', '-o', networkingLibrary, ...networkingObjects]);
  const networkingSymbols = command('nm', ['-g', networkingLibrary]);
  assert.match(networkingSymbols, /_allnewmts_mci_/);
  assert.match(networkingSymbols, /_allnewmts_networking_sha256$/m);
  assert.doesNotMatch(networkingSymbols, /_allnewmts_runtime_sha256$/m);
  assert.doesNotMatch(networkingSymbols, /_allnewmts_(?:runtime|lua)_|\b_lua_newstate\b/, 'Networking Pod graph leaked runtime/Lua symbols');
  fs.writeFileSync(path.join(output, 'pod-source-inventory.json'), JSON.stringify({
    runtime: { production: productionGraph, verification: graph },
    networking: networkingGraph
  }, null, 2));
  console.log(`PASS native Apple Pod graphs: only common SHA-256 source is shared and exports are target-namespaced; ${graph.sources.length} flagged Runtime sources retain the sole Lua provider`);
}

function compileAndroid(temp) {
  const sdk = process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk');
  const ndk = path.join(sdk, 'ndk/27.1.12297006');
  const cmake = path.join(sdk, 'cmake/3.22.1/bin/cmake');
  const ninja = path.join(sdk, 'cmake/3.22.1/bin/ninja');
  const productionOutput = path.join(temp, 'android-production');
  const output = path.join(temp, 'android-verification');
  const networkingOutput = path.join(temp, 'android-networking');
  assert.ok(fs.existsSync(cmake) && fs.existsSync(ninja) && fs.existsSync(ndk), 'declared Android SDK/NDK toolchain is unavailable');
  const configure = (directory, includeVerification) => {
    const env = harnessEnvironment(includeVerification);
    command(cmake, ['-S', 'modules/allnewmts-runtime/android', '-B', directory, '-G', 'Ninja',
      `-DCMAKE_MAKE_PROGRAM=${ninja}`, `-DCMAKE_TOOLCHAIN_FILE=${ndk}/build/cmake/android.toolchain.cmake`,
      '-DANDROID_ABI=arm64-v8a', '-DANDROID_PLATFORM=android-24', '-DCMAKE_BUILD_TYPE=Release', '-DCMAKE_EXPORT_COMPILE_COMMANDS=ON'], { env });
    command(cmake, ['--build', directory], { env });
    return JSON.parse(fs.readFileSync(path.join(directory, 'compile_commands.json'), 'utf8'));
  };
  const productionCommands = configure(productionOutput, false);
  const compileCommands = configure(output, true);
  command(cmake, ['-S', 'modules/allnewmts-networking/android', '-B', networkingOutput, '-G', 'Ninja',
    `-DCMAKE_MAKE_PROGRAM=${ninja}`, `-DCMAKE_TOOLCHAIN_FILE=${ndk}/build/cmake/android.toolchain.cmake`,
    '-DANDROID_ABI=arm64-v8a', '-DANDROID_PLATFORM=android-24', '-DCMAKE_BUILD_TYPE=Release',
    '-DCMAKE_EXPORT_COMPILE_COMMANDS=ON']);
  command(cmake, ['--build', networkingOutput]);
  const networkingCommands = JSON.parse(fs.readFileSync(path.join(networkingOutput, 'compile_commands.json'), 'utf8'));
  const normalizedSource = ({ file }) => file.replaceAll('\\', '/');
  for (const suffix of ['/shared/allnewmts_lua.c', '/android/allnewmts_lua_android_adapter.c', '/android/jni.cpp']) {
    assert.equal(productionCommands.some((entry) => normalizedSource(entry).endsWith(suffix)), false, `default CMake graph leaked NATIVE_HARNESS source: ${suffix}`);
    assert.equal(compileCommands.some((entry) => normalizedSource(entry).endsWith(suffix)), true, `flagged CMake graph omitted NATIVE_HARNESS source: ${suffix}`);
  }
  const commandText = (entry) => entry.command ?? entry.arguments.join(' ');
  assert.equal(compileCommands.some(({ file }) => normalizedSource({ file }).includes('/modules/allnewmts-networking/')), false,
    'Runtime CMake graph leaked networking sources');
  assert.equal(networkingCommands.some(({ file }) =>
    /\/modules\/allnewmts-runtime\/(?:shared|vendor|android)\//.test(normalizedSource({ file }))), false,
  'Networking CMake graph leaked runtime or Lua sources');
  const productCommands = networkingCommands.filter(({ file }) =>
    file.replaceAll('\\', '/').endsWith('/shared/allnewmts_product_config.cpp'));
  assert.equal(productCommands.length, 1,
    'Android compile database must contain one product config source');
  assert.match(commandText(productCommands[0]),
    new RegExp(`ALLNEWMTS_PRODUCT_MCI_CHANNEL_DETAIL=.*${productConfig.platforms.android.mciChannelDetail}`),
  'Android compile database has the wrong product config');
  const luaCommands = compileCommands.filter(({ file }) => file.replaceAll('\\', '/').includes('/vendor/lua-5.1.5/src/'));
  assert.ok(luaCommands.length, 'Android compile database omits vendored Lua sources');
  for (const entry of luaCommands) {
    const fortifyFlags = commandText(entry).match(/(?:^|\s)-(?:D_FORTIFY_SOURCE(?:=\S+)?|U_FORTIFY_SOURCE)(?=\s|$)/g)?.map((flag) => flag.trim()) ?? [];
    assert.equal(fortifyFlags.at(-1), '-U_FORTIFY_SOURCE', `vendored Lua compile does not end with active FORTIFY undef: ${entry.file}`);
  }
  const sharedCommands = compileCommands.filter(({ file }) => file.replaceAll('\\', '/').endsWith('/shared/allnewmts_lua.c'));
  assert.equal(sharedCommands.length, 1, 'Android compile database must contain one shared host command');
  assert.doesNotMatch(commandText(sharedCommands[0]), /(?:^|\s)-U_FORTIFY_SOURCE(?=\s|$)/, 'Android shared host must retain normal FORTIFY settings');
  const sharedFortifyFlags = commandText(sharedCommands[0]).match(/(?:^|\s)-(?:D_FORTIFY_SOURCE(?:=\S+)?|U_FORTIFY_SOURCE)(?=\s|$)/g)?.map((flag) => flag.trim()) ?? [];
  assert.equal(sharedFortifyFlags.at(-1), '-D_FORTIFY_SOURCE=2', 'Android shared host must retain active Bionic FORTIFY');
  const library = path.join(output, 'liballnewmts_lua.so');
  assert.ok(fs.existsSync(library), 'Android shared library missing');
  const tools = path.join(ndk, 'toolchains/llvm/prebuilt/darwin-x86_64/bin');
  const productionSymbols = command(path.join(tools, 'llvm-nm'), ['-D', '--defined-only', path.join(productionOutput, 'liballnewmts_lua.so')]);
  assert.doesNotMatch(productionSymbols, /Java_com_allnewmts_lua_AllNewMTSLuaModule_nativeCreate/, 'default Android library exported the NATIVE_HARNESS JNI module');
  const dynamic = command(path.join(tools, 'llvm-readelf'), ['-d', library]);
  assert.doesNotMatch(dynamic, /NEEDED.*(?:lua|luajit)/i, 'Android linked a second Lua provider');
  const symbols = command(path.join(tools, 'llvm-nm'), ['-D', '--defined-only', library]);
  assert.match(symbols, /Java_com_allnewmts_lua_AllNewMTSLuaModule_nativeCreate/);
  assert.match(symbols, /\blua_newstate\b/);
  assert.match(symbols, /\ballnewmts_runtime_sha256\b/);
  assert.doesNotMatch(symbols, /\ballnewmts_networking_sha256\b/);
  assert.doesNotMatch(symbols, /\ballnewmts_(?:mci|rest|product)_/, 'Runtime Android graph leaked networking symbols');
  const networkingLibrary = path.join(networkingOutput, 'liballnewmts_networking.so');
  assert.ok(fs.existsSync(networkingLibrary), 'Android networking library missing');
  const networkingSymbols = command(path.join(tools, 'llvm-nm'), ['-D', '--defined-only', networkingLibrary]);
  assert.match(networkingSymbols, /\ballnewmts_mci_/);
  assert.match(networkingSymbols, /\ballnewmts_networking_sha256\b/);
  assert.doesNotMatch(networkingSymbols, /\ballnewmts_runtime_sha256\b/);
  assert.doesNotMatch(networkingSymbols, /\ballnewmts_(?:runtime|lua)_|\blua_newstate\b/,
    'Networking Android graph leaked runtime or Lua symbols');
  console.log('PASS native Android graphs: module sources are isolated and common SHA-256 exports are target-namespaced; NATIVE_HARNESS remains flag-gated');
}

function verifyAutolinking() {
  const cli = 'node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js';
  for (const platform of ['ios', 'android']) {
    const found = JSON.parse(command(process.execPath, [cli, 'search', '--platform', platform, '--json']));
    assert.ok(found['allnewmts-runtime'], `${platform} autolinking did not find allnewmts-runtime`);
    assert.ok(found['allnewmts-networking'], `${platform} autolinking did not find allnewmts-networking`);
    assert.deepEqual(found['allnewmts-runtime'].duplicates, []);
    assert.deepEqual(found['allnewmts-networking'].duplicates, []);
  }
  console.log('PASS native autolinking: Expo 57 found the independent Runtime and Networking modules for iOS and Android');
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'allnewmts-harness-'));
try {
  const developmentBuildSource = read('scripts/run-native-harness-development-build.mjs').toString('utf8');
  assert.match(developmentBuildSource, /EXPO_PUBLIC_NATIVE_HARNESS: '1'/, 'NATIVE_HARNESS Development Build must explicitly enable the verification flag for CocoaPods and Gradle');
  assert.match(developmentBuildSource, /spawnSync\(gradle,[\s\S]+env: runEnv/, 'NATIVE_HARNESS Gradle build must receive the explicit verification environment');
  assert.doesNotMatch(developmentBuildSource, /command\(android\.adb, \['-s', androidSerial, 'shell', 'pm', 'path', androidPackageId\]\)/, 'Android absence preflight must preserve adb pm path status');
  assert.match(developmentBuildSource, /spawnSync\(android\.adb, \['-s', androidSerial, 'shell', 'pm', 'path', androidPackageId\], \{ encoding: 'utf8', env: runEnv \}\)/, 'Android absence preflight must capture adb pm path directly');
  assert.match(developmentBuildSource, /androidInstallPreflight\.status === 0 \|\| androidInstallPreflight\.status === 1/, 'Android absence preflight must accept only documented absent-package statuses');
  assert.match(developmentBuildSource, /assert\.equal\(androidInstallPreflight\.stdout\.trim\(\), '', `refusing to replace pre-existing Android app \$\{androidPackageId\}`\)/, 'Android absence preflight must reject installed packages for either status');
  assert.doesNotMatch(developmentBuildSource, /command\(android\.adb, \['-s', androidSerial, 'shell', 'monkey'/, 'Android runtime launch must not depend on Monkey event generation');
  assert.match(developmentBuildSource, /launchableActivityMatch = badging\.match\(\/\^launchable-activity: name='\(\[\^'\]\+\)'\/m\)/, 'Android launchable activity must come from the existing APK badging inspection');
  assert.doesNotMatch(developmentBuildSource, /'android\.intent\.action\.MAIN'.+'android\.intent\.category\.LAUNCHER'/, 'Android runtime launch must not use an unresolved implicit intent');
  assert.match(developmentBuildSource, /command\(android\.adb, \['-s', androidSerial, 'shell', 'am', 'start', '-W', '-n', `\$\{androidPackageId\}\/\$\{androidLaunchableActivity\}`\]\)/, 'Android runtime launch must use the exact package and launchable activity derived from the APK');
  const forgedRuntime = { status: 'PASS', cycles: 3, golden: read(manifest.adapterFixture.golden).toString('utf8').trim() };
  const forgedPass = {
    status: 'PASS',
    ios: { runtime: forgedRuntime, package: { luaProviderCount: 1 } },
    android: { runtime: forgedRuntime, package: { luaProviderCount: 1 } }
  };
  assert.deepEqual(Object.keys(developmentBuildRunner), ['runNativeHarnessDevelopmentBuild'], 'Development Build runner must expose only real execution');
  assert.throws(() => developmentBuildRunner.validateDevelopmentBuildResult(forgedPass), 'complete synthetic PASS evidence must not have a public approval path');
  verifyUpstream(temp);
  verifyContracts();
  compileHost(temp);
  compileApple(temp);
  compileAndroid(temp);
  verifyAutolinking();
  console.log(JSON.stringify({ status: 'PASS', tier: 'native' }));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
