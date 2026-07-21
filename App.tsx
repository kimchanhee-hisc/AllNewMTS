import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { runtime } from './modules/allnewmts-lua/src';
import { XmfScreen } from './src/XmfScreen';
import { g004OriginalXmfBytes, g004OriginalXmfBytesCount, g004OriginalXmfSha256 } from './src/generated/g004-original-xmf';
import { createRuntimeClient, type RuntimeConfig } from './src/runtime-client';
import { ingestApprovedXmf, type XmfModel } from './src/xmf';

const model = ingestApprovedXmf({
  bytes: g004OriginalXmfBytes,
  byteCount: g004OriginalXmfBytesCount,
  sha256: g004OriginalXmfSha256,
});

export function buildG004AppRuntimeConfig(model: XmfModel): RuntimeConfig {
  return {
    schemaVersion: 1,
    entry: {
      path: 'fixtures/runtime-conformance.lua',
      sha256: '1e3b642aeda6de9ddbd309df8ac22ee4f3dcce78a8d166caa4e5774f39f82e09',
    },
    host: { openLinkData: '', sharedData: {}, itemCodeInfo: [] },
    controls: model.controls.flatMap<RuntimeConfig['controls'][number]>((control) => {
      switch (control.type) {
        case 'Label': return [];
        case 'Edit': return [{ id: control.name, type: 'Edit' as const, properties: { caption: control.caption } }];
        case 'Button': return [{ id: control.name, type: 'Button' as const, properties: { border: control.borderSize > 0 ? 'solid' : 'none', dfgcolor: 'black', enabled: control.enabled } }];
      }
    }),
    transactions: [{ id: 'T_ALPHA', blocks: [{ id: 'input', fields: ['value'] }, { id: 'output', fields: ['value'] }] }],
  };
}

export default function App() {
  const client = useMemo(() => createRuntimeClient(runtime), []);
  const [clientState, setClientState] = useState(client.getState());

  useEffect(() => {
    const unsubscribe = client.subscribe(setClientState);
    void client.create(buildG004AppRuntimeConfig(model)).then((admission) => {
      if (admission.code === 'OK' && process.env.EXPO_PUBLIC_ALLNEWMTS_G004_OBSERVE === '1') {
        console.log(`ALLNEWMTS_G004_UI_READY=${JSON.stringify({
          status: 'PASS',
          sourceSha256: g004OriginalXmfSha256,
          formCount: 1,
          labelCount: model.controls.filter(({ type }) => type === 'Label').length,
          editCount: model.controls.filter(({ type }) => type === 'Edit').length,
          buttonCount: model.controls.filter(({ type }) => type === 'Button').length,
          module: 'AllNewMTSRuntime',
          createCode: 'OK',
        })}`);
      }
    }).catch(() => undefined);
    return () => {
      unsubscribe();
      void client.destroy().catch(() => undefined);
    };
  }, [client]);

  if (clientState.error) return <View><Text accessibilityRole="alert">Runtime unavailable: {clientState.error}</Text></View>;
  return <XmfScreen model={model} runtimeControls={clientState.snapshot?.state.controls} onControlEvent={client.dispatch} />;
}
