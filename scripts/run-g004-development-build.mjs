import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const markerPrefix = 'ALLNEWMTS_G004_UI_READY=';
const bundleId = 'com.anonymous.allnewmts';
const maximumSelectionAttempts = 3;
const portReleaseTimeoutMs = 1000;
const truthProbeTimeoutMs = 5000;
const allowedArguments = new Set(['', '--preflight', '--network-regression', '--pod-cache-regression', '--metro-evidence-regression', '--build-failure-marker-transport-child']);
const requestedMode = process.argv.slice(2).join(' ');
assert.ok(allowedArguments.has(requestedMode), 'usage: node scripts/run-g004-development-build.mjs [--preflight|--network-regression|--pod-cache-regression|--metro-evidence-regression|--build-failure-marker-transport-child]');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const exists = (file) => fs.existsSync(path.join(root, file));
const commandPath = (name) => {
  const result = spawnSync('/usr/bin/which', [name], { encoding: 'utf8' });
  assert.equal(result.status, 0, `TOOLCHAIN_BLOCKED: ${name} is unavailable`);
  return result.stdout.trim();
};
const run = (file, args, options = {}) => {
  const result = spawnSync(file, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
    ...options
  });
  assert.equal(result.error, undefined, `${file} could not start: ${result.error?.message}`);
  const diagnostic = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  assert.equal(result.status, 0, `${file} ${args.join(' ')} failed:\n${diagnostic.slice(-20000)}`);
  return result.stdout ?? '';
};

const buildFailurePrefix = 'ALLNEWMTS_G004_BUILD_FAILURE=';
const buildFailureSchema = 'allnewmts.g004.build-failure-evidence.v1';
const buildFailureWindowBytes = 32768;
const buildFailureCausalStreamBytes = 131072;
const buildFailureCausalPartitionBytes = 65536;
const buildFailureEvidenceBytes = 524288;
const buildFailureReductionBytes = 4096;
const namedValueMarker = '[REDACTED_NAMED_VALUE]';
const authorizationMarker = '[REDACTED_AUTHORIZATION]';
const cookieMarker = '[REDACTED_COOKIE]';
const urlMarker = '[REDACTED_URL]';
const sensitiveKeyComponents = new Set(['password', 'passwd', 'token', 'secret', 'apikey', 'credential', 'session']);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

const stableJson = (value) => JSON.stringify(stableValue(value));
const canonicalBytes = (value) => Buffer.from(stableJson(value));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function physicalLines(source) {
  const lines = [];
  let start = 0;
  while (start < source.length) {
    const lf = source.indexOf('\n', start);
    if (lf < 0) {
      lines.push({ content: source.slice(start), terminator: '' });
      break;
    }
    const hasCr = lf > start && source[lf - 1] === '\r';
    lines.push({ content: source.slice(start, hasCr ? lf - 1 : lf), terminator: hasCr ? '\r\n' : '\n' });
    start = lf + 1;
  }
  return lines;
}

function sensitiveKey(key) {
  const parts = key.toLowerCase().split(/[._-]+/);
  return parts.some((part) => sensitiveKeyComponents.has(part))
    || parts.some((part, index) => part === 'api' && parts[index + 1] === 'key');
}

function redactNamedValue(line) {
  const pattern = /(^|[ \t])([A-Za-z0-9_.-]+)([ \t]*)(:|=)([ \t]*)([^\r\n]*)$/ig;
  for (let match; (match = pattern.exec(line));) {
    if (sensitiveKey(match[2])) {
      return `${line.slice(0, match.index)}${match[1]}${match[2]}${match[3]}${match[4]}${match[5]}${namedValueMarker}`;
    }
    pattern.lastIndex = match.index + Math.max(1, match[1].length + match[2].length);
  }
  return line;
}

