export function normalizeLoopbackPort(port: number): number {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new RangeError('loopback port must be an integer from 1 through 65535');
  }
  return port;
}
