import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { probeLoopback, type LoopbackProbeResult } from 'allnewmts-networking';

const expectedBody = 'ALLNEWMTS_NETWORKING_LOOPBACK_V1';
const configuredPort = Number(process.env.EXPO_PUBLIC_ALLNEWMTS_NETWORKING_LOOPBACK_PORT);

export default function App() {
  const [result, setResult] = useState<LoopbackProbeResult>();

  useEffect(() => {
    if (!Number.isSafeInteger(configuredPort)) return;
    void probeLoopback(configuredPort).then((value) => {
      setResult(value);
      if (
        value.code === 'OK' &&
        value.httpStatus === 200 &&
        value.body === expectedBody &&
        process.env.EXPO_PUBLIC_ALLNEWMTS_NETWORKING_OBSERVE === '1'
      ) {
        console.log(`ALLNEWMTS_NETWORKING_READY=${JSON.stringify({
          status: 'PASS',
          module: 'AllNewMTSNetworking',
          code: value.code,
          httpStatus: value.httpStatus,
          bodyBytes: value.body.length,
        })}`);
      }
    }).catch(() => setResult({ code: 'TRANSPORT_ERROR', httpStatus: 0, body: '' }));
  }, []);

  const passed = result?.code === 'OK' && result.httpStatus === 200 && result.body === expectedBody;
  const label = !Number.isSafeInteger(configuredPort)
    ? 'Run with npm run lab:networking'
    : result === undefined
      ? 'Checking native loopback…'
      : passed
        ? 'Networking module ready'
        : `Networking check failed: ${result.code}`;

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Networking Lab</Text>
      <Text accessibilityRole={passed ? 'text' : 'alert'} style={passed ? styles.pass : styles.status}>
        {label}
      </Text>
      <Text style={styles.detail}>Native module · numeric loopback · no credentials</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: '#F7FAFC' },
  title: { color: '#152033', fontSize: 28, fontWeight: '700' },
  status: { color: '#9B2C2C', fontSize: 16, textAlign: 'center' },
  pass: { color: '#137A3D', fontSize: 18, fontWeight: '600' },
  detail: { color: '#526174', fontSize: 14, textAlign: 'center' },
});
