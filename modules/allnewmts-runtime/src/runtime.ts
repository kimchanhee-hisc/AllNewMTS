import { EventSubscription, requireNativeModule } from 'expo-modules-core';

export type RuntimeAdmission = { code: string; runtimeId: string; reservedRevision: string };
export type RuntimeResultEvent = { runtimeId: string; canonicalJSON: string };

export type RuntimeBinding = {
  create(config: string): Promise<RuntimeAdmission>;
  dispatch(runtimeId: string, event: string): RuntimeAdmission;
  destroy(runtimeId: string): Promise<RuntimeAdmission>;
  addListener(event: 'onRuntimeResult', listener: (value: unknown) => void): EventSubscription;
};

export const runtime = requireNativeModule<RuntimeBinding>('AllNewMTSRuntime');