function sanitizeBuildLine(raw) {
  let line = redactNamedValue(raw);
  line = line.replace(/(^|[ \t])(Authorization)([ \t]*)(:|=)([ \t]*)(Basic|Bearer)[ \t]+[^\r\n]*$/ig,
    (_, boundary, key, space, delimiter, after) => `${boundary}${key}${space}${delimiter}${after}${authorizationMarker}`);
  line = line.replace(/(^|[ \t])(Cookie|Set-Cookie)([ \t]*)(:|=)([ \t]*)([^\r\n]*)$/ig,
    (_, boundary, key, space, delimiter, after) => `${boundary}${key}${space}${delimiter}${after}${cookieMarker}`);
  return line.replace(/(^|[ \t\v\f])(https?:\/\/[^ \t\v\f\r\n]+)(?=[ \t\v\f]|$)/ig, (token, boundary, url) => {
    const afterScheme = url.slice(url.indexOf('://') + 3);
    const slash = afterScheme.indexOf('/');
    const authority = slash < 0 ? afterScheme : afterScheme.slice(0, slash);
    return /[?#]/.test(afterScheme) || authority.includes('@')
      ? `${boundary}${urlMarker}`
      : token;
  });
}

function sanitizeBuildStream(source) {
  return physicalLines(source).map(({ content, terminator }) => `${sanitizeBuildLine(content)}${terminator}`).join('');
}

function utf8Prefix(buffer, maximum) {
  let end = Math.min(buffer.length, maximum);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  while (end > 0) {
    try { decoder.decode(buffer.subarray(0, end)); return buffer.subarray(0, end); } catch { end -= 1; }
  }
  return buffer.subarray(0, 0);
}

function utf8Suffix(buffer, maximum) {
  let start = Math.max(0, buffer.length - maximum);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  while (start < buffer.length) {
    try { decoder.decode(buffer.subarray(start)); return buffer.subarray(start); } catch { start += 1; }
  }
  return buffer.subarray(buffer.length);
}

function causalClass(line) {
  const trimmed = line.replace(/^[ \t\v\f]+|[ \t\v\f]+$/g, '');
  if (trimmed === '** BUILD FAILED **') return 'BUILD_FAILED';
  if (trimmed === 'The following build commands failed:') return 'FAILED_COMMAND_LIST';
  if (/^Command [^\r\n]+ failed with a nonzero exit code$/.test(trimmed)) return 'COMMAND_FAILED';
  if (line.includes('error:')) return 'DIAGNOSTIC_ERROR';
  return null;
}

function causalEntries(source, stream) {
  const lines = physicalLines(source);
  const matches = lines.flatMap(({ content }, index) => {
    const classification = causalClass(content);
    return classification ? [{ classification, index }] : [];
  });
  const intervals = [];
  for (const { index } of matches) {
    const next = { start: Math.max(0, index - 2), end: Math.min(lines.length - 1, index + 4) };
    const previous = intervals.at(-1);
    if (previous && next.start <= previous.end + 1) previous.end = Math.max(previous.end, next.end);
    else intervals.push(next);
  }
  const entries = intervals.map(({ start, end }) => {
    const entryMatches = matches.filter(({ index }) => index >= start && index <= end)
      .map(({ classification, index }) => ({ class: classification, line: index + 1, stream }));
    const causalLines = new Set(entryMatches.map(({ line }) => line));
    const contextLines = [];
    for (let index = start; index <= end; index += 1) if (!causalLines.has(index + 1)) contextLines.push(index + 1);
    const payload = lines.slice(start, end + 1).map(({ content, terminator }) => `${content}${terminator}`).join('');
    return {
      causalLines: [...causalLines],
      contextLines,
      public: {
        endLine: end + 1,
        matches: entryMatches,
        payloadBase64: Buffer.from(payload).toString('base64'),
        startLine: start + 1
      }
    };
  });
  return { entries, totalCausalMatches: matches.length, totalContextLines: new Set(entries.flatMap(({ contextLines }) => contextLines)).size };
}

function selectCausalEntries(model) {
  const earliest = [];
  for (const entry of model.entries) {
    if (canonicalBytes([...earliest.map(({ public: value }) => value), entry.public]).length > buildFailureCausalPartitionBytes) break;
    earliest.push(entry);
  }
  const earliestSet = new Set(earliest);
  const latest = [];
  for (let index = model.entries.length - 1; index >= 0; index -= 1) {
    const entry = model.entries[index];
    if (earliestSet.has(entry)) continue;
    if (canonicalBytes([entry.public, ...latest.map(({ public: value }) => value)]).length > buildFailureCausalPartitionBytes) break;
    latest.unshift(entry);
  }
  return { ...model, earliest, latest };
}

function streamEvidenceModel(buffer, stream, injectFailure) {
  if (injectFailure === 'decode') throw new Error('injected');
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  if (injectFailure === 'sanitize') throw new Error('injected');
  const sanitized = sanitizeBuildStream(decoded);
  const sanitizedBuffer = Buffer.from(sanitized);
  const head = utf8Prefix(sanitizedBuffer, buildFailureWindowBytes);
  const tail = utf8Suffix(sanitizedBuffer.subarray(head.length), buildFailureWindowBytes);
  return {
    ...selectCausalEntries(causalEntries(sanitized, stream)),
    head,
    originalByteCount: buffer.length,
    sanitizedByteCount: sanitizedBuffer.length,
    sanitizedSha256: sha256(sanitizedBuffer),
    tail
  };
}

function retainedCounts(model) {
  const retained = [...model.earliest, ...model.latest];
  const causal = new Set(retained.flatMap(({ causalLines }) => causalLines)).size;
  const context = new Set(retained.flatMap(({ contextLines }) => contextLines)).size;
  return {
    causalMatches: { omitted: model.totalCausalMatches - causal, retained: causal, total: model.totalCausalMatches },
    contextLines: { omitted: model.totalContextLines - context, retained: context, total: model.totalContextLines },
    truncated: causal < model.totalCausalMatches || context < model.totalContextLines
  };
}

function publicStreamEvidence(model) {
  return {
    causal: {
      counts: retainedCounts(model),
      earliest: model.earliest.map(({ public: value }) => value),
      latest: model.latest.map(({ public: value }) => value)
    },
    originalByteCount: model.originalByteCount,
    sanitizedByteCount: model.sanitizedByteCount,
    sanitizedSha256: model.sanitizedSha256,
    windows: {
      headBase64: model.head.toString('base64'),
      headByteCount: model.head.length,
      tailBase64: model.tail.toString('base64'),
      tailByteCount: model.tail.length,
      truncated: model.head.length + model.tail.length < model.sanitizedByteCount
    }
  };
}

function buildFailureEvidenceObject(result, models) {
  return {
    caps: {
      causalAggregateCanonicalBytes: buildFailureCausalStreamBytes * 2,
      causalPartitionCanonicalBytes: buildFailureCausalPartitionBytes,
      causalStreamCanonicalBytes: buildFailureCausalStreamBytes,
      evidenceCanonicalBytes: buildFailureEvidenceBytes,
      reductionBytes: buildFailureReductionBytes,
      windowBytes: buildFailureWindowBytes
    },
    command: 'xcodebuild',
    schema: buildFailureSchema,
    signal: result.signal ?? null,
    status: result.status ?? null,
    streams: {
      stderr: publicStreamEvidence(models.stderr),
      stdout: publicStreamEvidence(models.stdout)
    }
  };
}

function shrinkWindow(model, key) {
  const current = model[key];
  const target = Math.max(0, current.length - buildFailureReductionBytes);
  model[key] = key === 'head' ? utf8Prefix(current, target) : utf8Suffix(current, target);
  return current.length !== model[key].length;
}

function safeOriginalCounts(result) {
  return {
    stderr: Buffer.isBuffer(result.stderr) ? result.stderr.length : null,
    stdout: Buffer.isBuffer(result.stdout) ? result.stdout.length : null
  };
}

function formatBuildFailureEvidence(result, injectFailure = null, maximumEvidenceBytes = buildFailureEvidenceBytes) {
  try {
    const models = {
      stderr: streamEvidenceModel(result.stderr, 'stderr', injectFailure),
      stdout: streamEvidenceModel(result.stdout, 'stdout', injectFailure)
    };
    let evidence = buildFailureEvidenceObject(result, models);
    const refresh = () => { evidence = buildFailureEvidenceObject(result, models); return canonicalBytes(evidence).length; };
    if (injectFailure === 'canonicalize') throw new Error('injected');
    let size = canonicalBytes(evidence).length;
    for (const stream of ['stdout', 'stderr']) {
      while (size > maximumEvidenceBytes && (models[stream].earliest.length || models[stream].latest.length)) {
        if (models[stream].earliest.length) models[stream].earliest.pop();
        size = refresh();
        if (size > maximumEvidenceBytes && models[stream].latest.length) models[stream].latest.shift();
        size = refresh();
      }
    }
    const windows = [['stdout', 'tail'], ['stderr', 'tail'], ['stdout', 'head'], ['stderr', 'head']];
    while (size > maximumEvidenceBytes) {
      let changed = false;
      for (const [stream, key] of windows) {
        if (size <= maximumEvidenceBytes) break;
        changed = shrinkWindow(models[stream], key) || changed;
        size = refresh();
      }
      if (!changed) throw new Error('metadata overflow');
    }
    if (injectFailure === 'cap') throw new Error('injected');
    const frozen = deepFreeze(evidence);
    return { evidence: frozen, sha256: sha256(canonicalBytes(frozen)) };
  } catch {
    const fallback = deepFreeze({
      code: 'BUILD_FAILURE_EVIDENCE_FORMAT_ERROR',
      command: 'xcodebuild',
      originalByteCounts: safeOriginalCounts(result),
      schema: buildFailureSchema,
      signal: result.signal ?? null,
      status: result.status ?? null
    });
    return { evidence: fallback, sha256: sha256(canonicalBytes(fallback)) };
  }
}

function compiledBuildError(result, injectFailure = null) {
  const formatted = formatBuildFailureEvidence(result, injectFailure);
  const error = new Error(`xcodebuild failed with status ${result.status ?? 'null'} and signal ${result.signal ?? 'null'}; bounded evidence attached`);
  error.name = 'XcodeBuildError';
  error.code = 'XCODE_BUILD_FAILED';
  error.xcodeStatus = result.status ?? null;
  error.xcodeSignal = result.signal ?? null;
  Object.defineProperties(error, {
    buildFailureEvidence: { value: formatted.evidence },
    buildFailureEvidenceSha256: { value: formatted.sha256 }
  });
  return error;
}

function runCompiledBuild(file, args, options = {}) {
  const result = spawnSync(file, args, { cwd: root, maxBuffer: 100 * 1024 * 1024, ...options, encoding: null });
  if (result.error === undefined && result.status === 0) return;
  throw compiledBuildError(result);
}

function buildFailureEnvelope(error, cleanupErrorCount) {
  return {
    buildFailureEvidence: error.buildFailureEvidence,
    buildFailureEvidenceSha256: error.buildFailureEvidenceSha256,
    cleanupErrorCount,
    schema: 'allnewmts.g004.build-failure-envelope.v1'
  };
}

function emitBuildFailureMarker(marker) {
  const bytes = Buffer.from(`${marker}\n`);
  const pause = new Int32Array(new SharedArrayBuffer(4));
  let offset = 0;
  while (offset < bytes.length) {
    try {
      const written = fs.writeSync(process.stdout.fd, bytes, offset, Math.min(16_384, bytes.length - offset));
      assert.ok(written > 0, 'build-failure marker stdout made no progress');
      offset += written;
    } catch (error) {
      if (error?.code !== 'EAGAIN') throw error;
      Atomics.wait(pause, 0, 0, 1);
    }
  }
}

function emitBuildFailureEnvelope(error, cleanupErrors, emit = emitBuildFailureMarker) {
  const marker = `${buildFailurePrefix}${stableJson(buildFailureEnvelope(error, cleanupErrors.length))}`;
  emit(marker);
  return error;
}

function throwAfterBuildFailureEmission(primaryError, cleanupErrors, emit) {
  if (primaryError.buildFailureEvidence) {
    try {
      emitBuildFailureEnvelope(primaryError, cleanupErrors, emit);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  throw primaryError;
}

function markerTransportPrimary() {
  const primary = compiledBuildError({
    signal: null,
    status: 65,
    stderr: Buffer.from(`The following build commands failed:\nCommand CompileSwift failed with a nonzero exit code\n${'y'.repeat(180_000)}`),
    stdout: Buffer.from(`error: synthetic compiled-build failure\n${'x'.repeat(300_000)}`)
  });
  primary.message = `synthetic Xcode primary ${'z'.repeat(20_001)}`;
  return primary;
}

function markerWriterFailureRegression() {
  const primary = markerTransportPrimary();
  const evidence = primary.buildFailureEvidence;
  const evidenceSha256 = primary.buildFailureEvidenceSha256;
  const existingCleanup = new Error('G011_EXISTING_CLEANUP_ERROR');
  const writerError = new Error('G011_MARKER_WRITE_ERROR');
  const cleanupErrors = [existingCleanup];
  primary.cleanupErrors = cleanupErrors;
  let caught;
  let emitterCalls = 0;
  try {
    throwAfterBuildFailureEmission(primary, cleanupErrors, () => {
      emitterCalls += 1;
      throw writerError;
    });
  } catch (error) {
    caught = error;
  }
  assert.equal(caught, primary);
  assert.deepEqual([primary.xcodeStatus, primary.xcodeSignal], [65, null]);
  assert.equal(primary.buildFailureEvidence, evidence);
  assert.equal(primary.buildFailureEvidenceSha256, evidenceSha256);
  assert.equal(Object.isFrozen(primary.buildFailureEvidence), true);
  assert.deepEqual(primary.cleanupErrors, [existingCleanup, writerError]);
  const published = stableJson(buildFailureEnvelope(primary, primary.cleanupErrors.length));
  assert.doesNotMatch(published, /G011_EXISTING_CLEANUP_ERROR|G011_MARKER_WRITE_ERROR/);
  assert.equal(emitterCalls, 1);
  return {
    builds: 0,
    emitterCalls,
    evidenceHashPreserved: true,
    evidenceIdentityPreserved: true,
    existingCleanupPreserved: true,
    markersEmitted: 0,
    retries: 0,
    samePrimary: true,
    secondaryLocation: 'primaryError.cleanupErrors[1]',
    statusSignalPreserved: true
  };
}

function buildFailureMarkerTransportChild() {
  const writerFailure = markerWriterFailureRegression();
  fs.writeSync(process.stderr.fd, `G004_BUILD_FAILURE_WRITER_REGRESSION=${stableJson(writerFailure)}\n`);
  const primaryError = markerTransportPrimary();
  const cleanupErrors = [];
  primaryError.cleanupErrors = cleanupErrors;
  throwAfterBuildFailureEmission(primaryError, cleanupErrors);
}

async function reservePort(port = 0) {
  const acceptedSockets = new Set();
  const server = net.createServer((socket) => {
    acceptedSockets.add(socket);
    socket.once('error', () => socket.destroy());
    socket.once('close', () => acceptedSockets.delete(socket));
  });
  let serverError;
  let releasePromise;
  server.on('error', (error) => { serverError ??= error; });
  try {
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '127.0.0.1');
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object' && address.port !== 8081, 'TOOLCHAIN_BLOCKED: failed to reserve a non-default Metro port');
    return {
      port: address.port,
      release: () => {
        if (releasePromise) return releasePromise;
        releasePromise = new Promise((resolve, reject) => {
          if (!server.listening) {
            if (serverError) reject(serverError);
            else resolve();
            return;
          }
          const timer = setTimeout(() => reject(new Error(`port guard release exceeded ${portReleaseTimeoutMs}ms`)), portReleaseTimeoutMs);
          server.close((error) => {
            clearTimeout(timer);
            if (error) reject(error);
            else if (serverError) reject(serverError);
            else resolve();
          });
          for (const socket of acceptedSockets) socket.destroy();
        });
        return releasePromise;
      }
    };
  } catch (error) {
    if (server.listening) {
      server.close();
      for (const socket of acceptedSockets) socket.destroy();
    }
    throw error;
  }
}

function availableSimulator() {
  const output = run('xcrun', ['simctl', 'list', 'devices', 'available', '-j']);
  const devices = Object.entries(JSON.parse(output).devices)
    .filter(([runtime]) => runtime.includes('iOS'))
    .flatMap(([, entries]) => entries)
    .filter(({ isAvailable, name }) => isAvailable && name.includes('iPhone'));
  const device = devices.find(({ state }) => state === 'Booted') ?? devices[0];
  assert.ok(device, 'TOOLCHAIN_BLOCKED: no available iPhone simulator');
  return device;
}

function appleDependencyRequirements() {
  const properties = fs.readFileSync(path.join(root, 'node_modules/react-native/sdks/hermes-engine/version.properties'), 'utf8');
  const hermesVersion = properties.match(/^HERMES_V1_VERSION_NAME=(.+)$/m)?.[1];
  assert.ok(hermesVersion, 'installed React Native omits its Hermes V1 version');
  return [
    {
      name: 'hermes-engine',
      version: hermesVersion,
      requiredPaths: [
        'destroot/Library/Frameworks/universal/hermesvm.xcframework/Info.plist',
        'destroot/Library/Frameworks/universal/hermesvm.xcframework/ios-arm64_x86_64-simulator/hermesvm.framework/hermesvm',
        'destroot/include/hermes/hermes.h'
      ]
    },
    {
      name: 'ReactNativeDependencies',
      version: JSON.parse(fs.readFileSync(path.join(root, 'node_modules/react-native/package.json'), 'utf8')).version,
      requiredPaths: [
        'framework/packages/react-native/ReactNativeDependencies.xcframework/Info.plist',
        'framework/packages/react-native/ReactNativeDependencies.xcframework/ios-arm64_x86_64-simulator/ReactNativeDependencies.framework/ReactNativeDependencies',
        'framework/packages/react-native/ReactNativeDependencies.xcframework/Headers/folly/String.h'
      ]
    }
  ];
}

function cachedPodSource(name, version, requiredPaths, cache = path.join(os.homedir(), 'Library/Caches/CocoaPods/Pods')) {
  const specs = path.join(cache, 'Specs/External', name);
  assert.ok(fs.existsSync(specs), `OFFLINE_DEPENDENCY_UNAVAILABLE: CocoaPods has no local ${name} ${version} cache`);
  const matches = fs.readdirSync(specs).filter((file) => file.endsWith('.podspec.json')).filter((file) => {
    const spec = JSON.parse(fs.readFileSync(path.join(specs, file), 'utf8'));
    return spec.name === name && spec.version === version;
  });
  assert.equal(matches.length, 1, `OFFLINE_DEPENDENCY_UNAVAILABLE: expected one local ${name} ${version} cache entry`);
  const key = matches[0].slice(0, -'.podspec.json'.length);
  const source = path.join(cache, 'External', name, key);
  for (const requiredPath of requiredPaths) {
    const file = path.join(source, requiredPath);
    assert.ok(fs.existsSync(file) && fs.statSync(file).isFile() && fs.statSync(file).size > 0, `OFFLINE_DEPENDENCY_UNAVAILABLE: cached ${name} ${version} is incomplete`);
  }
  return source;
}

function cachedAppleDependencies(cache) {
  return appleDependencyRequirements().map((dependency) => ({
    ...dependency,
    source: cachedPodSource(dependency.name, dependency.version, dependency.requiredPaths, cache)
  }));
}

function assertLocalAppleDependencyContract() {
  const pods = fs.readFileSync(path.join(root, 'node_modules/react-native/scripts/react_native_pods.rb'), 'utf8');
  assert.match(pods, /if ReactNativeDependenciesUtils\.build_react_native_deps_from_source\(\)[\s\S]+DoubleConversion[\s\S]+glog[\s\S]+boost[\s\S]+fast_float[\s\S]+fmt[\s\S]+RCT-Folly[\s\S]+else[\s\S]+ReactNativeDependencies/, 'installed React Native dependency branch contract changed');
  const dependencies = fs.readFileSync(path.join(root, 'node_modules/react-native/scripts/cocoapods/rndependencies.rb'), 'utf8');
  assert.match(dependencies, /if ENV\["RCT_USE_LOCAL_RN_DEP"\][\s\S]+local_file_uri\(ENV\["RCT_USE_LOCAL_RN_DEP"\]\)[\s\S]+artifacts_exists = ENV\["RCT_USE_RN_DEP"\] == "1"[\s\S]+use_local_xcframework = ENV\["RCT_USE_LOCAL_RN_DEP"\] && File\.exist\?[\s\S]+@@build_from_source = !use_local_xcframework && !artifacts_exists/, 'installed React Native local dependency selector changed');
  const hermes = fs.readFileSync(path.join(root, 'node_modules/react-native/sdks/hermes-engine/hermes-utils.rb'), 'utf8');
  assert.match(hermes, /if hermes_engine_tarball_envvar_defined\(\)[\s\S]+LOCAL_PREBUILT_TARBALL[\s\S]+if release_artifact_exists\(version\)/, 'installed Hermes local tarball selector no longer precedes remote artifact probes');
}

function assertPodCaches() {
  assertLocalAppleDependencyContract();
  return cachedAppleDependencies();
}

function preflightSnapshot(podCaches) {
  const cache = path.join(os.homedir(), 'Library/Caches/CocoaPods/Pods');
  const files = podCaches.flatMap(({ name, source, requiredPaths }) => [
    path.join(cache, 'Specs/External', name, `${path.basename(source)}.podspec.json`),
    ...requiredPaths.map((requiredPath) => path.join(source, requiredPath))
  ]);
  return {
    dirty: run('git', ['status', '--porcelain=v1', '-z']),
    nativeDirectories: { ios: exists('ios'), android: exists('android') },
    tempEntries: fs.readdirSync(os.tmpdir()).filter((entry) => entry.startsWith('allnewmts-g004-')).sort(),
    cacheFiles: files.map((file) => ({
      file,
      size: fs.statSync(file).size,
      sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    }))
  };
}

function localTarball(temp, name, version, source) {
  const tarball = path.join(temp, `${name}-${version}.tar.gz`);
  run('tar', ['-czf', tarball, '-C', source, '.']);
  return tarball;
}

function reactNativeDependenciesTarball(temp, version, source) {
  const stagingRoot = path.join(temp, 'react-native-dependencies-staging');
  const payload = path.join(stagingRoot, 'payload');
  fs.mkdirSync(payload, { recursive: true });
  fs.symlinkSync(path.join(source, 'framework/packages/react-native/ReactNativeDependencies.xcframework'), path.join(payload, 'ReactNativeDependencies.xcframework'), 'dir');
  fs.writeFileSync(path.join(stagingRoot, 'LOCAL_CACHE_PROVENANCE'), `ReactNativeDependencies ${version}\n`);
  const tarball = path.join(temp, `react-native-dependencies-${version}.tar.gz`);
  run('tar', ['-chzf', tarball, '-C', stagingRoot, '.']);
  return tarball;
}

function assertLocalAppleSelectors(temp, env, hermesVersion, reactNativeVersion) {
  const probe = path.join(temp, 'local-apple-selectors.podspec');
  const resultFile = path.join(temp, 'local-apple-selectors.json');
  fs.writeFileSync(probe, `
require 'json'
require File.join(${JSON.stringify(root)}, 'node_modules/react-native/scripts/react_native_pods')
require File.join(${JSON.stringify(root)}, 'node_modules/react-native/sdks/hermes-engine/hermes-utils')
ReactNativeDependenciesUtils.setup_react_native_dependencies(${JSON.stringify(path.join(root, 'node_modules/react-native'))}, ${JSON.stringify(reactNativeVersion)})
ReactNativeCoreUtils.setup_rncore(${JSON.stringify(path.join(root, 'node_modules/react-native'))}, ${JSON.stringify(reactNativeVersion)})
hermes_type = hermes_source_type(${JSON.stringify(hermesVersion)}, ${JSON.stringify(path.join(root, 'node_modules/react-native'))})
File.write(${JSON.stringify(resultFile)}, JSON.generate({
  hermes: podspec_source(hermes_type, ${JSON.stringify(hermesVersion)}, ${JSON.stringify(path.join(root, 'node_modules/react-native'))})[:http],
  dependencies: ReactNativeDependenciesUtils.resolve_podspec_source()[:http],
  dependencies_build_from_source: ReactNativeDependenciesUtils.build_react_native_deps_from_source(),
  rncore_build_from_source: ReactNativeCoreUtils.build_rncore_from_source(),
  use_hermes: use_hermes(),
  use_third_party_jsc: use_third_party_jsc()
}))
Pod::Spec.new do |spec|
  spec.name = 'AllNewMTSLocalSelectorProbe'
  spec.version = '1.0.0'
  spec.summary = 'local selector probe'
  spec.homepage = 'https://invalid.example'
  spec.license = { :type => 'MIT' }
  spec.author = 'AllNewMTS'
  spec.source = { :path => '.' }
  spec.source_files = 'none'
end
`);
  run('/usr/bin/sandbox-exec', ['-p', '(version 1)\n(allow default)\n(deny network*)\n', commandPath('pod'), 'ipc', 'spec', probe], { env });
  const selected = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  assert.equal(selected.hermes, `file://${env.HERMES_ENGINE_TARBALL_PATH}`);
  assert.equal(selected.dependencies, `file://${env.RCT_USE_LOCAL_RN_DEP}`);
  assert.equal(selected.dependencies_build_from_source, false);
  assert.equal(selected.rncore_build_from_source, true);
  assert.equal(selected.use_hermes, true);
  assert.equal(selected.use_third_party_jsc, false);
}

function prepareLocalAppleDependencies(temp, env, cache) {
  delete env.REACT_NATIVE_OVERRIDE_HERMES_DIR;
  delete env.RCT_TESTONLY_RNCORE_TARBALL_PATH;
  delete env.RCT_DEPS_VERSION;
  delete env.RCT_TESTONLY_RNCORE_VERSION;
  delete env.USE_THIRD_PARTY_JSC;
  delete env.USE_HERMES;
  const [hermes, dependencies] = cachedAppleDependencies(cache);
  env.RCT_USE_RN_DEP = '0';
  env.RCT_USE_PREBUILT_RNCORE = '0';
  env.EXPO_USE_PRECOMPILED_MODULES = '0';
  env.RCT_HERMES_V1_ENABLED = '1';
  env.HERMES_ENGINE_TARBALL_PATH = localTarball(temp, 'hermes-ios', hermes.version, hermes.source);
  env.RCT_USE_LOCAL_RN_DEP = reactNativeDependenciesTarball(temp, dependencies.version, dependencies.source);
  assertLocalAppleSelectors(temp, env, hermes.version, dependencies.version);
  return [hermes, dependencies].map(({ name, version }) => ({ name, version, source: 'local-cache-tarball' }));
}

function toolchainProvenance() {
  const javaHome = process.env.JAVA_HOME || '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
  const java = path.join(javaHome, 'bin/java');
  const androidSdk = process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk');
  const ndk = path.join(androidSdk, 'ndk/27.1.12297006');
  assert.ok(fs.existsSync(java) && fs.existsSync(ndk), 'TOOLCHAIN_BLOCKED: cached JBR/Android NDK unavailable');
  const gradleRoot = path.join(os.homedir(), '.gradle/wrapper/dists/gradle-8.13-bin');
  const compiler = fs.readdirSync(gradleRoot, { recursive: true, withFileTypes: true })
    .find((entry) => entry.isFile() && /^kotlin-compiler-embeddable-[^/]+\.jar$/.test(entry.name));
  assert.ok(compiler, 'TOOLCHAIN_BLOCKED: cached Kotlin compiler unavailable');
  const platforms = fs.readdirSync(path.join(androidSdk, 'platforms')).filter((name) => /^android-[0-9]+$/.test(name)).sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)));
  assert.ok(platforms.length, 'TOOLCHAIN_BLOCKED: cached Android platform unavailable');
  const firstLine = (value) => value.trim().split(/\r?\n/)[0];
  const javaVersion = spawnSync(java, ['-version'], { encoding: 'utf8' });
  assert.equal(javaVersion.status, 0, 'TOOLCHAIN_BLOCKED: cached JBR is not executable');
  return {
    xcode: firstLine(run('xcodebuild', ['-version'])),
    swift: firstLine(run('swift', ['--version'])),
    cocoaPods: firstLine(run('pod', ['--version'])),
    kotlinCompiler: compiler.name.match(/kotlin-compiler-embeddable-(.+)\.jar/)?.[1],
    jbr: firstLine(javaVersion.stderr || javaVersion.stdout),
    androidSdk: platforms.at(-1),
    androidNdk: path.basename(ndk)
  };
}

