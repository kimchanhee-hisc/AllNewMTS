import registryDocument from '../contracts/control-registry.json';
import { createControl, projectControl } from './controls';
import type { XmfColor, XmfControl, XmfPadding, XmfRect, XmfRenderDescriptor } from './controls';

export type { XmfColor, XmfControl, XmfPadding, XmfRect, XmfRenderDescriptor } from './controls';

export type XmfWarning = Readonly<{
  code: 'UNSUPPORTED_PRESENTATION_CODE' | 'UNSUPPORTED_IMAGE_PRESENTATION' | 'UNSUPPORTED_IMAGE_METADATA';
  normalizedType: 'Label' | 'Edit' | 'Button' | 'Image';
  property: 'fontsize' | 'fontstyle' | 'border' | 'bordersize' | 'tmpdnfiledel';
}>;

export type XmfField = Readonly<{ name: string; valueBytes: Uint8Array }>;
export type XmfBlock = Readonly<{
  name: string;
  direction: 'in' | 'out';
  occurs?: '1';
  length: string;
  uncompressedLength: string;
  body: Uint8Array;
  fields: readonly XmfField[];
}>;

export type XmfModel = Readonly<{
  map: Readonly<{
    screenNumber: string;
    screenName: string;
    version: string;
    writer: string;
    screenType: string;
    scriptType: string;
  }>;
  form: Readonly<{ name: string; backgroundColor?: XmfColor; layout: XmfRect }>;
  controls: readonly XmfControl[];
  tabOrder: Readonly<{ horizontal: readonly string[]; vertical: readonly string[] }>;
  script: Readonly<{ length: string; uncompressedLength: string; bytes: Uint8Array }>;
  transactionIds: readonly Readonly<{
    id: string;
    code: string;
    encryption: string;
    useAttributes: string;
  }>[];
  transactions: readonly Readonly<{
    name: string;
    title: string;
    realData: string;
    destinationServer: string;
    occursLength: string;
    memoryFieldLength: string;
    blocks: readonly XmfBlock[];
  }>[];
  warnings: readonly XmfWarning[];
}>;

type XmfRenderState = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

export type XmfControlEvent = Readonly<{
  handler: string;
  controlMutations: readonly Readonly<{ control: string; property: 'caption'; value: string }>[];
}>;

export type ApprovedXmfAsset = Readonly<{
  bytes: Uint8Array;
  byteCount: number;
  sha256: string;
  inputRole?: 'XMF' | 'XMS';
}>;

type RegistryPropertyDescriptor = Readonly<{
  name: string;
  policy: string;
  required: boolean;
  default: null | 'empty-string' | 'enabled' | 'disabled' | 'layout-visibility' | 'native-default' | 'zero' | 'omit';
  maxBytes: number;
}>;

type ControlDescriptor = Readonly<{
  decision: 'include' | 'unsupported';
  sourceTags: readonly string[];
  normalizedType: 'Label' | 'Edit' | 'Button' | 'Image' | 'unsupported';
  maxPerScope?: number;
  properties: readonly RegistryPropertyDescriptor[];
  events: readonly Readonly<{
    name: 'OnEditComplete' | 'OnClick';
    handlerSuffix: '_OnEditComplete' | '_OnClick';
    controlMutations: readonly Readonly<{ property: 'caption'; valueSource: 'value' }>[];
  }>[];
}>;

type PolicyDescriptor = Readonly<{
  id: string;
  coercion: string;
  warning: null | 'UNSUPPORTED_PRESENTATION_CODE' | 'UNSUPPORTED_IMAGE_PRESENTATION' | 'UNSUPPORTED_IMAGE_METADATA';
}>;

type Registry = Readonly<{
  form: Readonly<{ properties: readonly RegistryPropertyDescriptor[] }>;
  controls: readonly ControlDescriptor[];
  policies: readonly PolicyDescriptor[];
}>;

const registry = registryDocument as Registry;
const declaration = ascii('<?xml version="1.0" encoding="utf-8"?>');
const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
const MAX_INPUT = 4_194_304;
const SHA256_WORDS = Uint32Array.of(
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
);

export class XmfParseError extends Error {
  readonly code: 'INVALID_RESOURCE' | 'INVALID_STRUCTURE' | 'INVALID_PROPERTY' | 'UNSUPPORTED_CONTROL_TYPE' | 'UNSUPPORTED_INPUT_ROLE';
  readonly location: string;

  constructor(code: XmfParseError['code'], location: string) {
    super(`${code} at ${location}`);
    this.name = 'XmfParseError';
    this.code = code;
    this.location = location;
  }
}

