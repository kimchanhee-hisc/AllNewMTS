import type { RuntimeAdmission, RuntimeBinding, RuntimeResultEvent } from '../modules/allnewmts-lua/src';

type Scalar = string | number | boolean;
type TypedScalar = { type: 'string'; value: string } | { type: 'number'; value: number } | { type: 'boolean'; value: boolean };
type ControlMutation = { control: string; property: 'caption'; value: string };

export type RuntimeClientEvent = {
  handler: string;
  arguments?: readonly TypedScalar[];
  controlMutations: readonly ControlMutation[];
};

export type RuntimeConfig = {
  schemaVersion: 1;
  entry: { path: string; sha256: string };
  host: { openLinkData: string; sharedData: Record<string, string>; itemCodeInfo: readonly [] };
  controls: readonly (
    | { id: string; type: 'Edit'; properties: { caption: string } }
    | { id: string; type: 'Button'; properties: { border: string; dfgcolor: string; enabled: boolean } }
  )[];
  transactions: readonly { id: string; blocks: readonly { id: string; fields: readonly string[] }[] }[];
};

export type RuntimeControlState =
  | { type: 'Edit'; properties: { caption: string } }
  | { type: 'Button'; properties: { border: string; dfgcolor: string; enabled: boolean } };

export type RuntimeSnapshot = {
  runtimeId: string;
  revision: string;
  status: 'ok' | 'error';
  event: string;
  lifecycle: 'OPEN' | 'CLOSING';
  state: { controls: Record<string, RuntimeControlState>; data: Record<string, unknown> };
};

export type RuntimeCommand = Record<string, unknown> & { type: 'closeForm' | 'messageBox' | 'requestTranData' | 'returnToParent' | 'runtimeError' | 'toast' };

export type RuntimeClientState = {
  admissionRevision: string;
  appliedRevision: string;
  snapshot?: RuntimeSnapshot;
  commands: readonly RuntimeCommand[];
  error?: 'CREATE_REJECTED' | 'DISPATCH_REJECTED' | 'INVALID_RUNTIME_RESULT' | 'RUNTIME_CLOSED';
};

type RecordValue = Record<string, unknown>;
const DECIMAL = /^(?:0|[1-9][0-9]{0,19})$/;
const NONZERO_DECIMAL = /^[1-9][0-9]{0,19}$/;
const CODE = /^[A-Z][A-Z0-9_]*$/;
const HANDLER = /^[A-Za-z_][A-Za-z0-9_]{0,142}$/;
const MAX_RESULT_BYTES = 12 * 1024 * 1024 + 65536;
const encoder = new TextEncoder();

const record = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value);
const keys = (value: RecordValue, required: readonly string[], optional: readonly string[] = []) => {
  const actual = Object.keys(value);
  return required.every((key) => key in value) && actual.every((key) => required.includes(key) || optional.includes(key));
};
const boundedString = (value: unknown, max = 262144): value is string => typeof value === 'string' && value.length <= max && encoder.encode(value).length <= max;
const decimal = (value: unknown, nonzero = false): value is string =>
  typeof value === 'string' && (nonzero ? NONZERO_DECIMAL : DECIMAL).test(value) && BigInt(value) <= 18446744073709551615n;
const nextRevision = (current: string, candidate: unknown) => decimal(candidate) && BigInt(candidate) === BigInt(current) + 1n;
const scalar = (value: unknown): value is Scalar => boundedString(value) || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
const runtimeResult = (value: unknown): value is RuntimeResultEvent => record(value) && keys(value, ['canonicalJSON', 'runtimeId']) && decimal(value.runtimeId, true) && boundedString(value.canonicalJSON, MAX_RESULT_BYTES);

