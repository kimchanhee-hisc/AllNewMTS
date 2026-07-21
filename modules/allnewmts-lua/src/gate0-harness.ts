import { requireNativeModule } from 'expo-modules-core';

type LuaHarness = {
  create(): boolean;
  evaluate(source: string): string;
  destroy(): void;
};

export const gate0Harness = requireNativeModule<LuaHarness>('AllNewMTSLua');
