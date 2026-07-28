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

export type MciCode =
  | 'OK'
  | 'INVALID_ARGUMENT'
  | 'BETA_SOURCE_MISMATCH'
  | 'BETA_ENDPOINT_INVALID'
  | 'TRANSPORT_ERROR'
  | 'FRAME_INVALID'
  | 'INIT_INVALID'
  | 'AUTH_FAILED'
  | 'NOT_READY'
  | 'RESOURCE_LIMIT'
  | 'TRANSACTION_REJECTED'
  | 'TRANSACTION_INVALID'
  | 'TRANSACTION_BODY_INVALID';

export type MciResult = { code: MciCode };

export type SamsungElectronicsQuoteResult =
  | {
      code: 'OK';
      instrument: '005930';
      currentPrice: string;
    }
  | {
      code: Exclude<MciCode, 'OK'>;
    };

type NetworkingBinding = {
  probeLoopback(port: number): Promise<LoopbackProbeResult>;
  connectMciBeta(sourceBase64: string): Promise<MciResult>;
  fetchSamsungElectronicsQuote(): Promise<SamsungElectronicsQuoteResult>;
  disconnectMci(): Promise<void>;
};

const native = requireNativeModule<NetworkingBinding>('AllNewMTSNetworking');

export function probeLoopback(port: number): Promise<LoopbackProbeResult> {
  return native.probeLoopback(normalizeLoopbackPort(port));
}

export function connectMciBeta(sourceBase64: string): Promise<MciResult> {
  return native.connectMciBeta(sourceBase64);
}

export function fetchSamsungElectronicsQuote(): Promise<SamsungElectronicsQuoteResult> {
  return native.fetchSamsungElectronicsQuote();
}

export function disconnectMci(): Promise<void> {
  return native.disconnectMci();
}