function validControl(value: unknown, expected?: RuntimeControlState): value is RuntimeControlState {
  if (!record(value) || !keys(value, ['properties', 'type']) || !record(value.properties)) return false;
  if (value.type === 'Edit') {
    return (!expected || expected.type === 'Edit') && keys(value.properties, ['caption']) && boundedString(value.properties.caption);
  }
  return value.type === 'Button' && (!expected || expected.type === 'Button') && keys(value.properties, ['border', 'dfgcolor', 'enabled']) &&
    (value.properties.border === 'none' || value.properties.border === '0' || value.properties.border === 'solid' || value.properties.border === '1') &&
    validRuntimeColor(value.properties.dfgcolor) && typeof value.properties.enabled === 'boolean';
}

function validRuntimeColor(value: unknown): value is string {
  if (value === 'black' || value === 'blue') return true;
  if (typeof value !== 'string' || !/^[0-9]{3}:[0-9]{9}$/.test(value)) return false;
  return [value.slice(4, 7), value.slice(7, 10), value.slice(10, 13)].every((channel) => Number(channel) <= 255);
}

function validData(value: unknown) {
  return record(value) && keys(value, ['block', 'field', 'index', 'transaction', 'value']) && boundedString(value.block) &&
    boundedString(value.field) && decimal(value.index) && boundedString(value.transaction) && scalar(value.value) && typeof value.value !== 'boolean';
}

