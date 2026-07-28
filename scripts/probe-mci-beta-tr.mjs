import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const productConfig = JSON.parse(fs.readFileSync(
  path.join(root, 'config/product-config.json'), 'utf8'));
const requireConfiguration = (valid, message) => {
  if (valid) return;
  console.error(`FAIL MCI BETA GD1000Q1 probe configuration: ${message}`);
  process.exit(64);
};
requireConfiguration(args.length === 4 && args[0] === '--platform' &&
  ['ios', 'android'].includes(args[1]) && args[2] === '--source',
  'use --platform ios|android --source apps/allnewmts/assets/ip.dat');
requireConfiguration(
  process.env.ALLNEWMTS_MCI_LIVE_BETA_TR === 'GD1000Q1',
  'ALLNEWMTS_MCI_LIVE_BETA_TR=GD1000Q1 is required');
const channelDetail = productConfig.platforms[args[1]].mciChannelDetail;
requireConfiguration(/^[A-Z0-9]{5}$/.test(channelDetail),
  'product channel detail must be five uppercase ASCII bytes');

const source = path.resolve(args[3]);
requireConfiguration(fs.existsSync(source) && fs.statSync(source).isFile(),
  'BETA source must be a regular file');
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), 'allnewmts-mci-tr-probe-'));
const run = (file, commandArgs, options = {}) => {
  const result = spawnSync(file, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    ...options,
  });
  assert.equal(result.error, undefined, `${file} could not start`);
  assert.equal(result.status, 0,
    `${file} failed:\n${result.stdout}${result.stderr}`);
  return result.stdout;
};

try {
  const object = path.join(temporary, 'sha256.o');
  const executable = path.join(temporary, 'mci-beta-tr-probe');
  run(process.env.CC || 'cc', [
    '-std=c99', '-Wall', '-Wextra', '-Werror',
    '-I', 'modules/allnewmts-networking/shared',
    '-I', 'native/common',
    '-c', 'native/common/sha256.c', '-o', object,
  ]);
  run(process.env.CXX || 'c++', [
    '-std=c++17', '-Wall', '-Wextra', '-Werror',
    `-DALLNEWMTS_PRODUCT_MCI_CHANNEL_DETAIL="${channelDetail}"`,
    '-I', 'modules/allnewmts-networking/shared',
    '-I', 'native/common',
    'modules/allnewmts-networking/shared/allnewmts_mci.cpp',
    'modules/allnewmts-networking/shared/allnewmts_mci_socket.cpp',
    'modules/allnewmts-networking/shared/allnewmts_product_config.cpp',
    'native/test/mci_beta_tr_probe.cpp',
    object, '-pthread', '-o', executable,
  ]);
  process.stdout.write(run(executable, [source], { timeout: 50000 }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
