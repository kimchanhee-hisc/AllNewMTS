import { EventSubscription, requireNativeModule } from 'expo-modules-core';

export type RuntimeAdmission = { code: string; runtimeId: string; reservedRevision: string };
type RuntimeResultEvent = { runtimeId: string; canonicalJSON: string };

type NativeRuntime = {
  create(config: string): Promise<RuntimeAdmission>;
  dispatch(runtimeId: string, event: string): RuntimeAdmission;
  destroy(runtimeId: string): Promise<RuntimeAdmission>;
  addListener(event: 'onRuntimeResult', listener: (value: RuntimeResultEvent) => void): EventSubscription;
};

export const runtime = requireNativeModule<NativeRuntime>('AllNewMTSRuntime');