function ascii(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function immutableBytes(bytes: Uint8Array): PropertyDescriptor {
  const stored = bytes.slice();
  return { enumerable: true, get: () => stored.slice() };
}

function opaque<T extends object>(value: T, property: string, bytes: Uint8Array): Readonly<T> {
  return Object.freeze(Object.defineProperty(value, property, immutableBytes(bytes)));
}

function fail(code: XmfParseError['code'], location: string): never {
  throw new XmfParseError(code, location);
}

function sha256(bytes: Uint8Array): string {
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  new DataView(padded.buffer).setUint32(padded.length - 4, bytes.length * 8);
  const state = Uint32Array.of(0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19);
  const schedule = new Uint32Array(64);
  const rotate = (value: number, bits: number) => (value >>> bits) | (value << (32 - bits));
  const view = new DataView(padded.buffer);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) schedule[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const first = rotate(schedule[index - 15], 7) ^ rotate(schedule[index - 15], 18) ^ (schedule[index - 15] >>> 3);
      const second = rotate(schedule[index - 2], 17) ^ rotate(schedule[index - 2], 19) ^ (schedule[index - 2] >>> 10);
      schedule[index] = (schedule[index - 16] + first + schedule[index - 7] + second) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const upper = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choice = (e & f) ^ (~e & g);
      const first = (h + upper + choice + SHA256_WORDS[index] + schedule[index]) >>> 0;
      const lower = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      h = g;
      g = f;
      f = e;
      e = (d + first) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (first + lower + majority) >>> 0;
    }
    const working = [a, b, c, d, e, f, g, h];
    for (let index = 0; index < 8; index += 1) state[index] = (state[index] + working[index]) >>> 0;
  }
  return [...state].map((word) => word.toString(16).padStart(8, '0')).join('');
}

function starts(bytes: Uint8Array, at: number, token: Uint8Array): boolean {
  if (at + token.length > bytes.length) return false;
  for (let index = 0; index < token.length; index += 1) {
    if (bytes[at + index] !== token[index]) return false;
  }
  return true;
}

function find(bytes: Uint8Array, at: number, token: Uint8Array): number {
  for (let cursor = at; cursor <= bytes.length - token.length; cursor += 1) {
    if (bytes[cursor] === token[0] && starts(bytes, cursor, token)) return cursor;
  }
  return -1;
}

function isWhitespace(byte: number): boolean {
  return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d;
}

function isNameByte(byte: number): boolean {
  return (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a) || byte === 0x5f;
}

function isIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value);
}

function isToken(value: string, maximum = 128): boolean {
  return value.length <= maximum && /^[A-Za-z0-9_-]+$/.test(value);
}

function isDecimal(value: string, maximumDigits: number): boolean {
  return new RegExp(`^[0-9]{1,${maximumDigits}}$`).test(value);
}

function decodeAttribute(raw: Uint8Array, maximum: number, location: string): string {
  if (raw.length > 4_096) fail('INVALID_STRUCTURE', location);
  let value = '';
  let start = 0;
  try {
    for (let index = 0; index < raw.length; index += 1) {
      if (raw[index] === 0x3c) fail('INVALID_STRUCTURE', location);
      if (raw[index] !== 0x26) continue;
      value += decoder.decode(raw.subarray(start, index));
      const end = raw.indexOf(0x3b, index + 1);
      if (end < 0) fail('INVALID_STRUCTURE', location);
      const entity = decoder.decode(raw.subarray(index, end + 1));
      const replacement = ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" } as const)[entity as '&amp;'];
      if (replacement === undefined) fail('INVALID_STRUCTURE', location);
      value += replacement;
      index = end;
      start = end + 1;
    }
    value += decoder.decode(raw.subarray(start));
  } catch (error) {
    if (error instanceof XmfParseError) throw error;
    fail('INVALID_STRUCTURE', location);
  }
  for (const character of value) {
    const code = character.charCodeAt(0);
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f) {
      fail('INVALID_STRUCTURE', location);
    }
  }
  if (encoder.encode(value).length > maximum) fail('INVALID_STRUCTURE', location);
  return value;
}

class Scanner {
  position = 0;

  constructor(readonly bytes: Uint8Array) {}

  whitespace(): void {
    while (isWhitespace(this.bytes[this.position] ?? -1)) this.position += 1;
  }

  exact(value: string, location: string): void {
    const token = ascii(value);
    if (!starts(this.bytes, this.position, token)) fail('INVALID_STRUCTURE', location);
    this.position += token.length;
  }