async function preflight() {
  assert.equal(exists('ios'), false, 'TOOLCHAIN_BLOCKED: root ios/ must not exist before G004 smoke');
  assert.equal(exists('android'), false, 'TOOLCHAIN_BLOCKED: root android/ must not exist before G004 smoke');
  for (const file of ['node_modules/.bin/expo', 'node_modules/react-native/package.json', 'app.json']) {
    assert.ok(exists(file), `TOOLCHAIN_BLOCKED: missing ${file}`);
  }
  for (const tool of ['xcrun', 'swift', 'pod', 'lsof', 'sandbox-exec']) commandPath(tool);
  const podCaches = assertPodCaches();
  const before = preflightSnapshot(podCaches);
  metroEvidenceRegression();
  let reservation;
  let evidence;
  try {
    const simulator = availableSimulator();
    reservation = await reservePort();
    evidence = {
      status: 'PASS',
      mode: 'preflight',
      simulator: simulator.name,
      rootNativeDirectoriesAbsent: true,
      offlineCachesPresent: true,
      offlineAppleDependencies: podCaches.map(({ name, version }) => ({ name, version })),
      toolchain: toolchainProvenance(),
      localPortReservable: true
    };
  } finally {
    if (reservation) await reservation.release();
    assert.deepEqual(preflightSnapshot(podCaches), before, 'TOOLCHAIN_BLOCKED: G004 preflight mutated repository, temp, or exact cache state');
  }
  return { ...evidence, mutatedFiles: false };
}

