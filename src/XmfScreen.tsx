import { View } from 'react-native';
import { ControlView, type ControlImageSources } from './controls/ControlView';
import type { XmfControlEvent, XmfModel } from './xmf';
import { toRenderDescriptors } from './xmf';
import type { RuntimeControlState } from './runtime-client';

type Props = {
  model: XmfModel;
  runtimeControls?: Record<string, RuntimeControlState>;
  imageSources?: ControlImageSources;
  onControlEvent(event: XmfControlEvent): void;
};

export function XmfScreen({ model, runtimeControls = {}, imageSources = {}, onControlEvent }: Props) {
  const controls = new Map(model.controls.map((control) => [control.name, control]));
  const descriptors = toRenderDescriptors(model, Object.fromEntries(Object.entries(runtimeControls).map(([name, state]) => [name, state.properties])));
  return (
    <View style={{ position: 'relative', width: model.form.layout.width, height: model.form.layout.height, backgroundColor: model.form.backgroundColor.value }}>
      {descriptors.map((descriptor) => {
        const control = controls.get(descriptor.control);
        if (!control) throw new Error('INVALID_RENDER_DESCRIPTOR');
        return <ControlView key={descriptor.key} control={control} descriptor={descriptor} imageSources={imageSources} onControlEvent={onControlEvent} />;
      })}
    </View>
  );
}