  opening(name: string, paired: boolean, location: string): Readonly<Record<string, string>> {
    this.exact(`<${name}`, location);
    const attributes: Record<string, string> = {};
    while (true) {
      if (this.bytes[this.position] === 0x3e) {
        if (!paired) fail('INVALID_STRUCTURE', location);
        this.position += 1;
        return Object.freeze(attributes);
      }
      if (this.bytes[this.position] === 0x2f && this.bytes[this.position + 1] === 0x3e) {
        if (paired) fail('INVALID_STRUCTURE', location);
        this.position += 2;
        return Object.freeze(attributes);
      }
      if (!isWhitespace(this.bytes[this.position] ?? -1)) fail('INVALID_STRUCTURE', location);
      this.whitespace();
      if (this.bytes[this.position] === 0x3e || (this.bytes[this.position] === 0x2f && this.bytes[this.position + 1] === 0x3e)) continue;
      const start = this.position;
      while (isNameByte(this.bytes[this.position] ?? -1)) this.position += 1;
      if (start === this.position || this.bytes[this.position] !== 0x3d || this.bytes[this.position + 1] !== 0x22) {
        fail('INVALID_STRUCTURE', location);
      }
      const attribute = decoder.decode(this.bytes.subarray(start, this.position));
      if (Object.hasOwn(attributes, attribute)) fail('INVALID_STRUCTURE', location);
      this.position += 2;
      const valueStart = this.position;
      while (this.position < this.bytes.length && this.bytes[this.position] !== 0x22) this.position += 1;
      if (this.position >= this.bytes.length) fail('INVALID_STRUCTURE', location);
      attributes[attribute] = decodeAttribute(this.bytes.subarray(valueStart, this.position), 4_096, location);
      this.position += 1;
    }
  }

  close(name: string, location: string): void {
    this.exact(`</${name}>`, location);
  }

  opaque(close: string, maximum: number, location: string): Uint8Array {
    const token = ascii(close);
    const end = find(this.bytes, this.position, token);
    if (end < 0 || end - this.position > maximum) fail('INVALID_STRUCTURE', location);
    const body = this.bytes.slice(this.position, end);
    this.position = end + token.length;
    return body;
  }
}

function attributes(
  input: Readonly<Record<string, string>>,
  required: readonly string[],
  optional: readonly string[],
  location: string,
): void {
  const allowed = new Set([...required, ...optional]);
  if (required.some((name) => !Object.hasOwn(input, name)) || Object.keys(input).some((name) => !allowed.has(name))) {
    fail('INVALID_STRUCTURE', location);
  }
}

function registryControl(tag: string): ControlDescriptor {
  const descriptor = registry.controls.find(({ sourceTags }) => sourceTags.includes(tag));
  if (!descriptor || descriptor.decision !== 'include' || descriptor.normalizedType === 'unsupported') {
    fail('UNSUPPORTED_CONTROL_TYPE', 'control');
  }
  return descriptor;
}

function policy(id: string): PolicyDescriptor {
  const matches = registry.policies.filter((entry) => entry.id === id);
  if (matches.length !== 1) fail('INVALID_RESOURCE', 'registry');
  return matches[0];
}

function canonicalDecimal(value: string, maximum: number): number | undefined {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) return undefined;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric <= maximum ? numeric : undefined;
}

function encodedColor(value: string, location: string): XmfColor {
  if (!/^[0-9]{3}:[0-9]{9}$/.test(value)) fail('INVALID_PROPERTY', location);
  const channels = [value.slice(4, 7), value.slice(7, 10), value.slice(10, 13)].map(Number);
  if (channels.some((channel) => channel > 255)) fail('INVALID_PROPERTY', location);
  return Object.freeze({ source: value, prefix: value.slice(0, 3), value: `rgb(${channels.join(',')})` });
}

function layout(value: string, location: string): XmfRect {
  const parts = value.split(',');
  if (parts.length !== 5 || parts.some((part) => !/^(?:0|[1-9][0-9]{0,3})$/.test(part))) fail('INVALID_PROPERTY', location);
  const numbers = parts.map(Number);
  if (numbers[0] > 8_192 || numbers[1] > 8_192 || numbers[2] < 1 || numbers[2] > 8_192 || numbers[3] < 1 || numbers[3] > 8_192 || parts[4] !== '1') {
    fail('INVALID_PROPERTY', location);
  }
  return Object.freeze({ left: numbers[0], top: numbers[1], width: numbers[2], height: numbers[3] });
}

type ImageLayout = Readonly<{ rect: XmfRect; visible: boolean }>;

function imageLayout(value: string, location: string): ImageLayout {
  const parts = value.split(',');
  if (parts.length !== 5 || !/^(?:0|-?[1-9][0-9]{0,3})$/.test(parts[0]) || !/^(?:0|-?[1-9][0-9]{0,3})$/.test(parts[1]) ||
      !/^(?:[1-9][0-9]{0,3})$/.test(parts[2]) || !/^(?:[1-9][0-9]{0,3})$/.test(parts[3]) || !/^[01]$/.test(parts[4])) {
    fail('INVALID_PROPERTY', location);
  }
  const numbers = parts.map(Number);
  if (Math.abs(numbers[0]) > 8_192 || Math.abs(numbers[1]) > 8_192 || numbers[2] > 8_192 || numbers[3] > 8_192) fail('INVALID_PROPERTY', location);
  return Object.freeze({ rect: Object.freeze({ left: numbers[0], top: numbers[1], width: numbers[2], height: numbers[3] }), visible: parts[4] === '1' });
}