function validCommand(value: unknown): value is RuntimeCommand {
  if (!record(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'closeForm':
      return keys(value, ['type']);
    case 'messageBox':
      return keys(value, ['confirmLabel', 'key', 'message', 'title', 'type']) && boundedString(value.confirmLabel) && boundedString(value.key) && boundedString(value.message) && boundedString(value.title);
    case 'requestTranData':
      return keys(value, ['blocks', 'requestToken', 'runtimeId', 'tranId', 'type']) && decimal(value.requestToken, true) && decimal(value.runtimeId, true) && boundedString(value.tranId) && Array.isArray(value.blocks) && value.blocks.every((row) =>
        record(row) && keys(row, ['block', 'index', 'values']) && boundedString(row.block) && decimal(row.index) && record(row.values) && Object.values(row.values).every((item) => typeof item !== 'boolean' && scalar(item)));
    case 'returnToParent':
      return keys(value, ['name', 'payload', 'type']) && boundedString(value.name) && boundedString(value.payload);
    case 'runtimeError':
      return keys(value, ['code', 'type']) && typeof value.code === 'string' && CODE.test(value.code);
    case 'toast':
      return keys(value, ['duration', 'kind', 'message', 'type']) && value.duration === 1 && value.kind === 0 && boundedString(value.message);
    default:
      return false;
  }
}

function validDiagnostic(value: unknown) {
  return record(value) && keys(value, ['code', 'source'], ['event', 'limit']) && typeof value.code === 'string' && CODE.test(value.code) &&
    (value.source === 'runtime' || value.source === 'supervisor') && (value.event === undefined || boundedString(value.event, 65536)) &&
    (value.limit === undefined || (typeof value.limit === 'string' && /^[a-z][A-Za-z0-9]*$/.test(value.limit)));
}

function validEnvelopeShape(value: RecordValue, snapshot: RecordValue, commands: RuntimeCommand[], diagnostics: unknown[]) {
  const next = value.nextLifecycle;
  const userCommands = commands.every(({ type }) => type !== 'closeForm' && type !== 'runtimeError');
  if (snapshot.lifecycle === 'OPEN' && snapshot.status === 'ok') return (next === undefined || next === 'CLOSING') && userCommands;
  if (snapshot.lifecycle === 'CLOSING' && snapshot.status === 'ok') {
    return next === 'CLOSED' && snapshot.event === 'Form_OnFormClose' && commands.length > 0 && commands[commands.length - 1].type === 'closeForm' && commands.slice(0, -1).every(({ type }) => type !== 'closeForm' && type !== 'runtimeError');
  }
  if (snapshot.status !== 'error' || next !== 'INVALID' || diagnostics.length !== 1 || !record(diagnostics[0]) || diagnostics[0].source !== 'supervisor') return false;
  if (snapshot.lifecycle === 'OPEN') return commands.length === 1 && commands[0].type === 'runtimeError';
  return snapshot.lifecycle === 'CLOSING' && snapshot.event === 'Form_OnFormClose' && commands.length === 2 && commands[0].type === 'runtimeError' && commands[1].type === 'closeForm';
}

function parseResult(canonicalJSON: string, expectedRuntimeId: string, expectedRevision: string, controls: Record<string, RuntimeControlState>) {
  if (!canonicalJSON || canonicalJSON.length > MAX_RESULT_BYTES || encoder.encode(canonicalJSON).length > MAX_RESULT_BYTES) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(canonicalJSON);
  } catch {
    return undefined;
  }
  if (!record(value) || !keys(value, ['commands', 'diagnostics', 'schemaVersion', 'snapshot'], ['nextLifecycle']) || value.schemaVersion !== 1 ||
      !Array.isArray(value.commands) || value.commands.length > 1024 || !value.commands.every(validCommand) ||
      !Array.isArray(value.diagnostics) || value.diagnostics.length > 1024 || !value.diagnostics.every(validDiagnostic) ||
      (value.nextLifecycle !== undefined && value.nextLifecycle !== 'CLOSING' && value.nextLifecycle !== 'CLOSED' && value.nextLifecycle !== 'INVALID')) return undefined;
  const snapshot = value.snapshot;
  if (!record(snapshot) || !keys(snapshot, ['event', 'lifecycle', 'revision', 'runtimeId', 'state', 'status']) ||
      snapshot.runtimeId !== expectedRuntimeId || snapshot.revision !== expectedRevision || !boundedString(snapshot.event) ||
      (snapshot.lifecycle !== 'OPEN' && snapshot.lifecycle !== 'CLOSING') || (snapshot.status !== 'ok' && snapshot.status !== 'error') || !record(snapshot.state)) return undefined;
  const snapshotState = snapshot.state;
  if (!keys(snapshotState, ['controls', 'data']) || !record(snapshotState.controls) || !record(snapshotState.data)) return undefined;
  const snapshotControls = snapshotState.controls;
  const snapshotData = snapshotState.data;
  if (Object.keys(snapshotControls).length !== Object.keys(controls).length ||
      !Object.entries(controls).every(([id, expected]) => validControl(snapshotControls[id], expected)) ||
      !Object.values(snapshotData).every(validData) || !validEnvelopeShape(value, snapshot, value.commands as RuntimeCommand[], value.diagnostics)) return undefined;

  return { snapshot: snapshot as RuntimeSnapshot, commands: value.commands as RuntimeCommand[], nextLifecycle: value.nextLifecycle as 'CLOSING' | 'CLOSED' | 'INVALID' | undefined };
}