function seedPodCache(cache, dependency, key) {
  const specRoot = path.join(cache, 'Specs/External', dependency.name);
  const source = path.join(cache, 'External', dependency.name, key);
  for (const requiredPath of dependency.requiredPaths) {
    const file = path.join(source, requiredPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'synthetic cache content\n');
  }
  fs.mkdirSync(specRoot, { recursive: true });
  fs.writeFileSync(path.join(specRoot, `${key}.podspec.json`), JSON.stringify({ name: dependency.name, version: dependency.version }));
  return source;
}

function podCacheRegression() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'allnewmts-g004-pod-cache-regression-'));
  const cache = path.join(temp, 'cache');
  let result;
  try {
    const requirements = appleDependencyRequirements();
    const sources = requirements.map((dependency, index) => seedPodCache(cache, dependency, `exact-${index}`));
    const artifacts = path.join(temp, 'artifacts');
    fs.mkdirSync(artifacts);
    const env = {
      ...process.env,
      REACT_NATIVE_OVERRIDE_HERMES_DIR: '/hostile/hermes',
      RCT_TESTONLY_RNCORE_TARBALL_PATH: '/hostile/rncore',
      RCT_DEPS_VERSION: 'nightly',
      RCT_TESTONLY_RNCORE_VERSION: 'nightly',
      USE_THIRD_PARTY_JSC: '1',
      USE_HERMES: '0'
    };
    const prepared = prepareLocalAppleDependencies(artifacts, env, cache);
    assert.deepEqual(prepared.map(({ name, version }) => ({ name, version })), requirements.map(({ name, version }) => ({ name, version })));
    assert.ok(fs.existsSync(env.HERMES_ENGINE_TARBALL_PATH) && fs.existsSync(env.RCT_USE_LOCAL_RN_DEP), 'local Pod artifacts were not prepared');
    assert.equal(env.RCT_USE_RN_DEP, '0', 'remote React Native dependency artifact probing was not disabled before local Pod preparation');
    assert.equal(env.RCT_USE_PREBUILT_RNCORE, '0', 'remote React Native core artifact probing was not disabled before local Pod preparation');
    assert.equal(env.EXPO_USE_PRECOMPILED_MODULES, '0', 'Expo external binary downloads were not disabled before local Pod preparation');
    assert.equal(env.RCT_HERMES_V1_ENABLED, '1', 'Hermes V1 selection does not match the exact cached version');
    for (const variable of ['REACT_NATIVE_OVERRIDE_HERMES_DIR', 'RCT_TESTONLY_RNCORE_TARBALL_PATH', 'RCT_DEPS_VERSION', 'RCT_TESTONLY_RNCORE_VERSION', 'USE_THIRD_PARTY_JSC', 'USE_HERMES']) {
      assert.equal(variable in env, false, `inherited ${variable} override survived local Pod preparation`);
    }
    assert.match(run('tar', ['-tzf', env.HERMES_ENGINE_TARBALL_PATH]), /hermesvm\.xcframework/);
    assert.match(run('tar', ['-tzf', env.RCT_USE_LOCAL_RN_DEP]), /ReactNativeDependencies\.xcframework/);

    const hostileSpec = path.join(cache, 'Specs/External', requirements[0].name, 'exact-0.podspec.json');
    const exactSpec = fs.readFileSync(hostileSpec);
    fs.writeFileSync(hostileSpec, JSON.stringify({ name: requirements[0].name, version: '0.0.0-hostile' }));
    assert.throws(() => cachedPodSource(requirements[0].name, requirements[0].version, requirements[0].requiredPaths, cache), /expected one local/);
    fs.writeFileSync(hostileSpec, exactSpec);
    fs.truncateSync(path.join(sources[1], requirements[1].requiredPaths[0]), 0);
    assert.throws(() => cachedPodSource(requirements[1].name, requirements[1].version, requirements[1].requiredPaths, cache), /is incomplete/);
    result = {
      status: 'PASS',
      mode: 'pod-cache-regression',
      exactVersionsMatched: true,
      hostileVersionRejected: true,
      hostileMissingContentRejected: true,
      localArtifactsPrepared: true,
      remoteArtifactProbesDisabled: true,
      ambientSelectorOverridesRemoved: true,
      selectorBranchesProven: true
    };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  assert.equal(fs.existsSync(temp), false, 'Pod cache regression cleanup failed');
  return { ...result, cleaned: true };
}

function sandboxProfiles(temp, port) {
  const deny = path.join(temp, 'deny-external.sb');
  const metro = path.join(temp, 'metro-owned-port.sb');
  fs.writeFileSync(deny, '(version 1)\n(allow default)\n(deny network*)\n');
  fs.writeFileSync(metro, `(version 1)\n(allow default)\n(deny network*)\n(allow network-bind (local tcp "localhost:${port}"))\n(allow network-inbound (local tcp "localhost:${port}"))\n(allow network-outbound (remote tcp "localhost:${port}"))\n`);
  return { deny, metro };
}

function activeNonLoopbackIPv4() {
  return [...new Set(Object.values(os.networkInterfaces()).flat()
    .filter((address) => address && (address.family === 'IPv4' || address.family === 4) && !address.internal)
    .map(({ address }) => address))];
}

function metroEnvironment(port) {
  return {
    ...process.env,
    CI: '1',
    COCOAPODS_DISABLE_STATS: 'true',
    EXPO_OFFLINE: '1',
    EXPO_PUBLIC_ALLNEWMTS_G004_OBSERVE: '1',
    npm_config_offline: 'true',
    REACT_NATIVE_PACKAGER_HOSTNAME: '127.0.0.1',
    RCT_METRO_PORT: String(port)
  };
}

const tcpBindProbe = `
const net = require('node:net');
const [host, rawPort, waitForConnection] = process.argv.slice(1);
const server = net.createServer((socket) => {
  socket.once('error', (error) => {
    process.stderr.write(String(error.stack || error));
    server.close(() => process.exit(2));
  });
  socket.end('ok');
  server.close(() => process.exit(0));
});
server.on('error', (error) => process.exit(['EPERM', 'EACCES'].includes(error.code) ? 1 : 2));
server.listen(Number(rawPort), host, () => {
  process.stdout.write('READY\\n');
  if (waitForConnection !== '1') server.close(() => process.exit(0));
});
setTimeout(() => process.exit(3), 4500);
`;

const tcpConnectProbe = `
const net = require('node:net');
const [host, rawPort] = process.argv.slice(1);
const socket = net.connect({ host, port: Number(rawPort) });
socket.once('connect', () => { socket.destroy(); process.exit(0); });
socket.once('error', (error) => process.exit(['EPERM', 'EACCES'].includes(error.code) ? 1 : 2));
setTimeout(() => process.exit(3), 4500);
`;

const udpBindProbe = `
const dgram = require('node:dgram');
const [host, rawPort] = process.argv.slice(1);
const socket = dgram.createSocket('udp4');
socket.once('error', (error) => process.exit(['EPERM', 'EACCES'].includes(error.code) ? 1 : 2));
socket.bind(Number(rawPort), host, () => { socket.close(); process.exit(0); });
setTimeout(() => process.exit(3), 4500);
`;

function connectTcp(host, port, timeout = 1000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let finished = false;
    const finish = (connected) => {
      if (finished) return;
      finished = true;
      if (!socket.destroyed) socket.destroy();
      resolve(connected);
    };
    socket.setTimeout(timeout, () => finish(false));
    socket.once('connect', () => {
      socket.resume();
      socket.end();
    });
    socket.once('close', (hadError) => finish(!hadError));
    socket.once('error', () => finish(false));
  });
}

async function stopProbe(child, closed) {
  if (processIsLive(child)) child.kill('SIGTERM');
  if (processIsLive(child)) await Promise.race([closed, delay(500)]);
  if (processIsLive(child)) child.kill('SIGKILL');
  if (processIsLive(child)) await Promise.race([closed, delay(500)]);
  assert.equal(processIsLive(child), false, 'truth probe did not terminate');
  await closed;
}

