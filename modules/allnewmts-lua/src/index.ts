import { requireNativeModule } from 'expo-modules-core';

type LuaHarness = {
  create(): boolean;
  evaluate(source: string): string;
  destroy(): void;
};

export default requireNativeModule<LuaHarness>('AllNewMTSLua');

export { runtime } from './runtime';
export type { RuntimeAdmission } from './runtime';
