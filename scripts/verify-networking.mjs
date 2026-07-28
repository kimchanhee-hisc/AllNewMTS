import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSchema } from './verify-foundation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productConfig = JSON.parse(fs.readFileSync(
  path.join(root, 'config/product-config.json'), 'utf8'));
const productConfigSchema = JSON.parse(fs.readFileSync(
  path.join(root, 'config/product-config.schema.json'), 'utf8'));
const productSecretsSchema = JSON.parse(fs.readFileSync(
  path.join(root, 'config/product-secrets.schema.json'), 'utf8'));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'allnewmts-networking-'));
const run = (file, args) => {
  const result = spawnSync(file, args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.error, undefined, `${file} could not start`);
  assert.equal(result.status, 0, `${file} failed:\n${result.stdout}${result.stderr}`);
  return result.stdout;
};

try {
  validateSchema(productConfigSchema, productConfig, 'product config');
  validateSchema(productSecretsSchema, {
    $schema: './product-secrets.schema.json',
    schemaVersion: 1,
    restApiAuthKey: 'synthetic',
  }, 'synthetic product secrets');
  assert.deepEqual(Object.keys(productConfig.secretStore),
    ['localPath', 'easFileEnvironmentVariable', 'schemaPath', 'requiredFor'],
  'committed product config must contain only secret-store routing');
  assert.deepEqual(productConfig.restApi, {
    baseUrl: 'https://plus-cmn-beta.hanwhawm.com:1443',
    apiPath: '/mts/os/1',
    clientId: 'PLUS_APP',
    htsId: 'NEWMTS',
  }, 'REST BETA product values must stay pinned');
  const ignored = spawnSync('git', ['check-ignore', '--quiet',
    productConfig.secretStore.localPath], { cwd: root });
  assert.equal(ignored.status, 0, 'local product secret store must be ignored');
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch',
    productConfig.secretStore.localPath], { cwd: root });
  assert.notEqual(tracked.status, 0, 'local product secret store must be untracked');
  for (const [platform, expected] of Object.entries({
    ios: productConfig.platforms.ios.mciChannelDetail,
    android: productConfig.platforms.android.mciChannelDetail,
  })) {
    const configTest = path.join(temporary, `product-config-${platform}`);
    run(process.env.CXX || 'c++', [
      '-std=c++17', '-Wall', '-Wextra', '-Werror',
      `-DALLNEWMTS_PRODUCT_MCI_CHANNEL_DETAIL="${expected}"`,
      '-I', 'modules/allnewmts-lua/shared',
      'modules/allnewmts-lua/shared/allnewmts_product_config.cpp',
      'native/test/product_config_test.cpp',
      '-o', configTest,
    ]);
    run(configTest, [expected]);
  }
  const object = path.join(temporary, 'sha256.o');
  const executable = path.join(temporary, 'mci-transport-test');
  const restAuth = path.join(temporary, 'rest-auth-test');
  const probe = path.join(temporary, 'mci-beta-probe');
  const realtimeProbe = path.join(temporary, 'mci-beta-realtime-probe');
  const trProbe = path.join(temporary, 'mci-beta-tr-probe');
  const restTrProbe = path.join(temporary, 'rest-beta-tr-probe');
  run(process.env.CC || 'cc', [
    '-std=c99', '-Wall', '-Wextra', '-Werror',
    '-I', 'modules/allnewmts-lua/shared',
    '-c', 'modules/allnewmts-lua/shared/sha256.c', '-o', object,
  ]);
  run(process.env.CXX || 'c++', [
    '-std=c++17', '-Wall', '-Wextra', '-Werror',
    '-I', 'modules/allnewmts-lua/shared',
    'modules/allnewmts-lua/shared/allnewmts_rest_auth.cpp',
    'native/test/rest_auth_test.cpp',
    '-pthread', '-o', restAuth,
  ]);
  run(process.env.CXX || 'c++', [
    '-std=c++17', '-Wall', '-Wextra', '-Werror',
    '-DALLNEWMTS_MCI_TESTING',
    '-I', 'modules/allnewmts-lua/shared',
    'modules/allnewmts-lua/shared/allnewmts_mci.cpp',
    'modules/allnewmts-lua/shared/allnewmts_mci_socket.cpp',
    'native/test/mci_transport_test.cpp',
    object, '-pthread', '-o', executable,
  ]);
  run(process.env.CXX || 'c++', [
    '-std=c++17', '-Wall', '-Wextra', '-Werror',
    '-DALLNEWMTS_PRODUCT_MCI_CHANNEL_DETAIL="CC320"',
    '-I', 'modules/allnewmts-lua/shared',
    'modules/allnewmts-lua/shared/allnewmts_mci.cpp',
    'modules/allnewmts-lua/shared/allnewmts_mci_socket.cpp',
    'modules/allnewmts-lua/shared/allnewmts_product_config.cpp',
    'native/test/mci_beta_probe.cpp',
    object, '-pthread', '-o', probe,
  ]);
  run(process.env.CXX || 'c++', [
    '-std=c++17', '-Wall', '-Wextra', '-Werror',
    '-DALLNEWMTS_PRODUCT_MCI_CHANNEL_DETAIL="CC320"',
    '-I', 'modules/allnewmts-lua/shared',
    'modules/allnewmts-lua/shared/allnewmts_mci.cpp',
    'modules/allnewmts-lua/shared/allnewmts_mci_socket.cpp',
    'modules/allnewmts-lua/shared/allnewmts_product_config.cpp',
    'native/test/mci_beta_realtime_probe.cpp',
    object, '-pthread', '-o', realtimeProbe,
  ]);
  run(process.env.CXX || 'c++', [
    '-std=c++17', '-Wall', '-Wextra', '-Werror',
    '-DALLNEWMTS_PRODUCT_MCI_CHANNEL_DETAIL="CC321"',
    '-I', 'modules/allnewmts-lua/shared',
    'modules/allnewmts-lua/shared/allnewmts_mci.cpp',
    'modules/allnewmts-lua/shared/allnewmts_mci_socket.cpp',
    'modules/allnewmts-lua/shared/allnewmts_product_config.cpp',
    'native/test/mci_beta_tr_probe.cpp',
    object, '-pthread', '-o', trProbe,
  ]);
  const blockedEnvironment = { ...process.env };
  delete blockedEnvironment.ALLNEWMTS_MCI_LIVE_BETA;
  const blocked = spawnSync(probe, ['unused'], {
    cwd: root,
    encoding: 'utf8',
    env: blockedEnvironment,
  });
  assert.equal(blocked.status, 64, 'live BETA probe must fail without opt-in');
  delete blockedEnvironment.ALLNEWMTS_MCI_LIVE_BETA_REAL;
  const blockedRealtime = spawnSync(realtimeProbe, ['unused'], {
    cwd: root,
    encoding: 'utf8',
    env: blockedEnvironment,
  });
  assert.equal(blockedRealtime.status, 64,
    'live BETA S00 probe must fail without exact opt-in');
  delete blockedEnvironment.ALLNEWMTS_MCI_LIVE_BETA_TR;
  const blockedTr = spawnSync(trProbe, ['unused'], {
    cwd: root,
    encoding: 'utf8',
    env: blockedEnvironment,
  });
  assert.equal(blockedTr.status, 64,
    'live BETA GD1000Q1 probe must fail without exact opt-in');
  if (process.platform === 'darwin') {
    delete blockedEnvironment.ALLNEWMTS_REST_LIVE_BETA_TR;
    delete blockedEnvironment.ALLNEWMTS_PRODUCT_SECRETS_FILE;
    run('swiftc', [
      '-warnings-as-errors', 'scripts/probe-rest-beta-tr.swift',
      '-o', restTrProbe,
    ]);
    const blockedRestTr = spawnSync(restTrProbe, [], {
      cwd: root,
      encoding: 'utf8',
      env: blockedEnvironment,
    });
    assert.equal(blockedRestTr.status, 64,
      'live BETA TR3200Q1 probe must fail without exact opt-in');
  }
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 ||
    (args.length === 2 && args[0] === '--beta-source'),
  'usage: npm run verify:networking -- [--beta-source /path/to/ip.dat]');
  if (args.length) {
    const source = path.resolve(args[1]);
    assert.ok(fs.statSync(source).isFile(), 'BETA source must be a regular file');
    console.log(run(executable, [source]).trim());
  } else {
    console.log(run(executable, []).trim());
  }
  console.log(run(restAuth, []).trim());
  console.log(JSON.stringify({ status: 'PASS', tier: 'networking', remoteOperations: 0 }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
