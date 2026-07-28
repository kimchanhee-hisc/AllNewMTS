import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.join(root, 'apps/labs/xmf-runtime');
const marker = 'ALLNEWMTS_NATIVE_HARNESS_RESULT=';
const expected = fs.readFileSync(path.join(root, 'native/test/adapter-golden.txt'), 'utf8').trim();
const runEnv = {
  ...process.env,
  ANDROID_HOME: process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk'),
  CI: '1',
  COCOAPODS_DISABLE_STATS: 'true',
  EXPO_USE_PRECOMPILED_MODULES: '0',
  EXPO_PUBLIC_NATIVE_HARNESS: '1',
  PATH: `${path.join(process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk'), 'cmake/3.22.1/bin')}:${process.env.PATH}`,
  RCT_HERMES_V1_ENABLED: '1',
  RCT_USE_PREBUILT_RNCORE: '0',
  RCT_USE_RN_DEP: '0'
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

const childIsLive = (child) => child.exitCode === null && child.signalCode === null;

async function waitForChildExit(child, timeoutMilliseconds = 3000) {
  if (!childIsLive(child)) return;
  await new Promise((resolve) => {
    let timer;
    const done = () => {
      if (timer) clearTimeout(timer);
      child.removeListener('exit', done);
      resolve();
    };
    child.once('exit', done);
    timer = setTimeout(done, timeoutMilliseconds);
    if (!childIsLive(child)) done();
  });
}

function signalOwnedMetro(child, signal) {
  if (!childIsLive(child)) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'ESRCH') throw error;
    if (childIsLive(child)) child.kill(signal);
  }
}

async function verifyMetroPortReleased(port) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const probe = http.createServer();
    try {
      await new Promise((resolve, reject) => {
        probe.once('error', reject);
        probe.listen(port, '127.0.0.1', resolve);
      });
      await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
      return;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      lastError = error;
      await delay(100);
    }
  }
  throw lastError;
}

async function stopProcessGroup(child, port) {
  if (!child) return;
  if (childIsLive(child)) {
    signalOwnedMetro(child, 'SIGTERM');
    await waitForChildExit(child);
    if (childIsLive(child)) {
      signalOwnedMetro(child, 'SIGKILL');
      await waitForChildExit(child);
    }
    assert.equal(childIsLive(child), false, 'Metro direct child did not terminate');
  }
  await verifyMetroPortReleased(port);
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

function gradleBinary() {
  const properties = fs.readFileSync(path.join(projectRoot, 'android/gradle/wrapper/gradle-wrapper.properties'), 'utf8');
  const url = properties.match(/^distributionUrl=(.+)$/m)?.[1]?.replaceAll('\\:', ':');
  assert.ok(url, 'generated Android wrapper omits distributionUrl');
  const archive = path.basename(url);
  const version = archive.match(/^gradle-(.+)-(?:bin|all)\.zip$/)?.[1];
  assert.ok(version, `unsupported Gradle distribution: ${archive}`);
  const cache = path.join(os.homedir(), '.gradle/wrapper/dists', archive.slice(0, -4));
  if (!fs.existsSync(cache)) return path.join(projectRoot, 'android/gradlew');
  const binaries = fs.readdirSync(cache).flatMap((hash) => {
    const binary = path.join(cache, hash, `gradle-${version}/bin/gradle`);
    return fs.existsSync(binary) ? [binary] : [];
  });
  assert.ok(binaries.length <= 1, `ambiguous cached Gradle distribution: ${archive}`);
  return binaries[0] ?? path.join(projectRoot, 'android/gradlew');
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

function androidIdentityFromApk(apk) {
  const aapt = path.join(runEnv.ANDROID_HOME, 'build-tools/36.0.0/aapt');
  const badging = command(aapt, ['dump', 'badging', apk]);
  const packageMatch = badging.match(/^package: name='([^']+)'/m);
  const launchableActivityMatch = badging.match(/^launchable-activity: name='([^']+)'/m);
  assert.ok(packageMatch, 'Android package id missing');
  assert.ok(launchableActivityMatch, 'Android launchable activity missing');
  return { packageId: packageMatch[1], launchableActivity: launchableActivityMatch[1] };
}