function padding(value: string, location: string): XmfPadding {
  const parts = value.split(',');
  if (parts.length !== 4 || parts.some((part) => !/^(?:0|[1-9][0-9]{0,3})$/.test(part))) fail('INVALID_PROPERTY', location);
  const numbers = parts.map(Number);
  if (numbers.some((number) => number > 1_024)) fail('INVALID_PROPERTY', location);
  return Object.freeze({ top: numbers[0], right: numbers[1], bottom: numbers[2], left: numbers[3] });
}

function coerce(policyId: string, value: string, location: string): unknown {
  switch (policy(policyId).coercion) {
    case 'identifier':
      if (isIdentifier(value)) return value;
      break;
    case 'bounded-text': return value;
    case 'logical-resource-name':
      if (/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,255}$/.test(value)) return value;
      break;
    case 'layout-rect': return layout(value, location);
    case 'zero-one-boolean':
      if (value === '0' || value === '1') return value === '1';
      break;
    case 'canonical-decimal-1-262144': {
      const number = canonicalDecimal(value, 262_144);
      if (number !== undefined && number >= 1) return number;
      break;
    }
    case 'padding-quad-0-1024': return padding(value, location);
    case 'exact-zero':
      if (value === '0') return undefined;
      break;
    case 'encoded-rgb': return encodedColor(value, location);
    case 'canonical-decimal-0-255': {
      const number = canonicalDecimal(value, 255);
      if (number !== undefined) return number;
      break;
    }
    case 'ascii-digits-1-3':
      if (/^[0-9]{1,3}$/.test(value)) return value;
      break;
    case 'two-bits':
      if (/^[01]{2}$/.test(value)) return value;
      break;
    case 'bounded-image-resource':
      if (!/[\u0000-\u001f\u007f]/.test(value)) return value;
      break;
    case 'image-target-0-3': {
      const number = canonicalDecimal(value, 3);
      if (number !== undefined) return number;
      break;
    }
    case 'signed-layout-with-visibility': return imageLayout(value, location);
    case 'canonical-decimal-0-8192': {
      const number = canonicalDecimal(value, 8_192);
      if (number !== undefined) return number;
      break;
    }
    case 'bounded-image-metadata': return undefined;
    default: fail('INVALID_RESOURCE', 'registry');
  }
  fail('INVALID_PROPERTY', location);
}

function controlFrom(tag: string, raw: Readonly<Record<string, string>>, warnings: Map<string, XmfWarning>): XmfControl {
  const descriptor = registryControl(tag);
  const required = descriptor.properties.filter((entry) => entry.required).map((entry) => entry.name);
  const optional = descriptor.properties.filter((entry) => !entry.required).map((entry) => entry.name);
  attributes(raw, required, optional, 'control');
  const values: Record<string, unknown> = {};
  for (const property of descriptor.properties) {
    const source = raw[property.name];
    if (source === undefined) {
      if (property.default === 'empty-string') values[property.name] = '';
      else if (property.default === 'enabled') values[property.name] = true;
      else if (property.default === 'disabled') values[property.name] = false;
      else if (property.default === 'zero') values[property.name] = 0;
      continue;
    }
    if (encoder.encode(source).length > property.maxBytes) fail('INVALID_PROPERTY', `control.${property.name}`);
    values[property.name] = coerce(property.policy, source, `control.${property.name}`);
    const warning = policy(property.policy).warning;
    if (warning) {
      const key = `${descriptor.normalizedType}:${property.name}`;
      warnings.set(key, Object.freeze({
        code: warning,
        normalizedType: descriptor.normalizedType as XmfWarning['normalizedType'],
        property: property.name as XmfWarning['property'],
      }));
    }
  }
  if (descriptor.normalizedType === 'unsupported') fail('UNSUPPORTED_CONTROL_TYPE', 'control');
  const parsedLayout = values.ly_vert as XmfRect | ImageLayout;
  const layoutValue = 'rect' in parsedLayout ? parsedLayout.rect : parsedLayout;
  if ('rect' in parsedLayout) {
    if (values.visible !== undefined && values.visible !== parsedLayout.visible) fail('INVALID_PROPERTY', 'control.visible');
    values.visible = values.visible ?? parsedLayout.visible;
  }
  return createControl(descriptor.normalizedType, { name: values.name as string, layout: layoutValue }, values);
}

function bounded(raw: Readonly<Record<string, string>>, name: string, maximum: number, location: string, minimum = 0): string {
  const value = raw[name];
  const length = value === undefined ? -1 : encoder.encode(value).length;
  if (value === undefined || length < minimum || length > maximum) fail('INVALID_STRUCTURE', location);
  return value;
}