async function runTruthProbe(label, profile, script, args, env, activeProbes, { expectedCode, connectHost } = {}) {
  const child = spawn('/usr/bin/sandbox-exec', ['-f', profile, process.execPath, '-e', script, ...args.map(String)], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  activeProbes.add(child);
  let stdout = '';
  let stderr = '';
  let readyResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    if (stdout.includes('READY\n')) readyResolve({ ready: true });
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const closed = new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ timedOut: true }), truthProbeTimeoutMs); });
  try {
    if (connectHost) {
      const first = await Promise.race([ready, closed, timeout]);
      assert.equal(first.ready, true, `${label} did not expose its listener: ${stderr.slice(-1000)}`);
      assert.equal(await connectTcp(connectHost, Number(args[1])), true, `${label} parent connection failed`);
    }
    const outcome = await Promise.race([closed, timeout]);
    assert.equal(outcome.timedOut, undefined, `${label} exceeded ${truthProbeTimeoutMs}ms`);
    assert.equal(outcome.error, undefined, `${label} could not start: ${outcome.error?.message}`);
    assert.equal(outcome.code, expectedCode, `${label} returned ${outcome.code}: ${stderr.slice(-1000)}`);
  } finally {
    clearTimeout(timer);
    try {
      await stopProbe(child, closed);
    } finally {
      child.stdout.destroy();
      child.stderr.destroy();
      if (!processIsLive(child)) activeProbes.delete(child);
    }
  }
}

async function assertSandboxProfiles(profiles, port, env, activeProbes) {
  const wrongPort = port === 65535 ? port - 1 : port + 1;
  const addresses = activeNonLoopbackIPv4();
  await runTruthProbe('external TCP', profiles.metro, tcpConnectProbe, ['192.0.2.1', port], env, activeProbes, { expectedCode: 1 });
  await runTruthProbe('UDP', profiles.metro, udpBindProbe, ['127.0.0.1', port], env, activeProbes, { expectedCode: 1 });
  await runTruthProbe('wrong port', profiles.metro, tcpBindProbe, ['127.0.0.1', wrongPort, '0'], env, activeProbes, { expectedCode: 1 });
  await runTruthProbe('deny-all build-network', profiles.deny, tcpBindProbe, ['127.0.0.1', port, '0'], env, activeProbes, { expectedCode: 1 });
  await runTruthProbe('same-port loopback', profiles.metro, tcpBindProbe, ['127.0.0.1', port, '0'], env, activeProbes, { expectedCode: 0 });
  await runTruthProbe('same-port wildcard', profiles.metro, tcpBindProbe, ['0.0.0.0', port, '0'], env, activeProbes, { expectedCode: 0 });
  for (const address of addresses) {
    await runTruthProbe('same-port active interface', profiles.metro, tcpBindProbe, [address, port, '1'], env, activeProbes, { expectedCode: 0, connectHost: address });
  }
  return { activeInterfaceCount: addresses.length, activeInterfaces: addresses };
}

async function verifyPortReservationRelease() {
  const guard = await reservePort();
  const client = net.connect({ host: '127.0.0.1', port: guard.port });
  client.on('error', () => {});
  let rebound;
  let result;
  let primaryError;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('adversarial guard client did not connect')), 500);
      const onError = (error) => {
        clearTimeout(timer);
        reject(error);
      };
      client.once('error', onError);
      client.once('connect', () => {
        client.off('error', onError);
        client.write('GET /held HTTP/1.1\r\nHost: localhost\r\n\r\n', (error) => {
          clearTimeout(timer);
          if (error) reject(error);
          else resolve();
        });
      });
    });
    const started = Date.now();
    await Promise.race([
      guard.release(),
      delay(500).then(() => { throw new Error('adversarial client pinned port guard release'); })
    ]);
    const releaseMs = Date.now() - started;
    rebound = await reservePort(guard.port);
    await rebound.release();
    result = { port: guard.port, releaseMs, exactPortReusable: true };
  } catch (error) {
    primaryError = error;
  }
  const cleanupErrors = [];
  const attempt = async (work) => { try { await work(); } catch (error) { cleanupErrors.push(error); } };
  await attempt(async () => client.destroy());
  await attempt(() => guard.release());
  await attempt(async () => { if (rebound) await rebound.release(); });
  if (primaryError) {
    primaryError.cleanupErrors = cleanupErrors;
    throw primaryError;
  }
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'port reservation regression cleanup failed');
  return result;
}

async function networkRegression() {
  const reservation = await verifyPortReservationRelease();
  const activeProbes = new Set();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'allnewmts-g004-network-regression-'));
  let selected;
  let result;
  let primaryError;
  try {
    selected = await selectGuardedPort(temp, activeProbes);
    await selected.portGuard.release();
    assert.equal(activeProbes.size, 0, 'network regression left active truth probes');
    await assertPortReusable(selected.port);
    result = {
      status: 'PASS',
      mode: 'network-regression',
      reservation,
      truth: selected.truth,
      probesReaped: true,
      exactTruthPortReusable: true,
      selectionAttempts: selected.selectionAttempts
    };
  } catch (error) {
    primaryError = error;
  }
  const cleanupErrors = [];
  const attempt = async (work) => { try { await work(); } catch (error) { cleanupErrors.push(error); } };
  await attempt(async () => { if (selected) await selected.portGuard.release(); });
  for (const probe of [...activeProbes]) {
    await attempt(async () => {
      const closed = processIsLive(probe) ? new Promise((resolve) => probe.once('close', resolve)) : Promise.resolve();
      try { await stopProbe(probe, closed); } finally {
        probe.stdout?.destroy();
        probe.stderr?.destroy();
        if (!processIsLive(probe)) activeProbes.delete(probe);
      }
    });
  }
  await attempt(async () => { if (selected) await assertPortReusable(selected.port); });
  await attempt(async () => assert.equal(activeProbes.size, 0, 'network regression cleanup left active truth probes'));
  await attempt(async () => fs.rmSync(temp, { recursive: true, force: true }));
  if (primaryError) {
    primaryError.cleanupErrors = cleanupErrors;
    throw primaryError;
  }
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'network regression cleanup failed');
  return result;
}

async function selectGuardedPort(temp, activeProbes) {
  for (let attempt = 1; attempt <= maximumSelectionAttempts; attempt += 1) {
    const selector = await reservePort();
    const port = selector.port; // runner-selected; numeric identity only.
    const env = metroEnvironment(port);
    const profiles = sandboxProfiles(temp, port);
    await selector.release(); // Bounded unowned truth-probe handoff.
    const truth = await assertSandboxProfiles(profiles, port, env, activeProbes);
    try {
      const portGuard = await reservePort(port); // runner-guarded; loopback only.
      return { port, portGuard, env, profiles, truth, selectionAttempts: attempt };
    } catch (error) {
      if (error.code !== 'EADDRINUSE' || attempt === maximumSelectionAttempts) throw error;
    }
  }
  throw new Error('failed to reacquire the selected Metro port');
}

const asciiWhitespace = /[ \t\v\f\r\n]/;
const generatedMetroToken = 'RCT_METRO_PORT=${RCT_METRO_PORT}';
const asciiTrim = (value) => value.replace(/^[ \t\v\f\r\n]+|[ \t\v\f\r\n]+$/g, '');
const asciiTokens = (value) => {
  const trimmed = asciiTrim(value);
  return trimmed === '' ? [] : trimmed.split(/[ \t\v\f\r\n]+/);
};

function settingRecords(source, key, file = '<memory>') {
  return source.split(/\r\n|\n|\r/).flatMap((line, index) => {
    const delimiter = line.indexOf('=');
    if (delimiter < 0 || asciiTrim(line.slice(0, delimiter)) !== key) return [];
    return [{ file, line: index + 1, rhs: line.slice(delimiter + 1) }];
  });
}

function assertGeneratedMetroRecords(files) {
  const records = files.flatMap(({ file, source }) => settingRecords(source, 'GCC_PREPROCESSOR_DEFINITIONS', file));
  assert.ok(records.length > 0, 'generated React-Core xcconfig omits exact GCC_PREPROCESSOR_DEFINITIONS records');
  for (const record of records) {
    const candidates = asciiTokens(record.rhs).filter((token) => token.includes('RCT_METRO_PORT'));
    assert.equal(candidates.length, 1, `generated Metro definition count mismatch in ${record.file}:${record.line}`);
    assert.equal(candidates[0], generatedMetroToken, `generated Metro token mismatch in ${record.file}:${record.line}`);
  }
  return { files: new Set(records.map(({ file }) => file)).size, occurrences: records.length };
}

function assertSelectedPort(port, value, label) {
  const expected = String(port);
  assert.match(value, /^[1-9][0-9]*$/, `${label} must be one decimal port`);
  assert.equal(value, expected, `${label} must equal runner-selected ${expected}`);
}

const appCommandLineSection = 'Build settings from command line:';
const appResolvedSection = 'Build settings for action build and target AllNewMTS:';

function appMetroSettingRecords(source) {
  let section = null;
  const headings = { commandLine: 0, resolved: 0 };
  const records = [];
  for (const [index, raw] of source.split(/\r\n|\n|\r/).entries()) {
    if (raw !== '' && !asciiWhitespace.test(raw[0])) {
      section = raw === appCommandLineSection ? appCommandLineSection : raw === appResolvedSection ? appResolvedSection : null;
      if (section === appCommandLineSection) headings.commandLine += 1;
      if (section === appResolvedSection) headings.resolved += 1;
    }
    const delimiter = raw.indexOf('=');
    if (delimiter >= 0 && asciiTrim(raw.slice(0, delimiter)) === 'RCT_METRO_PORT') {
      records.push({ section, line: index + 1, raw, rhs: raw.slice(delimiter + 1) });
    }
  }
  return { headings, records };
}

function assertMetroSettings(port, appSettings, podSettings) {
  const app = appMetroSettingRecords(appSettings);
  try {
    assert.equal(app.headings.commandLine, 1, 'App settings must contain exactly one command-line settings heading');
    assert.equal(app.headings.resolved, 1, 'App settings must contain exactly one resolved target heading');
    assert.equal(app.records.filter(({ section }) => section === null).length, 0, 'App settings contain an unclassified RCT_METRO_PORT record');
    const commandLine = app.records.filter(({ section }) => section === appCommandLineSection);
    const resolved = app.records.filter(({ section }) => section === appResolvedSection);
    assert.equal(commandLine.length, 1, 'App command-line settings must contain exactly one RCT_METRO_PORT record');
    assert.equal(resolved.length, 1, 'App resolved target settings must contain exactly one RCT_METRO_PORT record');
    assertSelectedPort(port, asciiTrim(commandLine[0].rhs), 'App command-line RCT_METRO_PORT');
    assertSelectedPort(port, asciiTrim(resolved[0].rhs), 'App resolved RCT_METRO_PORT');

    const podCandidates = settingRecords(podSettings, 'GCC_PREPROCESSOR_DEFINITIONS')
      .flatMap(({ rhs }) => asciiTokens(rhs))
      .filter((token) => token.includes('RCT_METRO_PORT'));
    assert.equal(podCandidates.length, 1, 'React-Core resolved settings must contain exactly one RCT_METRO_PORT token overall');
    const prefix = 'RCT_METRO_PORT=';
    assert.ok(podCandidates[0].startsWith(prefix), 'React-Core resolved Metro token must use exact key');
    assertSelectedPort(port, podCandidates[0].slice(prefix.length), 'React-Core RCT_METRO_PORT');
  } catch (error) {
    error.appMetroSettings = app.records;
    throw error;
  }
  return app.records;
}

