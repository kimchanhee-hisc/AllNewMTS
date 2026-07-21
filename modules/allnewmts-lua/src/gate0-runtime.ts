import LuaHarness from './index';
import { gate0Fixture, gate0Golden } from './gate0-fixture.generated';

export const gate0RuntimeMarker = 'ALLNEWMTS_G002_RUNTIME_RESULT=';

export function runGate0Runtime(): void {
  const results: string[] = [];
  for (let cycle = 0; cycle < 3; cycle += 1) {
    if (!LuaHarness.create()) throw new Error('G002_CREATE_FAILED');
    try {
      results.push(LuaHarness.evaluate(gate0Fixture));
    } finally {
      LuaHarness.destroy();
    }
  }
  if (results.some((result) => result !== gate0Golden)) throw new Error('G002_GOLDEN_MISMATCH');
  console.log(`${gate0RuntimeMarker}${JSON.stringify({ status: 'PASS', cycles: results.length, golden: gate0Golden })}`);
}