function validateBlockBody(body: Uint8Array, location: string): readonly XmfField[] {
  if (body.length < 1 || body.length > 262_144) fail('INVALID_STRUCTURE', location);
  let crlf = false;
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] !== 0x0d) continue;
    if (body[index + 1] !== 0x0a) fail('INVALID_STRUCTURE', location);
    crlf = true;
    index += 1;
  }
  if (crlf && body.some((byte, index) => byte === 0x0a && body[index - 1] !== 0x0d)) fail('INVALID_STRUCTURE', location);
  const rows: Uint8Array[] = [];
  let start = 0;
  for (let index = 0; index <= body.length; index += 1) {
    const delimiter = index === body.length || (!crlf && body[index] === 0x0a) || (crlf && body[index] === 0x0d);
    if (!delimiter) continue;
    rows.push(body.subarray(start, index));
    if (crlf && index < body.length) index += 1;
    start = index + 1;
  }
  const boundary = (row: Uint8Array) => row.every((byte) => byte === 0x20 || byte === 0x09);
  let first = 0;
  let last = rows.length;
  while (first < last && first < 2 && boundary(rows[first])) first += 1;
  let trailing = 0;
  while (last > first && trailing < 2 && boundary(rows[last - 1])) { last -= 1; trailing += 1; }
  const dataRows = rows.slice(first, last);
  if (dataRows.length < 1 || dataRows.length > 1_024 || dataRows.some(boundary)) fail('INVALID_STRUCTURE', location);
  const names = new Set<string>();
  return Object.freeze(dataRows.map((row) => {
    if (row.length < 2 || row.length > 4_096) fail('INVALID_STRUCTURE', location);
    const caret = row.indexOf(0x5e);
    if (caret < 1) fail('INVALID_STRUCTURE', location);
    let name: string;
    try {
      name = decoder.decode(row.subarray(0, caret));
      decoder.decode(row.subarray(caret + 1));
    } catch {
      fail('INVALID_STRUCTURE', location);
    }
    if (!isIdentifier(name) || names.has(name)) fail('INVALID_STRUCTURE', location);
    names.add(name);
    return opaque({ name } as { name: string; valueBytes: Uint8Array }, 'valueBytes', row.subarray(caret + 1)) as XmfField;
  }));
}

function parseBlock(scanner: Scanner): XmfBlock {
  const raw = scanner.opening('TRBLOCK', true, 'transaction.block');
  attributes(raw, ['name', 'inout', '_len', '_ulen'], ['occurs'], 'transaction.block');
  if (!isIdentifier(raw.name) || !['in', 'out'].includes(raw.inout) || !isDecimal(raw._len, 10) || !isDecimal(raw._ulen, 10) || (raw.occurs !== undefined && raw.occurs !== '1')) {
    fail('INVALID_STRUCTURE', 'transaction.block');
  }
  const body = scanner.opaque('</TRBLOCK>', 262_144, 'transaction.block');
  const value = {
    name: raw.name,
    direction: raw.inout as 'in' | 'out',
    ...(raw.occurs === undefined ? {} : { occurs: '1' as const }),
    length: raw._len,
    uncompressedLength: raw._ulen,
    fields: validateBlockBody(body, 'transaction.block.rows'),
  } as XmfBlock;
  return opaque(value, 'body', body) as XmfBlock;
}