function assertBuildArgv(port, args) {
  const assignments = args.filter((argument) => argument.startsWith('RCT_METRO_PORT='));
  assert.equal(assignments.length, 1, 'compiled-build argv must contain exactly one RCT_METRO_PORT assignment');
  assertSelectedPort(port, assignments[0].slice('RCT_METRO_PORT='.length), 'compiled-build RCT_METRO_PORT');
}

function assertExpoArgv(port, args) {
  const flags = args.flatMap((argument, index) => argument === '--port' ? [index] : []);
  assert.equal(flags.length, 1, 'Expo argv must contain exactly one --port flag');
  assertSelectedPort(port, args[flags[0] + 1] ?? '', 'Expo --port');
}

function buildFailureEvidenceRegression() {
  const secretA = 'alpha123';
  const secretB = 'bravo456';
  assert.equal(Buffer.byteLength(secretA), Buffer.byteLength(secretB));
  const sensitive = (secret) => [
    `TOKEN=${secret}`,
    `prefix TOKEN : ${secret}`,
    `api.key\t=\t"${secret}"`,
    'TOKEN=',
    `Authorization: Basic ${secret}`,
    `Authorization = Bearer ${secret}`,
    `Cookie: sid=${secret}`,
    `Set-Cookie: sid=${secret}; Secure`,
    `https://${secret}@example.test/path`,
    `https://example.test/path?q=${secret}`,
    `https://example.test/path#${secret}`
  ];
  const stdout = (secret) => {
    const lines = [`${'🙂'.repeat(8200)}`, ...sensitive(secret), 'ATTEMPT7_CAUSAL_ERROR: error: preserved before warning flood'];
    for (let index = 0; index < 220; index += 1) {
      lines.push(`cause-${index}: error: ${'가'.repeat(96)}`, ...Array.from({ length: 8 }, (_, context) => `context-${index}-${context}-${'x'.repeat(96)}`));
    }
    lines.push('warning: context only', '** BUILD FAILED **');
    return `${lines.join('\n')}\n`;
  };
  const stderr = (secret) => {
    const lines = [`${'🙂'.repeat(8200)}`, ...sensitive(secret)];
    for (let index = 0; index < 220; index += 1) {
      lines.push(`stderr-${index}: error: ${'가'.repeat(96)}`, ...Array.from({ length: 8 }, (_, context) => `stderr-context-${index}-${context}-${'y'.repeat(96)}`));
    }
    lines.push('The following build commands failed:', 'Command CompileSwift failed with a nonzero exit code', 'final error: compiler stopped');
    return `${lines.join('\r\n')}\r\n`;
  };
  const result = (secret) => ({ signal: null, status: 65, stderr: Buffer.from(stderr(secret)), stdout: Buffer.from(stdout(secret)) });
  const first = compiledBuildError(result(secretA));
  const second = compiledBuildError(result(secretB));
  assert.deepEqual(first.buildFailureEvidence, second.buildFailureEvidence);
  assert.equal(first.buildFailureEvidenceSha256, second.buildFailureEvidenceSha256);
  assert.equal(Object.isFrozen(first.buildFailureEvidence), true);
  assert.ok(canonicalBytes(first.buildFailureEvidence).length <= buildFailureEvidenceBytes);
  assert.equal(first.xcodeStatus, 65);
  assert.equal(first.xcodeSignal, null);

  const published = stableJson(first.buildFailureEvidence);
  assert.doesNotMatch(published, /originalSha|originalDigest/i);
  const originalDigest = sha256(result(secretA).stdout);
  assert.equal(published.includes(originalDigest), false);
  const decoded = [];
  const collectBase64 = (value) => {
    if (Array.isArray(value)) return value.forEach(collectBase64);
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key.endsWith('Base64')) decoded.push(Buffer.from(child, 'base64').toString('utf8'));
      else collectBase64(child);
    }
  };
  collectBase64(first.buildFailureEvidence);
  const retained = decoded.join('\n');
  assert.match(retained, /ATTEMPT7_CAUSAL_ERROR: error:/);
  for (const secret of [secretA, secretB]) assert.equal(retained.includes(secret), false);
  const streams = first.buildFailureEvidence.streams;
  for (const stream of [streams.stdout, streams.stderr]) {
    assert.ok(stream.windows.headByteCount <= buildFailureWindowBytes);
    assert.ok(stream.windows.tailByteCount <= buildFailureWindowBytes);
    assert.ok(stream.windows.headByteCount + stream.windows.tailByteCount <= stream.sanitizedByteCount);
    assert.ok(canonicalBytes(stream.causal.earliest).length <= buildFailureCausalPartitionBytes);
    assert.ok(canonicalBytes(stream.causal.latest).length <= buildFailureCausalPartitionBytes);
    for (const counts of [stream.causal.counts.causalMatches, stream.causal.counts.contextLines]) {
      assert.equal(counts.retained + counts.omitted, counts.total);
    }
  }
  assert.equal(streams.stdout.causal.counts.causalMatches.total, 222);
  assert.equal(streams.stderr.causal.counts.causalMatches.total, 223);
  const classes = new Set(['stdout', 'stderr'].flatMap((stream) => [
    ...streams[stream].causal.earliest,
    ...streams[stream].causal.latest
  ]).flatMap(({ matches }) => matches.map(({ class: classification }) => classification)));
  assert.deepEqual([...classes].sort(), ['BUILD_FAILED', 'COMMAND_FAILED', 'DIAGNOSTIC_ERROR', 'FAILED_COMMAND_LIST']);
  const reduced = formatBuildFailureEvidence(result(secretA), null, 180000).evidence;
  const repeated = formatBuildFailureEvidence(result(secretA), null, 180000).evidence;
  assert.deepEqual(reduced, repeated);
  assert.ok(canonicalBytes(reduced).length <= 180000);
  assert.equal(reduced.streams.stdout.causal.counts.truncated, true);
  assert.equal(reduced.streams.stderr.causal.counts.truncated, true);

  assert.equal(sanitizeBuildLine(`TOKEN=${secretA}`), `TOKEN=${namedValueMarker}`);
  assert.equal(sanitizeBuildLine(`TOKEN : ${secretA}`), `TOKEN : ${namedValueMarker}`);
  assert.equal(sanitizeBuildLine(`api.key\t=\t"${secretA}"`), `api.key\t=\t${namedValueMarker}`);
  assert.equal(sanitizeBuildLine('TOKEN='), `TOKEN=${namedValueMarker}`);
  for (const nearMiss of [`/TOKEN=${secretA}`, `XTOKEN=${secretA}`, `TOKEN ${secretA}`, `TOKEN\u00a0=${secretA}`]) {
    assert.equal(sanitizeBuildLine(nearMiss), nearMiss);
  }

  const envelope = buildFailureEnvelope(first, 0);
  assert.equal(envelope.buildFailureEvidence, first.buildFailureEvidence);
  assert.equal(envelope.buildFailureEvidenceSha256, first.buildFailureEvidenceSha256);
  const marker = `${buildFailurePrefix}${stableJson(envelope)}`;
  assert.equal(marker.split(buildFailurePrefix).length - 1, 1);
  assert.deepEqual(JSON.parse(marker.slice(buildFailurePrefix.length)).buildFailureEvidence, first.buildFailureEvidence);

  const fallback = compiledBuildError(result(secretA), 'sanitize');
  assert.deepEqual(fallback.buildFailureEvidence, {
    code: 'BUILD_FAILURE_EVIDENCE_FORMAT_ERROR',
    command: 'xcodebuild',
    originalByteCounts: { stderr: result(secretA).stderr.length, stdout: result(secretA).stdout.length },
    schema: buildFailureSchema,
    signal: null,
    status: 65
  });
  assert.equal(fallback.xcodeStatus, 65);
  const emitted = [];
  assert.equal(emitBuildFailureEnvelope(fallback, [new Error('cleanup')], (line) => emitted.push(line)), fallback);
  assert.equal(emitted.length, 1);
  assert.equal(JSON.parse(emitted[0].slice(buildFailurePrefix.length)).cleanupErrorCount, 1);
  assert.doesNotMatch(stableJson(fallback.buildFailureEvidence), /alpha123|sha256|stdoutBase64|stderrBase64/i);
  return {
    canonicalWithinCap: canonicalBytes(first.buildFailureEvidence).length <= buildFailureEvidenceBytes,
    causalClasses: [...classes].sort(),
    evidenceIdentityPreserved: true,
    formatterFallbackSafe: true,
    originalDigestsOmitted: true,
    sensitiveValuesRedacted: true,
    wholeStreamSanitizedBeforeSelection: true
  };
}

