import { verificationHarness } from './verification-harness';
import { verificationFixture, verificationGolden } from './verification-fixture.generated';

export const verificationRuntimeMarker = 'ALLNEWMTS_NATIVE_HARNESS_RESULT=';

export function runVerificationHarness(): void {
  const results: string[] = [];
  for (let cycle = 0; cycle < 3; cycle += 1) {
    if (!verificationHarness.create()) throw new Error('NATIVE_HARNESS_CREATE_FAILED');
    try {
      results.push(verificationHarness.evaluate(verificationFixture));
    } finally {
      verificationHarness.destroy();
    }
  }
  if (results.some((result) => result !== verificationGolden)) throw new Error('NATIVE_HARNESS_GOLDEN_MISMATCH');
  console.log(`${verificationRuntimeMarker}${JSON.stringify({ status: 'PASS', cycles: results.length, golden: verificationGolden })}`);
}