function parseXmfInternal(source: Uint8Array): XmfModel {
  if (!(source instanceof Uint8Array) || source.length < 1 || source.length > MAX_INPUT) fail('INVALID_RESOURCE', 'document');
  const bytes = source.slice();
  if (bytes.includes(0) || starts(bytes, 0, Uint8Array.of(0xef, 0xbb, 0xbf)) || !starts(bytes, 0, declaration)) fail('INVALID_STRUCTURE', 'document');
  const scanner = new Scanner(bytes);
  scanner.position = declaration.length;
  scanner.whitespace();
  attributes(scanner.opening('ROOT', true, 'root'), [], [], 'root');

  scanner.whitespace();
  const mapRaw = scanner.opening('MAP_INFO', false, 'map');
  attributes(mapRaw, ['scrno', 'scrname', 'version', 'writer', 'scrtype', 'scripttype'], [], 'map');
  if (!isToken(mapRaw.scrno) || !isDecimal(mapRaw.version, 3) || !isDecimal(mapRaw.scrtype, 3) || !isDecimal(mapRaw.scripttype, 3)) fail('INVALID_STRUCTURE', 'map');
  const map = Object.freeze({
    screenNumber: mapRaw.scrno,
    screenName: bounded(mapRaw, 'scrname', 512, 'map', 1),
    version: mapRaw.version,
    writer: bounded(mapRaw, 'writer', 256, 'map', 1),
    screenType: mapRaw.scrtype,
    scriptType: mapRaw.scripttype,
  });

  scanner.whitespace();
  const formRaw = scanner.opening('FORM_INFO', false, 'form');
  const formRequired = registry.form.properties.filter(({ required }) => required).map(({ name }) => name);
  const formOptional = registry.form.properties.filter(({ required }) => !required).map(({ name }) => name);
  attributes(formRaw, formRequired, formOptional, 'form');
  const formValues = Object.fromEntries(registry.form.properties.flatMap((entry) => {
    const source = formRaw[entry.name];
    if (source === undefined) return [];
    if (encoder.encode(source).length > entry.maxBytes) fail('INVALID_PROPERTY', `form.${entry.name}`);
    return [[entry.name, coerce(entry.policy, source, `form.${entry.name}`)]];
  }));
  const form = Object.freeze({
    name: formValues.name as string,
    ...(formValues.bgcolor === undefined ? {} : { backgroundColor: formValues.bgcolor as XmfColor }),
    layout: formValues.ly_vert as XmfRect,
  });

  scanner.whitespace();
  attributes(scanner.opening('CONTROL_INFO', true, 'controls'), [], [], 'controls');
  const warnings = new Map<string, XmfWarning>();
  const controls: XmfControl[] = [];
  const imageLimit = registry.controls.find(({ normalizedType }) => normalizedType === 'Image')?.maxPerScope ?? 0;
  while (controls.length < 69) {
    scanner.whitespace();
    if (starts(bytes, scanner.position, ascii('<TABORDER_INFO'))) break;
    const tag = registry.controls.flatMap(({ sourceTags }) => sourceTags).find((candidate) => starts(bytes, scanner.position, ascii(`<${candidate}`)));
    if (!tag) fail('UNSUPPORTED_CONTROL_TYPE', 'control');
    controls.push(controlFrom(tag, scanner.opening(tag, false, 'control'), warnings));
  }
  const counts = controls.reduce<Record<string, number>>((result, control) => ({ ...result, [control.type]: (result[control.type] ?? 0) + 1 }), {});
  if (controls.length < 1 || (counts.Image ?? 0) > imageLimit || new Set(controls.map(({ name }) => name)).size !== controls.length) fail('INVALID_STRUCTURE', 'controls');
  scanner.whitespace();
  const tabRaw = scanner.opening('TABORDER_INFO', false, 'tab-order');
  attributes(tabRaw, ['horz', 'vert'], [], 'tab-order');
  const focusable = new Set(controls.filter(({ type }) => type === 'Edit' || type === 'Button').map(({ name }) => name));
  const tabList = (value: string): readonly string[] => {
    if (encoder.encode(value).length > 644) fail('INVALID_STRUCTURE', 'tab-order');
    if (value === '') return Object.freeze([]);
    const names = value.split('`');
    if (names.length < 1 || names.length > 5 || names.some((name) => !isIdentifier(name) || !focusable.has(name)) || new Set(names).size !== names.length) fail('INVALID_STRUCTURE', 'tab-order');
    return Object.freeze(names);
  };
  const tabOrder = Object.freeze({ horizontal: tabList(tabRaw.horz), vertical: tabList(tabRaw.vert) });
  scanner.whitespace();
  scanner.close('CONTROL_INFO', 'controls');

  scanner.whitespace();
  const scriptRaw = scanner.opening('SCRIPT_INFO', true, 'script');
  attributes(scriptRaw, ['_len', '_ulen'], [], 'script');
  if (!isDecimal(scriptRaw._len, 10) || !isDecimal(scriptRaw._ulen, 10)) fail('INVALID_STRUCTURE', 'script');
  const scriptBytes = scanner.opaque('</SCRIPT_INFO>', 2_097_152, 'script');
  const script = opaque({ length: scriptRaw._len, uncompressedLength: scriptRaw._ulen } as { length: string; uncompressedLength: string; bytes: Uint8Array }, 'bytes', scriptBytes) as XmfModel['script'];

  scanner.whitespace();
  const transactionIds: Array<XmfModel['transactionIds'][number]> = [];
  const transactions: Array<XmfModel['transactions'][number]> = [];
  if (starts(bytes, scanner.position, ascii('<DATAIO_INFO'))) {
    attributes(scanner.opening('DATAIO_INFO', true, 'data'), [], [], 'data');
    scanner.whitespace();
    attributes(scanner.opening('TRID_INFO', true, 'transaction-ids'), [], [], 'transaction-ids');
    for (let index = 0; index < 2; index += 1) {
      scanner.whitespace();
      const raw = scanner.opening('TRAN', false, 'transaction-id');
      attributes(raw, ['tranid', 'trcode', 'encryption', 'useattr'], [], 'transaction-id');
      if (!isIdentifier(raw.tranid) || !isToken(raw.trcode) || !isDecimal(raw.encryption, 3) || !isDecimal(raw.useattr, 3)) fail('INVALID_STRUCTURE', 'transaction-id');
      transactionIds.push(Object.freeze({ id: raw.tranid, code: raw.trcode, encryption: raw.encryption, useAttributes: raw.useattr }));
    }
    if (new Set(transactionIds.map(({ id }) => id)).size !== 2) fail('INVALID_STRUCTURE', 'transaction-ids');
    scanner.whitespace();
    scanner.close('TRID_INFO', 'transaction-ids');

    scanner.whitespace();
    attributes(scanner.opening('TRIO_INFO', true, 'transactions'), [], [], 'transactions');
    for (let index = 0; index < 2; index += 1) {
      scanner.whitespace();
      const raw = scanner.opening('TRAN', true, 'transaction');
      attributes(raw, ['name', 'title', 'realdata', 'dessvr', 'occurslen', 'memfieldlen'], [], 'transaction');
      if (!isIdentifier(raw.name) || !isDecimal(raw.realdata, 10) || !isToken(raw.dessvr, 32) || !isDecimal(raw.occurslen, 10) || !isDecimal(raw.memfieldlen, 10)) fail('INVALID_STRUCTURE', 'transaction');
      bounded(raw, 'title', 512, 'transaction');
      const blocks: XmfBlock[] = [];
      for (let blockIndex = 0; blockIndex < 4; blockIndex += 1) {
        scanner.whitespace();
        if (!starts(bytes, scanner.position, ascii('<TRBLOCK'))) fail('INVALID_STRUCTURE', 'transaction.blocks');
        blocks.push(parseBlock(scanner));
        const saved = scanner.position;
        scanner.whitespace();
        const expected = blockIndex < 3 ? '<TRBLOCK' : '</TRAN>';
        if (!starts(bytes, scanner.position, ascii(expected))) fail('INVALID_STRUCTURE', 'transaction.blocks');
        scanner.position = saved;
      }
      const blockNames = new Set(blocks.map(({ name }) => name));
      const directionValid = (direction: 'in' | 'out') => {
        const matches = blocks.filter((block) => block.direction === direction);
        return matches.length === 2 && matches.filter(({ occurs }) => occurs === undefined).length === 1 && matches.filter(({ occurs }) => occurs === '1').length === 1;
      };
      if (blockNames.size !== 4 || !directionValid('in') || !directionValid('out')) fail('INVALID_STRUCTURE', 'transaction.blocks');
      scanner.whitespace();
      scanner.close('TRAN', 'transaction');
      transactions.push(Object.freeze({ name: raw.name, title: raw.title, realData: raw.realdata, destinationServer: raw.dessvr, occursLength: raw.occurslen, memoryFieldLength: raw.memfieldlen, blocks: Object.freeze(blocks) }));
    }
    const idSet = new Set(transactionIds.map(({ id }) => id));
    if (new Set(transactions.map(({ name }) => name)).size !== 2 || transactions.some(({ name }) => !idSet.has(name))) fail('INVALID_STRUCTURE', 'transactions');
    scanner.whitespace();
    scanner.close('TRIO_INFO', 'transactions');
    scanner.whitespace();
    scanner.close('DATAIO_INFO', 'data');
  }
  scanner.whitespace();
  scanner.close('ROOT', 'root');
  scanner.whitespace();
  if (scanner.position !== bytes.length) fail('INVALID_STRUCTURE', 'document');

  return Object.freeze({
    map,
    form,
    controls: Object.freeze(controls),
    tabOrder,
    script,
    transactionIds: Object.freeze(transactionIds),
    transactions: Object.freeze(transactions),
    warnings: Object.freeze([...warnings.values()].sort((left, right) => `${left.normalizedType}:${left.property}`.localeCompare(`${right.normalizedType}:${right.property}`))),
  });
}