export async function runNativeHarnessDevelopmentBuild(temp) {
  for (const directory of ['ios', 'android']) assert.equal(fs.existsSync(path.join(projectRoot, directory)), false, `refusing to replace existing XMF Lab ${directory}/`);
  const moduleConfigPath = path.join(root, 'modules/allnewmts-runtime/expo-module.config.json');
  const productionModuleConfig = fs.readFileSync(moduleConfigPath, 'utf8');
  const verificationModuleConfig = JSON.parse(productionModuleConfig);
  verificationModuleConfig.apple.modules.unshift('AllNewMTSLuaModule');
  verificationModuleConfig.android.modules.unshift('com.allnewmts.lua.AllNewMTSLuaModule');
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
  let primaryError;
  try {
    fs.writeFileSync(moduleConfigPath, `${JSON.stringify(verificationModuleConfig, null, 2)}\n`);
    metroReservation = await reserveMetroPort();
    metroPort = metroReservation.port;
    runEnv.RCT_METRO_PORT = String(metroPort);
    command(path.join(root, 'node_modules/.bin/expo'), ['prebuild', projectRoot, '--no-install', '--platform', 'all']);
    const pod = command('which', ['pod']).trim();
    command(pod, ['install', '--no-repo-update'], { cwd: path.join(projectRoot, 'ios') });

    if (apple.bootedByRunner) {
      command('xcrun', ['simctl', 'boot', apple.udid]);
      iosBootedByRunner = true;
      command('xcrun', ['simctl', 'bootstatus', apple.udid, '-b']);
    }
    const derived = path.join(temp, 'ios-derived');
    command('xcodebuild', ['-quiet', '-workspace', path.join(projectRoot, 'ios/AllNewMTSXMFLab.xcworkspace'), '-scheme', 'AllNewMTSXMFLab', '-configuration', 'Debug', '-sdk', 'iphonesimulator', '-destination', `id=${apple.udid}`, '-derivedDataPath', derived, 'CODE_SIGNING_ALLOWED=NO', `RCT_METRO_PORT=${metroPort}`, 'build']);
    const apps = fs.readdirSync(path.join(derived, 'Build/Products/Debug-iphonesimulator')).filter((name) => name.endsWith('.app'));
    assert.deepEqual(apps, ['AllNewMTSXMFLab.app'], 'unexpected iOS Development Build output');
    const app = path.join(derived, 'Build/Products/Debug-iphonesimulator', apps[0]);
    iosPackage = inspectApplePackage(app, temp);
    ({ bundleId: iosBundleId } = iosPackage);

    const installed = spawnSync('xcrun', ['simctl', 'get_app_container', apple.udid, iosBundleId, 'app'], { encoding: 'utf8' });
    assert.equal(installed.error, undefined, `simctl app preflight failed: ${installed.error?.message}`);
    assert.notEqual(installed.status, 0, `refusing to replace pre-existing simulator app ${iosBundleId}`);
    await metroReservation.release();
    metroReservation = undefined;
    metro = spawn(path.join(root, 'node_modules/.bin/expo'), ['start', projectRoot, '--port', String(metroPort)], { cwd: root, env: runEnv, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
    const gradle = gradleBinary();
    const build = spawnSync(gradle, [':app:assembleDebug', '--no-daemon', `-PreactNativeDevServerPort=${metroPort}`], { cwd: path.join(projectRoot, 'android'), encoding: 'utf8', env: runEnv, maxBuffer: 100 * 1024 * 1024 });
    assert.equal(build.error, undefined, `${gradle} could not start: ${build.error?.message}`);
    assert.equal(build.status, 0, `Android build failed:\n${`${build.stdout ?? ''}${build.stderr ?? ''}`.slice(-20000)}`);
    const apk = path.join(projectRoot, 'android/app/build/outputs/apk/debug/app-debug.apk');
    assert.ok(fs.existsSync(apk), 'Android Development Build APK missing');
    const androidPackage = inspectAndroidPackage(apk, temp);

    assert.ok(android.serials.length, 'adb reports zero emulator/device targets');
    androidSerial = android.serials[0];
    const androidIdentity = androidIdentityFromApk(apk);
    androidPackageId = androidIdentity.packageId;
    const androidLaunchableActivity = androidIdentity.launchableActivity;
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
    command(android.adb, ['-s', androidSerial, 'shell', 'am', 'start', '-W', '-n', `${androidPackageId}/${androidLaunchableActivity}`]);
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
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupErrors = [];
    const cleanup = async (label, action) => {
      try { await action(); } catch (error) { cleanupErrors.push(new Error(`${label}: ${error.message}`, { cause: error })); }
    };
    await cleanup('Metro port reservation', () => metroReservation?.release());
    await cleanup('Metro process group', () => stopProcessGroup(metro, metroPort));
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
    await cleanup('verification-only module registration', () => {
      fs.writeFileSync(moduleConfigPath, productionModuleConfig);
      assert.equal(fs.readFileSync(moduleConfigPath, 'utf8'), productionModuleConfig, 'production module registration was not restored');
    });
    await cleanup('generated native directories', () => {
      fs.rmSync(path.join(projectRoot, 'ios'), { recursive: true, force: true });
      fs.rmSync(path.join(projectRoot, 'android'), { recursive: true, force: true });
      assert.equal(fs.existsSync(path.join(projectRoot, 'ios')) || fs.existsSync(path.join(projectRoot, 'android')), false, 'generated XMF Lab native directories remain after cleanup');
    });
    if (primaryError && cleanupErrors.length) {
      primaryError.cleanupErrors = cleanupErrors;
      primaryError.message += `\nSecondary cleanup failures:\n${cleanupErrors.map(({ message }) => message).join('\n')}`;
    } else if (cleanupErrors.length) {
      throw new AggregateError(cleanupErrors, 'Development Build cleanup failed');
    }
  }
  throw primaryError;
}

function validateDevelopmentBuildResult(result) {
  const runtime = { status: 'PASS', cycles: 3, golden: expected };
  assert.equal(result?.status, 'PASS', 'invalid Development Build result status');
  assert.deepEqual(result.ios?.runtime, runtime, 'genuine iOS runtime marker evidence is required');
  assert.equal(result.ios?.package?.luaProviderCount, 1, 'iOS package provider evidence is required');
  assert.deepEqual(result.android?.runtime, runtime, 'genuine Android runtime marker evidence is required');
  assert.equal(result.android?.package?.luaProviderCount, 1, 'Android package provider evidence is required');
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'allnewmts-development-build-'));
  try {
    const result = await runNativeHarnessDevelopmentBuild(temp);
    console.log(JSON.stringify(result));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
