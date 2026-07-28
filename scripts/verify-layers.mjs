import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productRoot = 'apps/allnewmts';
const xmfRoot = 'apps/labs/xmf-runtime';
const networkingRoot = 'apps/labs/networking';
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const projectDependencies = (manifest) => Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })
  .filter((name) => name.startsWith('@allnewmts/') || name.startsWith('allnewmts-')).sort();
const sourceFiles = (directory) => fs.readdirSync(path.join(root, directory), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name))
  .map((entry) => path.join(entry.parentPath, entry.name));
const imports = (files) => files.flatMap((file) =>
  [...fs.readFileSync(file, 'utf8').matchAll(/(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)].map((match) => match[1]));

for (const file of ['App.tsx', 'app.json', 'index.ts']) assert.equal(fs.existsSync(path.join(root, file)), false, `shared root executable remains: ${file}`);

const productApp = json(`${productRoot}/package.json`);
const xmfApp = json(`${xmfRoot}/package.json`);
const networkingApp = json(`${networkingRoot}/package.json`);
const screen = json('packages/screen-runtime/package.json');
assert.equal(productApp.main, 'index.ts');
assert.equal(xmfApp.main, 'index.ts');
assert.equal(networkingApp.main, 'index.ts');
assert.equal(screen.main, 'src/index.ts');
assert.deepEqual(projectDependencies(productApp), ['allnewmts-networking']);
assert.deepEqual(projectDependencies(xmfApp), ['@allnewmts/screen-runtime', 'allnewmts-runtime']);
assert.deepEqual(projectDependencies(networkingApp), ['allnewmts-networking']);
assert.deepEqual(projectDependencies(screen), ['allnewmts-runtime']);

const productImports = imports(sourceFiles(productRoot));
assert.ok(productImports.includes('allnewmts-networking'));
assert.equal(productImports.some((value) => value.includes('allnewmts-runtime') || value.includes('@allnewmts/screen-runtime') || value.includes('/apps/')), false);
const productSource = read(`${productRoot}/App.tsx`);
assert.ok(
  productSource.indexOf('connectMciBeta(mciSource)') <
    productSource.indexOf('fetchSamsungElectronicsQuote()'),
  'Splash MCI readiness must precede the Main quote',
);
assert.match(productSource, /screen: 'splash'/);
assert.match(productSource, /screen: 'main'/);
assert.equal(productSource.includes('process.env'), false);
assert.equal(read(`${productRoot}/assets/ip.dat`),
  '[베타]\nCNT=1\nIP1=mtsbeta.hanwhawm.com\nPORT=7795\n');
const xmfImports = imports(sourceFiles(xmfRoot));
assert.ok(xmfImports.includes('@allnewmts/screen-runtime') && xmfImports.includes('allnewmts-runtime'));
assert.equal(xmfImports.some((value) => value.includes('allnewmts-networking') || value.includes('/packages/screen-runtime/')), false);
const networkingImports = imports(sourceFiles(networkingRoot));
assert.ok(networkingImports.includes('allnewmts-networking'));
assert.equal(networkingImports.some((value) => value.includes('allnewmts-runtime') || value.includes('@allnewmts/screen-runtime') || value.includes('/apps/')), false);
const screenImports = imports(sourceFiles('packages/screen-runtime'));
assert.equal(screenImports.some((value) => value.includes('/apps/') || value.includes('allnewmts-networking')), false);

const productConfig = json(`${productRoot}/app.json`).expo;
assert.deepEqual({
  name: productConfig.name,
  slug: productConfig.slug,
  ios: productConfig.ios.bundleIdentifier,
  android: productConfig.android.package,
}, {
  name: 'AllNewMTS',
  slug: 'allnewmts',
  ios: 'com.allnewmts.app',
  android: 'com.allnewmts.app',
});
const config = json(`${xmfRoot}/app.json`).expo;
assert.deepEqual({
  name: config.name,
  slug: config.slug,
  ios: config.ios.bundleIdentifier,
  android: config.android.package,
}, {
  name: 'AllNewMTSXMFLab',
  slug: 'allnewmts-xmf-runtime-lab',
  ios: 'com.allnewmts.lab.xmf',
  android: 'com.allnewmts.lab.xmf',
});
const networkingConfig = json(`${networkingRoot}/app.json`).expo;
assert.deepEqual({
  name: networkingConfig.name,
  slug: networkingConfig.slug,
  ios: networkingConfig.ios.bundleIdentifier,
  android: networkingConfig.android.package,
}, {
  name: 'AllNewMTSNetworkingLab',
  slug: 'allnewmts-networking-lab',
  ios: 'com.allnewmts.lab.networking',
  android: 'com.allnewmts.lab.networking',
});
assert.deepEqual(productApp.scripts, {
  android: 'expo run:android',
  ios: 'EXPO_USE_PRECOMPILED_MODULES=0 expo run:ios',
});
assert.equal(json('package.json').scripts['app:allnewmts:ios'],
  'npm run ios --workspace @allnewmts/app');
assert.equal(json('package.json').scripts['app:allnewmts:android'],
  'npm run android --workspace @allnewmts/app');
assert.equal(json('package.json').scripts['lab:xmf'], 'node scripts/run-xmf-lab.mjs');
assert.equal(json('package.json').scripts['lab:networking'], 'node scripts/run-networking-lab.mjs');

const cli = path.join(root, 'node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js');
for (const platform of ['ios', 'android']) {
  for (const [appRoot, expected, absent] of [
    [productRoot, 'allnewmts-networking', 'allnewmts-runtime'],
    [xmfRoot, 'allnewmts-runtime', 'allnewmts-networking'],
    [networkingRoot, 'allnewmts-networking', 'allnewmts-runtime'],
  ]) {
    const result = spawnSync(process.execPath, [cli, 'search', '--project-root', appRoot, '--platform', platform, '--json'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const modules = JSON.parse(result.stdout);
    assert.ok(modules[expected], `${platform} ${appRoot} omits ${expected}`);
    assert.deepEqual(modules[expected].duplicates, []);
    assert.equal(modules[absent], undefined, `${platform} ${appRoot} linked ${absent}`);
  }
}

console.log(JSON.stringify({
  status: 'PASS',
  tier: 'layers',
  targets: {
    allnewmts: { projectDependencies: projectDependencies(productApp), nativeModules: ['allnewmts-networking'] },
    'xmf-runtime-lab': { projectDependencies: projectDependencies(xmfApp), nativeModules: ['allnewmts-runtime'] },
    'networking-lab': { projectDependencies: projectDependencies(networkingApp), nativeModules: ['allnewmts-networking'] },
  },
}));
