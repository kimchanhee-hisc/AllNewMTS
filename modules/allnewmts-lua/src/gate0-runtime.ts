import { gate0Harness } from './gate0-harness';
import { gate0Fixture, gate0Golden } from './gate0-fixture.generated';

export const gate0RuntimeMarker = 'ALLNEWMTS_G002_RUNTIME_RESULT=';

export function runGate0Runtime(): void {
  const results: string[] = [];
  for (let cycle = 0; cycle < 3; cycle += 1) {
    if (!gate0Harness.create()) throw new Error('G002_CREATE_FAILED');
    try {
      results.push(gate0Harness.evaluate(gate0Fixture));
    } finally {
      gate0Harness.destroy();
    }
  }
  if (results.some((result) => result !== gate0Golden)) throw new Error('G002_GOLDEN_MISMATCH');
  console.log(`${gate0RuntimeMarker}${JSON.stringify({ status: 'PASS', cycles: results.length, golden: gate0Golden })}`);
}
