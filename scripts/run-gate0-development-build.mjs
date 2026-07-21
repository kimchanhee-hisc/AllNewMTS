import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const marker = 'ALLNEWMTS_G002_RUNTIME_RESULT=';
const expected = fs.readFileSync(path.join(root, 'native/test/adapter-golden.txt'), 'utf8').trim();
const networkDenyProfile = '(version 1)(allow default)(deny network*)';
const runEnv = {
  ...process.env,
  ANDROID_HOME: process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk'),
  CI: '1',
  COCOAPODS_DISABLE_STATS: 'true',
  EXPO_USE_PRECOMPILED_MODULES: '0',
  EXPO_OFFLINE: '1',
  EXPO_PUBLIC_G002_NATIVE_HARNESS: '1',
  npm_config_offline: 'true',
  PATH: `${path.join(process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk'), 'cmake/3.22.1/bin')}:${process.env.PATH}`,
  RCT_HERMES_V1_ENABLED: '1',
  RCT_USE_PREBUILT_RNCORE: '0',
  RCT_USE_RN_DEP: '0',
  GRADLE_OPTS: `${process.env.GRADLE_OPTS ?? ''} -Dorg.gradle.offline=true`.trim()
};

function command(file, args, options = {}) {
  const result = spawnSync(file, args, { cwd: root, encoding: 'utf8', env: runEnv, maxBuffer: 100 * 1024 * 1024, ...options });
  assert.equal(result.error, undefined, `${file} could not start: ${result.error?.message}`);
  const diagnostic = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  assert.equal(result.status, 0, `${file} ${args.join(' ')} failed:\n${diagnostic.slice(-20000)}`);
  return result.stdout ?? '';
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForMetro(port) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = await new Promise((resolve) => {
      const request = http.get(`http://127.0.0.1:${port}/status`, (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => resolve(data.includes('packager-status:running')));
      });
      request.on('error', () => resolve(false));
      request.setTimeout(500, () => { request.destroy(); resolve(false); });
    });
    if (ready) return;
    await delay(500);
  }
  throw new Error('Metro did not become ready');
}