export function createRuntimeClient(binding: RuntimeBinding) {
  let runtimeId: string | undefined;
  let listener: { remove(): void } | undefined;
  let accepting = false;
  let internalCloseExpected = false;
  let dispatching = false;
  let destroyPromise: Promise<RuntimeAdmission | undefined> | undefined;
  let controls: Record<string, RuntimeControlState> = {};
  let state: RuntimeClientState = { admissionRevision: '0', appliedRevision: '0', commands: [] };
  const subscribers = new Set<(value: RuntimeClientState) => void>();
  const pending: unknown[] = [];
  const publish = () => subscribers.forEach((subscriber) => subscriber(state));
  const removeListener = () => { listener?.remove(); listener = undefined; };
  const beginDestroy = () => {
    if (destroyPromise) return destroyPromise;
    const ownedRuntimeId = runtimeId;
    destroyPromise = (ownedRuntimeId ? Promise.resolve().then(() => binding.destroy(ownedRuntimeId)) : Promise.resolve(undefined)).finally(() => {
      removeListener();
      runtimeId = undefined;
    });
    void destroyPromise.catch(() => undefined);
    return destroyPromise;
  };
  const closeInvalidResult = () => {
    if (!accepting) return;
    accepting = false;
    state = { ...state, error: 'INVALID_RUNTIME_RESULT' };
    publish();
    beginDestroy();
  };
  const apply = (event: unknown) => {
    if (!accepting || !runtimeId) return;
    if (!runtimeResult(event)) return closeInvalidResult();
    if (event.runtimeId !== runtimeId) return;
    const expectedRevision = (BigInt(state.appliedRevision) + 1n).toString();
    if (BigInt(expectedRevision) > BigInt(state.admissionRevision) && !internalCloseExpected) return closeInvalidResult();
    const parsed = parseResult(event.canonicalJSON, runtimeId, expectedRevision, controls);
    if (!parsed) return closeInvalidResult();
    internalCloseExpected = parsed.nextLifecycle === 'CLOSING';
    state = { ...state, appliedRevision: expectedRevision, snapshot: parsed.snapshot, commands: parsed.commands, error: undefined };
    publish();
    if (parsed.nextLifecycle === 'CLOSED' || parsed.nextLifecycle === 'INVALID') {
      accepting = false;
      removeListener();
      runtimeId = undefined;
    }
  };
  const receive = (event: unknown) => dispatching ? pending.push(event) : apply(event);

  return {
    getState: () => state,
    subscribe(subscriber: (value: RuntimeClientState) => void) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    async create(config: RuntimeConfig) {
      if (listener || accepting || destroyPromise) throw new Error('runtime client already used');
      controls = Object.fromEntries(config.controls.map((control) => [control.id, { type: control.type, properties: { ...control.properties } }])) as Record<string, RuntimeControlState>;
      listener = binding.addListener('onRuntimeResult', receive);
      let admission: RuntimeAdmission;
      try {
        admission = await binding.create(JSON.stringify(config));
      } catch (error) {
        state = { ...state, error: 'CREATE_REJECTED' };
        removeListener();
        publish();
        throw error;
      }
      if (admission.code !== 'OK' || !decimal(admission.runtimeId, true) || admission.reservedRevision !== '0') {
        state = { ...state, error: 'CREATE_REJECTED' };
        removeListener();
        publish();
        return admission;
      }
      runtimeId = admission.runtimeId;
      accepting = true;
      return admission;
    },
    dispatch(event: RuntimeClientEvent) {
      if (!accepting || internalCloseExpected || !runtimeId) return { code: 'RUNTIME_CLOSED', runtimeId: '0', reservedRevision: state.admissionRevision };
      if (!HANDLER.test(event.handler)) return { code: 'INVALID_ARGUMENT', runtimeId, reservedRevision: state.admissionRevision };
      const encoded = JSON.stringify({
        schemaVersion: 1,
        kind: 'handler',
        baseRevision: state.admissionRevision,
        handler: event.handler,
        arguments: event.arguments ?? [],
        controlMutations: event.controlMutations.map(({ control, property, value }) => ({ id: control, property, value: { type: 'string', value } })),
      });
      dispatching = true;
      let admission: RuntimeAdmission;
      try {
        admission = binding.dispatch(runtimeId, encoded);
      } catch {
        dispatching = false;
        pending.length = 0;
        state = { ...state, error: 'DISPATCH_REJECTED' };
        publish();
        return { code: 'DISPATCH_REJECTED', runtimeId, reservedRevision: state.admissionRevision };
      }
      dispatching = false;
      if (admission.code === 'OK' && admission.runtimeId === runtimeId && nextRevision(state.admissionRevision, admission.reservedRevision)) {
        state = { ...state, admissionRevision: admission.reservedRevision, error: undefined };
      } else {
        state = { ...state, error: 'DISPATCH_REJECTED' };
        pending.length = 0;
        publish();
      }
      while (pending.length) apply(pending.shift()!);
      return admission;
    },
    destroy() {
      accepting = false;
      return beginDestroy();
    },
  };
}
