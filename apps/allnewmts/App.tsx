import { useEffect, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';
import {
  connectMciBeta,
  disconnectMci,
  fetchSamsungElectronicsQuote,
} from 'allnewmts-networking';

const mciSourceAsset = require('./assets/ip.dat') as number;

async function loadMciSource() {
  const [asset] = await Asset.loadAsync(mciSourceAsset);
  return new File(asset.localUri ?? asset.uri).base64();
}

type AppState =
  | { screen: 'splash'; message: string; error?: string }
  | { screen: 'main'; currentPrice?: string; error?: string };

export default function App() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<AppState>({
    screen: 'splash',
    message: '앱 기본 데이터를 불러오는 중입니다',
  });

  useEffect(() => {
    let active = true;
    setState({ screen: 'splash', message: '앱 기본 데이터를 불러오는 중입니다' });

    void (async () => {
      await disconnectMci();
      if (!active) return;
      let mciSource: string;
      try {
        mciSource = await loadMciSource();
      } catch {
        if (!active) return;
        setState({
          screen: 'splash',
          message: '시작할 수 없습니다',
          error: 'MCI 기본 데이터를 불러오지 못했습니다',
        });
        return;
      }
      if (!active) return;
      setState({ screen: 'splash', message: 'MCI에 연결하는 중입니다' });
      const connection = await connectMciBeta(mciSource);
      if (!active) return;
      if (connection.code !== 'OK') {
        setState({
          screen: 'splash',
          message: '연결하지 못했습니다',
          error: connection.code,
        });
        return;
      }

      setState({ screen: 'main' });
      try {
        const quote = await fetchSamsungElectronicsQuote();
        if (!active) return;
        setState(
          quote.code === 'OK'
            ? { screen: 'main', currentPrice: quote.currentPrice }
            : { screen: 'main', error: quote.code },
        );
      } catch {
        if (active) setState({ screen: 'main', error: 'TRANSPORT_ERROR' });
      }
    })().catch(() => {
      if (active) {
        setState({ screen: 'splash', message: '시작하지 못했습니다', error: 'TRANSPORT_ERROR' });
      }
    });

    return () => {
      active = false;
    };
  }, [attempt]);

  if (state.screen === 'splash') {
    return (
      <View style={styles.splash}>
        <StatusBar style="dark" />
        <Text style={styles.brand}>AllNewMTS</Text>
        <Text accessibilityRole={state.error ? 'alert' : 'text'} style={styles.status}>
          {state.message}
        </Text>
        {state.error ? (
          <>
            <Text style={styles.error}>{state.error}</Text>
            <Button title="다시 시도" onPress={() => setAttempt((value) => value + 1)} />
          </>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.main}>
      <StatusBar style="dark" />
      <Text style={styles.name}>삼성전자</Text>
      <Text style={styles.code}>005930 · KOSPI</Text>
      <Text accessibilityRole={state.error ? 'alert' : 'text'} style={styles.price}>
        {state.currentPrice
          ? `${state.currentPrice.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`
          : state.error
            ? '현재가를 불러오지 못했습니다'
            : '현재가 조회 중…'}
      </Text>
      {state.error ? (
        <Button title="처음부터 다시 시도" onPress={() => setAttempt((value) => value + 1)} />
      ) : (
        <Text style={styles.source}>GD1000Q1</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  brand: { color: '#111827', fontSize: 30, fontWeight: '700' },
  status: { color: '#4B5563', fontSize: 15, textAlign: 'center' },
  error: { color: '#B42318', fontSize: 13 },
  main: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#FFFFFF',
  },
  name: { color: '#111827', fontSize: 28, fontWeight: '700' },
  code: { marginTop: 8, color: '#6B7280', fontSize: 14 },
  price: { marginVertical: 24, color: '#111827', fontSize: 36, fontWeight: '700' },
  source: { color: '#9CA3AF', fontSize: 12 },
});