export function parseXmf(bytes: Uint8Array): XmfModel {
  return parseXmfInternal(bytes);
}

export function ingestApprovedXmf(asset: ApprovedXmfAsset): XmfModel {
  if (asset === null || typeof asset !== 'object') fail('INVALID_RESOURCE', 'approved-asset');
  if (asset.inputRole === 'XMS') fail('UNSUPPORTED_INPUT_ROLE', 'input-role');
  if (asset.inputRole !== undefined && asset.inputRole !== 'XMF') fail('INVALID_RESOURCE', 'input-role');
  if (!(asset.bytes instanceof Uint8Array) || asset.bytes.length < 1 || asset.bytes.length > MAX_INPUT || asset.byteCount !== asset.bytes.length || !/^[0-9a-f]{64}$/.test(asset.sha256) || sha256(asset.bytes) !== asset.sha256) {
    fail('INVALID_RESOURCE', 'approved-asset');
  }
  return parseXmf(asset.bytes);
}

function runtimeBorder(value: unknown, borderSize: number): number {
  if (policy('runtime-border').coercion !== 'runtime-border-token' || typeof value !== 'string') fail('INVALID_PROPERTY', 'runtime.border');
  if (value === '0' || value === 'none') return 0;
  if (value === '1' || value === 'solid') return Math.max(1, borderSize);
  fail('INVALID_PROPERTY', 'runtime.border');
}