function metroEvidenceRegression() {
  const port = 43210;
  const exact = 'GCC_PREPROCESSOR_DEFINITIONS = $(inherited) RCT_METRO_PORT=${RCT_METRO_PORT}';
  const podspec = fs.readFileSync(path.join(root, 'node_modules/react-native/React-Core.podspec'), 'utf8');
  assert.deepEqual([...podspec.matchAll(/"GCC_PREPROCESSOR_DEFINITIONS"\s*=>\s*"([^"]*)"/g)].map((match) => match[1]), ['RCT_METRO_PORT=${RCT_METRO_PORT}']);
  assert.equal(asciiWhitespace.test('\u00a0'), false, 'tokenization must remain ASCII-only');
  assert.equal(assertGeneratedMetroRecords([
    { file: 'React-Core.debug.xcconfig', source: exact },
    { file: 'React-Core.release.xcconfig', source: exact }
  ]).occurrences, 2);

  const malformedGenerated = [
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT="${RCT_METRO_PORT}"',
    'OTHER = RCT_METRO_PORT="${RCT_METRO_PORT}"',
    'GCC_PREPROCESSOR_DEFINITIONS = $(inherited)',
    `GCC_PREPROCESSOR_DEFINITIONS = ${generatedMetroToken} ${generatedMetroToken}`,
    'GCC_PREPROCESSOR_DEFINITIONS = "RCT_METRO_PORT=${RCT_METRO_PORT}"',
    "GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT='${RCT_METRO_PORT}'",
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT="${RCT_METRO_PORT}',
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=${RCT_METRO_PORT}"',
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=""${RCT_METRO_PORT}""',
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=\\"${RCT_METRO_PORT}\\"',
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=" ${RCT_METRO_PORT}"',
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT="${RCT_METRO_PORT}"\u00a0OTHER',
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT="${OTHER}"',
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=""',
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT="${RCT_METRO_PORT:-8081}"',
    'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=8081',
    `GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=${port}`,
    `GCC_PREPROCESSOR_DEFINITIONS = ${generatedMetroToken} RCT_METRO_PORT=${port}`,
    `GCC_PREPROCESSOR_DEFINITIONS[sdk=iphonesimulator*] = ${generatedMetroToken}`,
    `// GCC_PREPROCESSOR_DEFINITIONS = ${generatedMetroToken}`
  ];
  for (const source of malformedGenerated) {
    assert.throws(() => assertGeneratedMetroRecords([{ file: 'React-Core.debug.xcconfig', source }]));
  }

  const app = `Build settings from command line:\n    RCT_METRO_PORT = ${port}\nBuild settings for action build and target AllNewMTS:\n    SDK_VERSION = 18.4\n    RCT_METRO_PORT = ${port}\n    UNRELATED = 8081`;
  const pods = `GCC_PREPROCESSOR_DEFINITIONS = SDK_VERSION=18.4 RCT_METRO_PORT=${port} OTHER=8081`;
  const appEvidence = assertMetroSettings(port, app, pods);
  assert.deepEqual(appEvidence, [
    { section: 'Build settings from command line:', line: 2, raw: `    RCT_METRO_PORT = ${port}`, rhs: ` ${port}` },
    { section: 'Build settings for action build and target AllNewMTS:', line: 5, raw: `    RCT_METRO_PORT = ${port}`, rhs: ` ${port}` }
  ]);
  const badApps = [
    '',
    `Build settings from command line:\n    RCT_METRO_PORT = ${port}`,
    `Build settings for action build and target AllNewMTS:\n    RCT_METRO_PORT = ${port}`,
    `Build settings from command line:\nBuild settings from command line:\n    RCT_METRO_PORT = ${port}\nBuild settings for action build and target AllNewMTS:\n    RCT_METRO_PORT = ${port}`,
    `${app}\n    RCT_METRO_PORT = ${port}`,
    `Build settings from command line:\n    RCT_METRO_PORT = ${port}\nBuild settings for action build and target AllNewMTS:\n    RCT_METRO_PORT = ${port}\nOther heading:\n    RCT_METRO_PORT = ${port}`,
    `Build settings from command line:\n    RCT_METRO_PORT = ${port}\nBuild settings for action clean and target AllNewMTS:\n    RCT_METRO_PORT = ${port}`,
    `RCT_METRO_PORT = ${port}\n${app}`,
    app.replace(`RCT_METRO_PORT = ${port}`, 'RCT_METRO_PORT = '),
    app.replace(`RCT_METRO_PORT = ${port}`, 'RCT_METRO_PORT = port'),
    app.replace(`RCT_METRO_PORT = ${port}`, 'RCT_METRO_PORT = 43211'),
    app.replace(`RCT_METRO_PORT = ${port}`, 'RCT_METRO_PORT = 8081')
  ];
  for (const bad of badApps) {
    assert.throws(() => assertMetroSettings(port, bad, pods));
  }
  let preservedFailure;
  try {
    assertMetroSettings(port, badApps.at(-1), pods);
  } catch (error) {
    preservedFailure = error;
  }
  assert.deepEqual(preservedFailure?.appMetroSettings, [
    { section: 'Build settings from command line:', line: 2, raw: '    RCT_METRO_PORT = 8081', rhs: ' 8081' },
    { section: 'Build settings for action build and target AllNewMTS:', line: 5, raw: `    RCT_METRO_PORT = ${port}`, rhs: ` ${port}` }
  ]);
  for (const bad of ['GCC_PREPROCESSOR_DEFINITIONS = OTHER=18.4', 'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=', 'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=43211', 'GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=8081', `GCC_PREPROCESSOR_DEFINITIONS = RCT_METRO_PORT=${port} RCT_METRO_PORT=${port}`]) {
    assert.throws(() => assertMetroSettings(port, app, bad));
  }

  assert.doesNotThrow(() => assertBuildArgv(port, ['SDK_VERSION=18.4', `RCT_METRO_PORT=${port}`, 'OTHER=8081']));
  for (const args of [[], ['RCT_METRO_PORT='], ['RCT_METRO_PORT=43211'], ['RCT_METRO_PORT=8081'], [`RCT_METRO_PORT=${port}`, `RCT_METRO_PORT=${port}`]]) {
    assert.throws(() => assertBuildArgv(port, args));
  }
  assert.doesNotThrow(() => assertExpoArgv(port, ['start', '--sdk-version', '18.4', '--port', String(port), '8081']));
  for (const args of [[], ['--port'], ['--port', '43211'], ['--port', '8081'], ['--port', String(port), '--port', String(port)], [`--port=${port}`]]) {
    assert.throws(() => assertExpoArgv(port, args));
  }
  const buildFailureEvidence = buildFailureEvidenceRegression();
  return {
    status: 'PASS',
    mode: 'metro-evidence-regression',
    generatedRecords: 2,
    exactUnquotedGeneratedAccepted: true,
    quotedGeneratedRejected: true,
    malformedGeneratedRecordsRejected: true,
    malformedNumericEvidenceRejected: true,
    appRawMatches: 2,
    appCommandLineMatches: 1,
    appResolvedMatches: 1,
    appEvidencePreservedOnSuccess: true,
    appEvidencePreservedOnFailure: true,
    buildFailureEvidence
  };
}

function generatedMetroSettings() {
  const directory = path.join(root, 'ios/Pods/Target Support Files/React-Core');
  const files = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.xcconfig'))
    .map((entry) => ({ file: path.relative(root, path.join(directory, entry.name)), source: fs.readFileSync(path.join(directory, entry.name), 'utf8') }));
  return assertGeneratedMetroRecords(files);
}

function processIsLive(child) {
  return child && child.exitCode === null && child.signalCode === null;
}

async function reapChild(child) {
  if (!processIsLive(child)) return;
  await Promise.race([
    new Promise((resolve) => child.once('close', resolve)),
    delay(3000)
  ]);
  assert.equal(processIsLive(child), false, 'owned Metro launcher was not reaped');
}

async function stopProcessGroup(child, pgid) {
  if (!pgid) return;
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    try { process.kill(-pgid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try { process.kill(-pgid, 0); } catch (error) { if (error.code === 'ESRCH') break; throw error; }
      await delay(100);
    }
    try { process.kill(-pgid, 0); } catch (error) {
      if (error.code === 'ESRCH') { await reapChild(child); return; }
      throw error;
    }
  }
  assert.fail('owned Metro process group did not terminate');
}

function selectedPortListeners(port) {
  const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { cwd: root, encoding: 'utf8' });
  assert.ok([0, 1].includes(result.status), `lsof failed for selected port ${port}`);
  return (result.stdout ?? '').split(/\r?\n/).slice(1).filter(Boolean).map((row) => {
    const pid = Number(row.trim().split(/\s+/)[1]);
    const endpoint = row.match(/\bTCP\s+(\S+)\s+\(LISTEN\)$/)?.[1];
    assert.ok(Number.isSafeInteger(pid) && pid > 0 && endpoint, `unparseable selected-port listener: ${row}`);
    return { pid, endpoint };
  });
}

function assertMetroOwned(port, child, metroPgid) {
  assert.equal(child?.spawnError, undefined, `Metro spawn failed: ${child?.spawnError?.message}`);
  assert.ok(processIsLive(child), 'Metro launcher is not alive');
  const launcher = spawnSync('ps', ['-o', 'pgid=', '-p', String(child.pid)], { encoding: 'utf8' });
  assert.equal(launcher.status, 0, `Metro launcher PID ${child.pid} is not alive`);
  assert.equal(Number(launcher.stdout.trim()), metroPgid, `Metro launcher left owned PGID ${metroPgid}`);
  const listeners = selectedPortListeners(port);
  assert.equal(listeners.length, 1, `selected port must have exactly one LISTEN row, found ${listeners.length}`);
  const [listener] = listeners;
  assert.equal(listener.endpoint, `127.0.0.1:${port}`, `Metro listener endpoint mismatch: ${listener.endpoint}`);
  const group = spawnSync('ps', ['-o', 'pgid=', '-p', String(listener.pid)], { encoding: 'utf8' });
  assert.equal(group.status, 0, `could not resolve listener PGID for ${listener.pid}`);
  assert.equal(Number(group.stdout.trim()), metroPgid, `listener PID ${listener.pid} is outside owned PGID ${metroPgid}`);
  return { listenerPid: listener.pid, endpoint: listener.endpoint };
}

async function assertMetroNetwork(port, child, metroPgid) {
  const ownership = assertMetroOwned(port, child, metroPgid); // Metro-owned is observed only here.
  assert.equal(await connectTcp('127.0.0.1', port), true, 'Metro loopback connection failed');
  const addresses = activeNonLoopbackIPv4();
  for (const address of addresses) {
    assert.equal(await connectTcp(address, port), false, `Metro accepted active nonloopback connection on ${address}:${port}`);
  }
  return { ...ownership, rejectedActiveInterfaces: addresses.length };
}

async function waitForMetro(port, child, metroPgid) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    assert.ok(processIsLive(child), 'Metro exited before readiness');
    const ready = await new Promise((resolve) => {
      const request = http.get({ hostname: '127.0.0.1', port, path: '/status', timeout: 500 }, (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve(body.includes('packager-status:running')));
      });
      request.on('error', () => resolve(false));
      request.on('timeout', () => { request.destroy(); resolve(false); });
    });
    if (ready) return assertMetroOwned(port, child, metroPgid);
    await delay(500);
  }
  throw new Error('Metro did not become ready on the owned endpoint');
}

async function assertPortReusable(port) {
  assert.equal(selectedPortListeners(port).length, 0, 'cleanup left a selected-port listener');
  const probe = await reservePort(port);
  await probe.release();
}

function closeFd(fd) {
  if (fd !== undefined) fs.closeSync(fd);
}

function parsedSockets(pid, port) {
  const result = spawnSync('lsof', ['-nP', '-a', '-p', String(pid), '-iTCP', '-iUDP'], { encoding: 'utf8' });
  assert.ok([0, 1].includes(result.status), `lsof failed for App PID ${pid}`);
  const rows = (result.stdout ?? '').split(/\r?\n/).slice(1).filter(Boolean);
  return rows.map((row) => {
    const protocol = row.match(/\b(TCP|UDP)\b/)?.[1];
    const endpoint = row.match(/(?:TCP|UDP)\s+([^ ]+)/)?.[1] ?? '';
    assert.equal(protocol, 'TCP', `disallowed App socket protocol: ${protocol ?? 'unknown'}`);
    assert.match(endpoint, new RegExp(`^[^>]*->127\\.0\\.0\\.1:${port}(?:\\s|$)`), `disallowed App socket endpoint: ${endpoint}`);
    return { protocol, endpoint: `127.0.0.1:${port}` };
  });
}