async function reserveMetroPort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object', 'failed to reserve a local Metro port');
  return { port: address.port, release: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

async function stopProcessGroup(child) {
  if (!child) return;
  const exists = () => {
    try { process.kill(-child.pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; }
  };
  if (!exists()) return;
  const signal = (name) => {
    try { process.kill(-child.pid, name); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  signal('SIGTERM');
  for (let attempt = 0; attempt < 30 && exists(); attempt += 1) await delay(100);
  if (exists()) signal('SIGKILL');
  for (let attempt = 0; attempt < 30 && exists(); attempt += 1) await delay(100);
  assert.equal(exists(), false, 'Metro process group did not terminate');
}

async function waitForMarker(files, timeoutMilliseconds = 90000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const output = files.filter(fs.existsSync).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    const line = output.split(/\r?\n/).find((item) => item.includes(marker));
    if (line) {
      const payload = JSON.parse(line.slice(line.indexOf(marker) + marker.length));
      assert.deepEqual(payload, { status: 'PASS', cycles: 3, golden: expected }, 'Development Build runtime golden mismatch');
      return payload;
    }
    await delay(500);
  }
  throw new Error(`Development Build emitted no ${marker} marker`);
}

function appleTarget() {
  const devices = JSON.parse(command('xcrun', ['simctl', 'list', 'devices', 'available', '-j'])).devices;
  const candidates = Object.entries(devices).filter(([runtime]) => runtime.includes('iOS')).flatMap(([, items]) => items).filter((item) => item.isAvailable && item.name.includes('iPhone'));
  const device = candidates.find(({ state }) => state === 'Booted') ?? candidates[0];
  assert.ok(device, 'no available iOS simulator target');
  return { ...device, bootedByRunner: device.state !== 'Booted' };
}

function androidTargets() {
  const adb = path.join(runEnv.ANDROID_HOME, 'platform-tools/adb');
  assert.ok(fs.existsSync(adb), 'adb is unavailable');
  return { adb, serials: command(adb, ['devices']).split('\n').filter((line) => /\tdevice$/.test(line)).map((line) => line.split('\t')[0]) };
}

function offlineGradleBinary() {
  const properties = fs.readFileSync(path.join(root, 'android/gradle/wrapper/gradle-wrapper.properties'), 'utf8');
  const url = properties.match(/^distributionUrl=(.+)$/m)?.[1]?.replaceAll('\\:', ':');
  assert.ok(url, 'generated Android wrapper omits distributionUrl');
  const archive = path.basename(url);
  const version = archive.match(/^gradle-(.+)-(?:bin|all)\.zip$/)?.[1];
  assert.ok(version, `unsupported Gradle distribution: ${archive}`);
  const cache = path.join(os.homedir(), '.gradle/wrapper/dists', archive.slice(0, -4));
  if (!fs.existsSync(cache)) return { archive, binary: null };
  const binaries = fs.readdirSync(cache).flatMap((hash) => {
    const binary = path.join(cache, hash, `gradle-${version}/bin/gradle`);
    return fs.existsSync(binary) ? [binary] : [];
  });
  assert.ok(binaries.length <= 1, `ambiguous cached Gradle distribution: ${archive}`);
  return { archive, binary: binaries[0] ?? null };
}

function cachedPodSource(name, version, requiredPath) {
  const specs = path.join(os.homedir(), 'Library/Caches/CocoaPods/Pods/Specs/External', name);
  assert.ok(fs.existsSync(specs), `OFFLINE_DEPENDENCY_UNAVAILABLE: CocoaPods has no local ${name} ${version} cache`);
  const matches = fs.readdirSync(specs).filter((file) => file.endsWith('.podspec.json')).filter((file) => {
    const spec = JSON.parse(fs.readFileSync(path.join(specs, file), 'utf8'));
    return spec.name === name && spec.version === version;
  });
  assert.equal(matches.length, 1, `OFFLINE_DEPENDENCY_UNAVAILABLE: expected one local ${name} ${version} cache entry`);
  const key = matches[0].slice(0, -'.podspec.json'.length);
  const source = path.join(os.homedir(), 'Library/Caches/CocoaPods/Pods/External', name, key);
  assert.ok(fs.existsSync(path.join(source, requiredPath)), `OFFLINE_DEPENDENCY_UNAVAILABLE: cached ${name} ${version} is incomplete`);
  return source;
}

function localTarball(temp, name, version, source) {
  const tarball = path.join(temp, `${name}-${version}.tar.gz`);
  command('tar', ['-czf', tarball, '-C', source, '.']);
  return tarball;
}

function reactNativeDependenciesTarball(temp, version, source) {
  const root = path.join(temp, 'react-native-dependencies-staging');
  const staging = path.join(root, 'payload');
  fs.mkdirSync(staging, { recursive: true });
  fs.symlinkSync(path.join(source, 'framework/packages/react-native/ReactNativeDependencies.xcframework'), path.join(staging, 'ReactNativeDependencies.xcframework'), 'dir');
  fs.writeFileSync(path.join(root, 'LOCAL_CACHE_PROVENANCE'), `ReactNativeDependencies ${version}\n`);
  const tarball = path.join(temp, `react-native-dependencies-${version}.tar.gz`);
  command('tar', ['-chzf', tarball, '-C', root, '.']);
  return tarball;
}

function prepareLocalAppleDependencies(temp) {
  const properties = fs.readFileSync(path.join(root, 'node_modules/react-native/sdks/hermes-engine/version.properties'), 'utf8');
  const hermesVersion = properties.match(/^HERMES_V1_VERSION_NAME=(.+)$/m)?.[1];
  assert.ok(hermesVersion, 'installed React Native omits its Hermes V1 version');
  const hermes = cachedPodSource('hermes-engine', hermesVersion, 'destroot/Library/Frameworks/universal/hermesvm.xcframework');
  runEnv.HERMES_ENGINE_TARBALL_PATH = localTarball(temp, 'hermes-ios', hermesVersion, hermes);

  const reactNativeVersion = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/react-native/package.json'), 'utf8')).version;
  const dependencies = cachedPodSource('ReactNativeDependencies', reactNativeVersion, 'framework/packages/react-native/ReactNativeDependencies.xcframework');
  runEnv.RCT_USE_LOCAL_RN_DEP = reactNativeDependenciesTarball(temp, reactNativeVersion, dependencies);
}

function offlineDependencyBlock(iosPackage, iosResult, archive, diagnostic) {
  return validateDevelopmentBuildResult({
    status: 'BLOCKED',
    criterion: 'G0.2/G0.10 Android Expo Development Build',
    reasonCode: 'OFFLINE_DEPENDENCY_UNAVAILABLE',
    reason: diagnostic,
    ios: { runtime: iosResult, package: { bundleId: iosPackage.bundleId, luaProvider: iosPackage.luaProvider, luaProviderCount: 1 } },
    android: { build: 'BLOCKED', offlinePreflight: 'FAIL', expectedDistribution: archive }
  });
}

function inspectApplePackage(app, temp) {
  const plist = path.join(app, 'Info.plist');
  const executableName = command('/usr/libexec/PlistBuddy', ['-c', 'Print:CFBundleExecutable', plist]).trim();
  const bundleId = command('/usr/libexec/PlistBuddy', ['-c', 'Print:CFBundleIdentifier', plist]).trim();
  const executable = path.join(app, executableName);
  assert.ok(fs.existsSync(executable), 'iOS package executable missing');
  const inventory = command('find', [app, '-type', 'f']).trim().split('\n').filter(Boolean);
  const machoFiles = inventory.filter((file) => command('file', ['-b', file]).includes('Mach-O'));
  const providers = machoFiles.flatMap((file) => {
    const symbols = command('nm', ['-U', file]);
    return symbols.split('\n').filter((line) => /\b_lua_newstate$/.test(line)).map(() => path.relative(app, file));
  });
  assert.equal(providers.length, 1, `iOS package must contain exactly one lua_newstate provider: ${JSON.stringify(providers)}`);
  const links = machoFiles.map((file) => command('otool', ['-L', file])).join('\n');
  assert.doesNotMatch(links, /(?:liblua|luajit)/i, 'iOS package links a second Lua library');
  const prohibited = ['mvigs', 'engine'].join('');
  assert.equal(inventory.join('\n').toLowerCase().includes(prohibited), false, 'iOS package contains prohibited artifact');
  fs.writeFileSync(path.join(temp, 'ios-package-evidence.json'), JSON.stringify({ bundleId, executableName, luaProvider: providers[0], luaProviderCount: 1 }, null, 2));
  return { bundleId, executable, luaProvider: providers[0] };
}

function inspectAndroidPackage(apk, temp) {
  const inventory = command('unzip', ['-Z1', apk]);
  const nativePath = inventory.split('\n').find((item) => item === 'lib/arm64-v8a/liballnewmts_lua.so');
  assert.ok(nativePath, 'Android package omits arm64-v8a Lua module');
  const prohibited = ['mvigs', 'engine'].join('');
  assert.equal(inventory.toLowerCase().includes(prohibited), false, 'Android package contains prohibited artifact');
  const library = path.join(temp, 'liballnewmts_lua.so');
  fs.writeFileSync(library, command('unzip', ['-p', apk, nativePath], { encoding: null }));
  const tools = path.join(runEnv.ANDROID_HOME, 'ndk/27.1.12297006/toolchains/llvm/prebuilt/darwin-x86_64/bin');
  const symbols = command(path.join(tools, 'llvm-nm'), ['-D', '--defined-only', library]);
  assert.equal(symbols.split('\n').filter((line) => /\blua_newstate$/.test(line)).length, 1, 'Android package must contain exactly one lua_newstate provider');
  assert.match(symbols, /Java_com_allnewmts_lua_AllNewMTSLuaModule_nativeCreate/);
  const links = command(path.join(tools, 'llvm-readelf'), ['-d', library]);
  assert.doesNotMatch(links, /NEEDED.*(?:lua|luajit)/i, 'Android package links a second Lua provider');
  fs.writeFileSync(path.join(temp, 'android-package-evidence.json'), JSON.stringify({ apk: path.basename(apk), luaProviderCount: 1 }, null, 2));
  return { apk: path.basename(apk), luaProviderCount: 1 };
}

function packageIdFromApk(apk) {
  const aapt = path.join(runEnv.ANDROID_HOME, 'build-tools/36.0.0/aapt');
  const badging = command(aapt, ['dump', 'badging', apk]);
  const match = badging.match(/^package: name='([^']+)'/m);
  assert.ok(match, 'Android package id missing');
  return match[1];
}

export async function runGate0DevelopmentBuild(temp) {
  for (const directory of ['ios', 'android']) assert.equal(fs.existsSync(path.join(root, directory)), false, `refusing to replace existing ${directory}/`);
  const apple = appleTarget();
  const android = androidTargets();
  let metro;
  let metroLog;
  let metroReservation;
  let metroPort;
  let iosBundleId;
  let iosBootedByRunner = false;
  let iosInstalled = false;
  let iosPackage;
  let androidInstalled = false;
  let androidPackageId;
  let androidReverse = false;
  let androidSerial;
  try {
    metroReservation = await reserveMetroPort();
    metroPort = metroReservation.port;
    runEnv.RCT_METRO_PORT = String(metroPort);
    runEnv.CP_CACHE_DIR = path.join(temp, 'cocoapods-cache');
    prepareLocalAppleDependencies(temp);
    command(path.join(root, 'node_modules/.bin/expo'), ['prebuild', '--no-install', '--platform', 'all']);
    const pod = command('which', ['pod']).trim();
    command('/usr/bin/sandbox-exec', ['-p', networkDenyProfile, pod, 'install', '--no-repo-update'], { cwd: path.join(root, 'ios') });

    if (apple.bootedByRunner) {
      command('xcrun', ['simctl', 'boot', apple.udid]);
      iosBootedByRunner = true;
      command('xcrun', ['simctl', 'bootstatus', apple.udid, '-b']);
    }
    const derived = path.join(temp, 'ios-derived');
    command('xcodebuild', ['-quiet', '-workspace', 'ios/AllNewMTS.xcworkspace', '-scheme', 'AllNewMTS', '-configuration', 'Debug', '-sdk', 'iphonesimulator', '-destination', `id=${apple.udid}`, '-derivedDataPath', derived, 'CODE_SIGNING_ALLOWED=NO', `RCT_METRO_PORT=${metroPort}`, 'build']);
    const apps = fs.readdirSync(path.join(derived, 'Build/Products/Debug-iphonesimulator')).filter((name) => name.endsWith('.app'));
    assert.deepEqual(apps, ['AllNewMTS.app'], 'unexpected iOS Development Build output');
    const app = path.join(derived, 'Build/Products/Debug-iphonesimulator', apps[0]);
    iosPackage = inspectApplePackage(app, temp);
    ({ bundleId: iosBundleId } = iosPackage);

    const installed = spawnSync('xcrun', ['simctl', 'get_app_container', apple.udid, iosBundleId, 'app'], { encoding: 'utf8' });
    assert.equal(installed.error, undefined, `simctl app preflight failed: ${installed.error?.message}`);
    assert.notEqual(installed.status, 0, `refusing to replace pre-existing simulator app ${iosBundleId}`);
    await metroReservation.release();
    metroReservation = undefined;
    metro = spawn(path.join(root, 'node_modules/.bin/expo'), ['start', '--offline', '--port', String(metroPort)], { cwd: root, env: runEnv, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    metroLog = fs.createWriteStream(path.join(temp, 'metro.log'));
    metro.stdout.pipe(metroLog); metro.stderr.pipe(metroLog);
    await waitForMetro(metroPort);

    command('xcrun', ['simctl', 'install', apple.udid, app]);
    iosInstalled = true;
    const iosOut = path.join(temp, 'ios-runtime.stdout.log');
    const iosErr = path.join(temp, 'ios-runtime.stderr.log');
    command('xcrun', ['simctl', 'launch', '--terminate-running-process', `--stdout=${iosOut}`, `--stderr=${iosErr}`, apple.udid, iosBundleId]);
    const iosResult = await waitForMarker([iosOut, iosErr, path.join(temp, 'metro.log')]);

    const javaHome = process.env.JAVA_HOME || '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
    assert.ok(fs.existsSync(javaHome), 'local Android Studio JDK is unavailable');
    runEnv.JAVA_HOME = javaHome;
    const gradle = offlineGradleBinary();
    if (!gradle.binary) return offlineDependencyBlock(iosPackage, iosResult, gradle.archive, `local ${gradle.archive} cache is absent; network access is forbidden`);
    const build = spawnSync(gradle.binary, [':app:assembleDebug', '--offline', '--no-daemon', `-PreactNativeDevServerPort=${metroPort}`], { cwd: path.join(root, 'android'), encoding: 'utf8', env: runEnv, maxBuffer: 100 * 1024 * 1024 });
    assert.equal(build.error, undefined, `${gradle.binary} could not start: ${build.error?.message}`);
    if (build.status !== 0) {
      const diagnostic = `${build.stdout ?? ''}${build.stderr ?? ''}`.slice(-20000);
      assert.match(diagnostic, /(?:No cached version .+ available for offline mode|Plugin \[id: .+\] was not found)/s, `offline Android build failed for a non-dependency reason:\n${diagnostic}`);
      return offlineDependencyBlock(iosPackage, iosResult, gradle.archive, `pinned Gradle dependency is absent from the local offline cache:\n${diagnostic}`);
    }
    const apk = path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
    assert.ok(fs.existsSync(apk), 'Android Development Build APK missing');
    const androidPackage = inspectAndroidPackage(apk, temp);

    if (!android.serials.length) return validateDevelopmentBuildResult({ status: 'BLOCKED', criterion: 'G0.2/G0.10 Android Expo adapter runtime', reason: 'adb reports zero emulator/device targets after the real Android Development Build compiled and was package-inspected', ios: { runtime: iosResult, package: { bundleId: iosPackage.bundleId, luaProviderCount: 1 } }, android: { build: 'PASS', package: androidPackage } });
    androidSerial = android.serials[0];
    androidPackageId = packageIdFromApk(apk);
    const androidInstallPreflight = spawnSync(android.adb, ['-s', androidSerial, 'shell', 'pm', 'path', androidPackageId], { encoding: 'utf8', env: runEnv });
    assert.equal(androidInstallPreflight.error, undefined, `adb package preflight could not start: ${androidInstallPreflight.error?.message}`);
    const androidInstallDiagnostic = `${androidInstallPreflight.stdout ?? ''}${androidInstallPreflight.stderr ?? ''}`;
    assert.ok(androidInstallPreflight.status === 0 || androidInstallPreflight.status === 1, `adb package preflight failed:\n${androidInstallDiagnostic.slice(-20000)}`);
    assert.equal(androidInstallPreflight.stdout.trim(), '', `refusing to replace pre-existing Android app ${androidPackageId}`);
    const reverseRule = `tcp:${metroPort}`;
    assert.equal(command(android.adb, ['-s', androidSerial, 'reverse', '--list']).includes(reverseRule), false, `refusing to replace pre-existing adb reverse ${reverseRule}`);
    command(android.adb, ['-s', androidSerial, 'reverse', reverseRule, reverseRule]);
    androidReverse = true;
    command(android.adb, ['-s', androidSerial, 'install', apk]);
    androidInstalled = true;
    command(android.adb, ['-s', androidSerial, 'logcat', '-c']);
    command(android.adb, ['-s', androidSerial, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', '-p', androidPackageId]);
    const androidLog = path.join(temp, 'android-runtime.log');
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      fs.writeFileSync(androidLog, command(android.adb, ['-s', androidSerial, 'logcat', '-d']));
      try {
        const androidResult = await waitForMarker([androidLog], 500);
        return validateDevelopmentBuildResult({ status: 'PASS', ios: { runtime: iosResult, package: { bundleId: iosPackage.bundleId, luaProviderCount: 1 } }, android: { runtime: androidResult, package: androidPackage } });
      } catch {
        await delay(500);
      }
    }
    throw new Error('Android Development Build emitted no runtime marker');
  } finally {
    const cleanupErrors = [];
    const cleanup = async (label, action) => {
      try { await action(); } catch (error) { cleanupErrors.push(`${label}: ${error.message}`); }
    };
    await cleanup('Metro port reservation', () => metroReservation?.release());
    await cleanup('Metro process group', () => stopProcessGroup(metro));
    await cleanup('Metro log', () => metroLog ? new Promise((resolve) => metroLog.end(resolve)) : undefined);
    if (iosBundleId) spawnSync('xcrun', ['simctl', 'terminate', apple.udid, iosBundleId]);
    await cleanup('iOS app', async () => {
      if (!iosInstalled) return;
      const uninstall = spawnSync('xcrun', ['simctl', 'uninstall', apple.udid, iosBundleId], { encoding: 'utf8' });
      assert.equal(uninstall.status, 0, `failed to remove runner-installed simulator app ${iosBundleId}: ${uninstall.stderr}`);
      await delay(1000);
      const remaining = spawnSync('xcrun', ['simctl', 'get_app_container', apple.udid, iosBundleId, 'app'], { encoding: 'utf8' });
      assert.notEqual(remaining.status, 0, `runner-installed simulator app remains: ${iosBundleId}`);
    });
    await cleanup('Android app', async () => {
      if (!androidInstalled) return;
      const uninstall = spawnSync(android.adb, ['-s', androidSerial, 'uninstall', androidPackageId], { encoding: 'utf8' });
      assert.equal(uninstall.status, 0, `failed to remove runner-installed Android app ${androidPackageId}: ${uninstall.stderr}`);
      await delay(500);
      const remaining = spawnSync(android.adb, ['-s', androidSerial, 'shell', 'pm', 'path', androidPackageId], { encoding: 'utf8' });
      assert.equal(remaining.stdout.trim(), '', `runner-installed Android app remains: ${androidPackageId}`);
    });
    await cleanup('Android Metro reverse', () => {
      if (!androidReverse) return;
      const rule = `tcp:${metroPort}`;
      const remove = spawnSync(android.adb, ['-s', androidSerial, 'reverse', '--remove', rule], { encoding: 'utf8' });
      assert.equal(remove.status, 0, `failed to remove runner-created adb reverse ${rule}: ${remove.stderr}`);
      const remaining = spawnSync(android.adb, ['-s', androidSerial, 'reverse', '--list'], { encoding: 'utf8' });
      assert.equal(remaining.stdout.includes(rule), false, `runner-created adb reverse remains: ${rule}`);
    });
    await cleanup('simulator state', () => {
      if (!iosBootedByRunner) return;
      const shutdown = spawnSync('xcrun', ['simctl', 'shutdown', apple.udid], { encoding: 'utf8' });
      assert.equal(shutdown.status, 0, `failed to restore simulator shutdown state: ${shutdown.stderr}`);
    });
    await cleanup('generated native directories', () => {
      fs.rmSync(path.join(root, 'ios'), { recursive: true, force: true });
      fs.rmSync(path.join(root, 'android'), { recursive: true, force: true });
      assert.equal(fs.existsSync(path.join(root, 'ios')) || fs.existsSync(path.join(root, 'android')), false, 'generated native directories remain after cleanup');
    });
    assert.deepEqual(cleanupErrors, [], `Development Build cleanup failed:\n${cleanupErrors.join('\n')}`);
  }
}

function validateDevelopmentBuildResult(result) {
  const runtime = { status: 'PASS', cycles: 3, golden: expected };
  assert.ok(result && (result.status === 'PASS' || result.status === 'BLOCKED'), 'invalid Development Build result status');
  assert.deepEqual(result.ios?.runtime, runtime, 'genuine iOS runtime marker evidence is required');
  assert.equal(result.ios?.package?.luaProviderCount, 1, 'iOS package provider evidence is required');
  if (result.status === 'PASS') {
    assert.deepEqual(result.android?.runtime, runtime, 'genuine Android runtime marker evidence is required');
    assert.equal(result.android?.package?.luaProviderCount, 1, 'Android package provider evidence is required');
  } else if (result.reasonCode === 'OFFLINE_DEPENDENCY_UNAVAILABLE') {
    assert.equal(result.criterion, 'G0.2/G0.10 Android Expo Development Build');
    assert.equal(result.android?.build, 'BLOCKED', 'offline dependency block must not claim an Android build');
    assert.equal(result.android?.offlinePreflight, 'FAIL', 'offline dependency block requires a failed cache preflight/build');
    assert.match(result.reason, /(?:offline cache|network access is forbidden)/, 'offline dependency block must name the networkless cache boundary');
    assert.equal(result.android?.package, undefined, 'offline dependency block cannot claim Android package evidence');
  } else {
    assert.equal(result.criterion, 'G0.2/G0.10 Android Expo adapter runtime');
    assert.equal(result.android?.build, 'PASS', 'Android integration build must pass before target-only BLOCK');
    assert.equal(result.android?.package?.luaProviderCount, 1, 'Android package provider evidence is required before target-only BLOCK');
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'allnewmts-development-build-'));
  try {
    const result = await runGate0DevelopmentBuild(temp);
    console.log(JSON.stringify(result));
    if (result.status !== 'PASS') process.exitCode = 2;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