function runtimeColor(value: unknown): string {
  if (policy('runtime-disabled-color').coercion !== 'runtime-color-token' || typeof value !== 'string') fail('INVALID_PROPERTY', 'runtime.dfgcolor');
  if (value === 'black' || value === 'blue') return value;
  return encodedColor(value, 'runtime.dfgcolor').value;
}

const validImagePosition = (value: unknown) => Number.isInteger(value) && Math.abs(value as number) <= 8_192;
const validImageSize = (value: unknown) => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 8_192;
const validImageResource = (value: unknown) =>
  typeof value === 'string' && encoder.encode(value).length <= 2_048 && !/[\u0000-\u001f\u007f]/.test(value);

export function toRenderDescriptors(model: XmfModel, state: XmfRenderState = {}): readonly XmfRenderDescriptor[] {
  const normalized = new Map<string, Readonly<Record<string, unknown>>>();
  for (const [name, properties] of Object.entries(state)) {
    const control = model.controls.find((candidate) => candidate.name === name);
    if (!control || properties === null || typeof properties !== 'object' || Array.isArray(properties)) fail('INVALID_PROPERTY', 'runtime.control');
    const keys = Object.keys(properties);
    if (control.type === 'Edit') {
      if (keys.some((key) => key !== 'caption') || (properties.caption !== undefined && (typeof properties.caption !== 'string' || encoder.encode(properties.caption).length > 2_048))) fail('INVALID_PROPERTY', 'runtime.Edit');
      normalized.set(name, Object.freeze({ ...(properties.caption === undefined ? {} : { caption: properties.caption }) }));
    } else if (control.type === 'Button') {
      if (keys.some((key) => !['border', 'dfgcolor', 'enabled'].includes(key)) || (properties.enabled !== undefined && typeof properties.enabled !== 'boolean')) fail('INVALID_PROPERTY', 'runtime.Button');
      normalized.set(name, Object.freeze({
        ...(properties.border === undefined ? {} : { borderWidth: runtimeBorder(properties.border, control.borderSize) }),
        ...(properties.dfgcolor === undefined ? {} : { disabledForegroundColor: runtimeColor(properties.dfgcolor) }),
        ...(properties.enabled === undefined ? {} : { enabled: properties.enabled }),
      }));
    } else if (control.type === 'Image') {
      if (keys.some((key) => !['imgpath', 'imagetarget', 'visible', 'enabled', 'left', 'top', 'width', 'height', 'autosize', 'circle'].includes(key)) ||
          (properties.imgpath !== undefined && !validImageResource(properties.imgpath)) ||
          (properties.imagetarget !== undefined && (!Number.isInteger(properties.imagetarget) || (properties.imagetarget as number) < 0 || (properties.imagetarget as number) > 3)) ||
          ['visible', 'enabled', 'autosize', 'circle'].some((key) => properties[key] !== undefined && typeof properties[key] !== 'boolean') ||
          ['left', 'top'].some((key) => properties[key] !== undefined && !validImagePosition(properties[key])) ||
          ['width', 'height'].some((key) => properties[key] !== undefined && !validImageSize(properties[key]))) {
        fail('INVALID_PROPERTY', 'runtime.Image');
      }
      normalized.set(name, Object.freeze({
        ...(properties.imgpath === undefined ? {} : { imageResource: properties.imgpath }),
        ...(properties.imagetarget === undefined ? {} : { imageTarget: properties.imagetarget }),
        ...(properties.visible === undefined ? {} : { visible: properties.visible }),
        ...(properties.enabled === undefined ? {} : { enabled: properties.enabled }),
        ...(properties.left === undefined ? {} : { left: properties.left }),
        ...(properties.top === undefined ? {} : { top: properties.top }),
        ...(properties.width === undefined ? {} : { width: properties.width }),
        ...(properties.height === undefined ? {} : { height: properties.height }),
        ...(properties.autosize === undefined ? {} : { autosize: properties.autosize }),
        ...(properties.circle === undefined ? {} : { circle: properties.circle }),
      }));
    } else if (keys.length) {
      fail('INVALID_PROPERTY', `runtime.${control.type}`);
    }
  }
  return Object.freeze(model.controls.map((control) => projectControl(control, normalized.get(control.name) ?? {})));
}

export function buildControlEvent(control: XmfControl, event: 'OnEditComplete' | 'OnClick', value?: string): XmfControlEvent {
  const descriptor = registry.controls.find(({ normalizedType }) => normalizedType === control.type);
  const eventDescriptor = descriptor?.events.find(({ name }) => name === event);
  if (!eventDescriptor) fail('INVALID_PROPERTY', 'control.event');
  const mutationValue = value ?? (control.type === 'Edit' ? control.caption : '');
  return Object.freeze({
    handler: `${control.name}${eventDescriptor.handlerSuffix}`,
    controlMutations: Object.freeze(eventDescriptor.controlMutations.map(() => Object.freeze({ control: control.name, property: 'caption' as const, value: mutationValue }))),
  });
}