async function waitForMarker(stdoutFile, stderrFile, pid, port) {
  const deadline = Date.now() + 90000;
  const samples = [];
  while (Date.now() < deadline) {
    samples.push(...parsedSockets(pid, port));
    const lines = [stdoutFile, stderrFile]
      .filter(fs.existsSync)
      .flatMap((file) => fs.readFileSync(file, 'utf8').split(/\r?\n/))
      .filter((line) => line.includes(markerPrefix));
    assert.ok(lines.length <= 1, 'Development Build emitted duplicate readiness markers');
    if (lines.length === 1) {
      const payload = JSON.parse(lines[0].slice(lines[0].indexOf(markerPrefix) + markerPrefix.length));
      assert.deepEqual(payload, {
        status: 'PASS',
        sourceSha256: '4d63ba22ac5339cfd3068cffa91710e0099481da81d974e2aff0ce7ae39ed53e',
        formCount: 1,
        labelCount: 2,
        editCount: 1,
        buttonCount: 2,
        module: 'AllNewMTSRuntime',
        createCode: 'OK'
      });
      samples.push(...parsedSockets(pid, port));
      return { payload, samples: samples.length };
    }
    await delay(100);
  }
  throw new Error(`Development Build emitted no ${markerPrefix} marker`);
}

async function developmentBuild() {
  await preflight();
  const baseline = run('git', ['status', '--porcelain=v1', '-z']);
  const activeProbes = new Set();
  let temp;
  let simulator;
  let portGuard;
  let port;
  let env;
  let profiles;
  let offlineAppleDependencies;
  let appInstalled = false;
  let appPid;
  let metro;
  let metroPgid;
  let metroStdoutFd;
  let metroStderrFd;
  let appMetroSettings;
  let simulatorBootedByRunner = false;
  let result;
  let primaryError;
  try {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'allnewmts-g004-development-build-'));
    simulator = availableSimulator();
    const selected = await selectGuardedPort(temp, activeProbes);
    ({ port, portGuard, env, profiles } = selected);
    env.CP_CACHE_DIR = path.join(temp, 'cocoapods-cache');
    fs.mkdirSync(env.CP_CACHE_DIR);
    offlineAppleDependencies = prepareLocalAppleDependencies(temp, env);
    const sandbox = (args) => run('/usr/bin/sandbox-exec', ['-f', profiles.deny, ...args], { env });
    sandbox([path.join(root, 'node_modules/.bin/expo'), 'prebuild', '--no-install', '--platform', 'ios']);
    sandbox(['pod', 'install', '--no-repo-update', '--project-directory=ios']);
    const generatedSettings = generatedMetroSettings();
    const destination = `id=${simulator.udid}`;
    const appShow = sandbox(['xcodebuild', '-workspace', 'ios/AllNewMTS.xcworkspace', '-scheme', 'AllNewMTS', '-configuration', 'Debug', '-sdk', 'iphonesimulator', '-destination', destination, `RCT_METRO_PORT=${port}`, '-showBuildSettings']);
    const podShow = sandbox(['xcodebuild', '-project', 'ios/Pods/Pods.xcodeproj', '-target', 'React-Core', '-configuration', 'Debug', `RCT_METRO_PORT=${port}`, '-showBuildSettings']);
    appMetroSettings = assertMetroSettings(port, appShow, podShow);
    const buildArgs = ['xcodebuild', '-quiet', '-workspace', 'ios/AllNewMTS.xcworkspace', '-scheme', 'AllNewMTS', '-configuration', 'Debug', '-sdk', 'iphonesimulator', '-destination', destination, '-derivedDataPath', path.join(temp, 'ios-derived'), 'CODE_SIGNING_ALLOWED=NO', `RCT_METRO_PORT=${port}`, 'build'];
    assertBuildArgv(port, buildArgs);
    runCompiledBuild('/usr/bin/sandbox-exec', ['-f', profiles.deny, ...buildArgs], { env });
    if (simulator.state !== 'Booted') {
      run('xcrun', ['simctl', 'boot', simulator.udid], { env });
      simulatorBootedByRunner = true;
    }
    run('xcrun', ['simctl', 'bootstatus', simulator.udid, '-b'], { env });
    const metroFile = '/usr/bin/sandbox-exec';
    const metroArgs = ['-f', profiles.metro, path.join(root, 'node_modules/.bin/expo'), 'start', '--offline', '--localhost', '--port', String(port)];
    assertExpoArgv(port, metroArgs);
    metroStdoutFd = fs.openSync(path.join(temp, 'metro.stdout.log'), 'w');
    metroStderrFd = fs.openSync(path.join(temp, 'metro.stderr.log'), 'w');
    const metroOptions = {
      cwd: root,
      env,
      detached: true,
      stdio: ['ignore', metroStdoutFd, metroStderrFd]
    };
    await portGuard.release();
    metro = spawn(metroFile, metroArgs, metroOptions);
    metro.once('error', (error) => { metro.spawnError = error; });
    metroPgid = metro.pid;
    assert.ok(Number.isSafeInteger(metroPgid) && metroPgid > 0, 'Metro launcher has no owned PGID');
    const group = spawnSync('ps', ['-o', 'pgid=', '-p', String(metro.pid)], { encoding: 'utf8' });
    assert.equal(group.status, 0, 'could not record detached Metro PGID');
    assert.equal(Number(group.stdout.trim()), metroPgid, 'detached Metro launcher did not own its process group');
    await waitForMetro(port, metro, metroPgid);
    const readinessNetwork = await assertMetroNetwork(port, metro, metroPgid);
    const app = path.join(temp, 'ios-derived/Build/Products/Debug-iphonesimulator/AllNewMTS.app');
    assert.ok(fs.existsSync(app), 'built iOS app is missing');
    const existing = spawnSync('xcrun', ['simctl', 'get_app_container', simulator.udid, bundleId], { cwd: root, encoding: 'utf8', env });
    assert.notEqual(existing.status, 0, `refusing to replace pre-existing ${bundleId}`);
    run('xcrun', ['simctl', 'install', simulator.udid, app], { env });
    appInstalled = true;
    const stdoutFile = path.join(temp, 'ios-runtime.stdout.log');
    const stderrFile = path.join(temp, 'ios-runtime.stderr.log');
    const prelaunchNetwork = await assertMetroNetwork(port, metro, metroPgid);
    const launch = run('xcrun', ['simctl', 'launch', '--terminate-running-process', `--stdout=${stdoutFile}`, `--stderr=${stderrFile}`, simulator.udid, bundleId], { env });
    appPid = Number(launch.trim().match(/:\s*([0-9]+)$/)?.[1]);
    assert.ok(Number.isSafeInteger(appPid) && appPid > 0, `could not parse App PID: ${launch.trim()}`);
    const observed = await waitForMarker(stdoutFile, stderrFile, appPid, port);
    const finalNetwork = await assertMetroNetwork(port, metro, metroPgid);
    result = {
      status: 'PASS',
      port,
      simulator: simulator.name,
      marker: observed.payload,
      socketSamples: observed.samples,
      portLifecycle: ['runner-selected', 'runner-guarded', 'Metro-owned'],
      selectionAttempts: selected.selectionAttempts,
      sandboxTruth: selected.truth,
      metroChecks: { readinessNetwork, prelaunchNetwork, finalNetwork },
      networkEvidence: 'bounded unowned truth-probe and spawn handoffs; no uninterrupted exclusive ownership or SBPL interface-enforcement claim; PID-scoped samples make no continuous kernel-level denial claim',
      generatedMetroSettings: generatedSettings,
      appMetroSettings,
      offlineAppleDependencies,
      toolchain: toolchainProvenance(),
      developmentBuildInvocations: 1
    };
  } catch (error) {
    appMetroSettings = error.appMetroSettings ?? appMetroSettings;
    if (appMetroSettings) error.appMetroSettings = appMetroSettings;
    primaryError = error;
  }
  const cleanupErrors = [];
  const attempt = async (work) => { try { await work(); } catch (error) { cleanupErrors.push(error); } };
  await attempt(async () => { if (appPid && simulator) run('xcrun', ['simctl', 'terminate', simulator.udid, bundleId], { env }); });
  await attempt(async () => { if (appInstalled && simulator) run('xcrun', ['simctl', 'uninstall', simulator.udid, bundleId], { env }); });
  await attempt(async () => { if (portGuard) await portGuard.release(); });
  for (const probe of [...activeProbes]) {
    await attempt(async () => {
      const closed = processIsLive(probe) ? new Promise((resolve) => probe.once('close', resolve)) : Promise.resolve();
      try { await stopProbe(probe, closed); } finally {
        probe.stdout?.destroy();
        probe.stderr?.destroy();
        if (!processIsLive(probe)) activeProbes.delete(probe);
      }
    });
  }
  await attempt(() => stopProcessGroup(metro, metroPgid));
  await attempt(async () => closeFd(metroStdoutFd));
  await attempt(async () => closeFd(metroStderrFd));
  await attempt(async () => { if (port) await assertPortReusable(port); });
  await attempt(async () => assert.equal(activeProbes.size, 0, 'cleanup left active truth probes'));
  await attempt(async () => { if (simulatorBootedByRunner) run('xcrun', ['simctl', 'shutdown', simulator.udid], { env }); });
  await attempt(async () => fs.rmSync(path.join(root, 'ios'), { recursive: true, force: true }));
  await attempt(async () => { if (temp) fs.rmSync(temp, { recursive: true, force: true }); });
  await attempt(async () => assert.equal(exists('ios'), false, 'cleanup left root ios/'));
  await attempt(async () => assert.equal(exists('android'), false, 'cleanup created root android/'));
  await attempt(async () => assert.equal(run('git', ['status', '--porcelain=v1', '-z']), baseline, 'cleanup did not restore the working-tree baseline'));
  if (primaryError) {
    primaryError.cleanupErrors = cleanupErrors;
    throwAfterBuildFailureEmission(primaryError, cleanupErrors);
  }
  if (cleanupErrors.length) {
    const error = new AggregateError(cleanupErrors, 'Development Build cleanup failed');
    if (appMetroSettings) error.appMetroSettings = appMetroSettings;
    throw error;
  }
  return result;
}

const result = requestedMode === '--preflight'
  ? await preflight()
  : requestedMode === '--network-regression'
    ? await networkRegression()
    : requestedMode === '--pod-cache-regression'
      ? podCacheRegression()
      : requestedMode === '--metro-evidence-regression'
        ? metroEvidenceRegression()
        : requestedMode === '--build-failure-marker-transport-child'
          ? buildFailureMarkerTransportChild()
        : await developmentBuild();
console.log(`G004_DEVELOPMENT_BUILD=${JSON.stringify(result)}`);
