import { requireNativeModule } from 'expo-modules-core';
import { normalizeLoopbackPort } from './loopback';

export type LoopbackProbeCode =
  | 'OK'
  | 'INVALID_ARGUMENT'
  | 'TRANSPORT_ERROR'
  | 'RESPONSE_LIMIT'
  | 'RESPONSE_INVALID'
  | 'HTTP_STATUS';

export type LoopbackProbeResult = {
  code: LoopbackProbeCode;
  httpStatus: number;
  body: string;
};

type NetworkingBinding = {
  probeLoopback(port: number): Promise<LoopbackProbeResult>;
};

const native = requireNativeModule<NetworkingBinding>('AllNewMTSNetworking');

export function probeLoopback(port: number): Promise<LoopbackProbeResult> {
  return native.probeLoopback(normalizeLoopbackPort(port));
}
