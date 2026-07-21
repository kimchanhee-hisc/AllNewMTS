import { Pressable, Text, TextInput, View } from 'react-native';
import type { XmfControlEvent, XmfModel, XmfRenderDescriptor } from './xmf';
import { buildControlEvent, toRenderDescriptors } from './xmf';
import type { RuntimeControlState } from './runtime-client';

type Props = {
  model: XmfModel;
  runtimeControls?: Record<string, RuntimeControlState>;
  onControlEvent(event: XmfControlEvent): void;
};

const position = ({ left, top, width, height }: XmfRenderDescriptor['style']) => ({ position: 'absolute' as const, left, top, width, height });

export function XmfScreen({ model, runtimeControls = {}, onControlEvent }: Props) {
  const controls = new Map(model.controls.map((control) => [control.name, control]));
  const descriptors = toRenderDescriptors(model, Object.fromEntries(Object.entries(runtimeControls).map(([name, state]) => [name, state.properties])));
  return (
    <View style={{ position: 'relative', width: model.form.layout.width, height: model.form.layout.height, backgroundColor: model.form.backgroundColor.value }}>
      {descriptors.map((descriptor) => {
        const control = controls.get(descriptor.control);
        if (!control) throw new Error('INVALID_RENDER_DESCRIPTOR');
        switch (descriptor.component) {
          case 'Text':
            return <Text key={descriptor.key} accessibilityLabel={descriptor.accessibilityLabel} style={[position(descriptor.style), descriptor.foregroundColor ? { color: descriptor.foregroundColor } : undefined]}>{descriptor.text}</Text>;
          case 'TextInput': {
            const padding = descriptor.padding && { paddingTop: descriptor.padding.top, paddingRight: descriptor.padding.right, paddingBottom: descriptor.padding.bottom, paddingLeft: descriptor.padding.left };
            return <TextInput key={`${descriptor.key}:${descriptor.text}`} defaultValue={descriptor.text} placeholder={descriptor.placeholder} maxLength={descriptor.maxLength} accessibilityLabel={descriptor.accessibilityLabel} style={[position(descriptor.style), padding]} onSubmitEditing={({ nativeEvent }) => onControlEvent(buildControlEvent(control, 'OnEditComplete', nativeEvent.text))} />;
          }
          case 'Pressable': {
            const enabled = descriptor.enabled !== false;
            return (
              <Pressable key={descriptor.key} disabled={!enabled} accessibilityRole="button" accessibilityLabel={descriptor.accessibilityLabel} accessibilityState={{ disabled: !enabled }} style={[position(descriptor.style), { borderWidth: descriptor.borderWidth, backgroundColor: descriptor.backgroundColor, opacity: enabled ? 1 : 0.5 }]} onPress={() => onControlEvent(buildControlEvent(control, 'OnClick'))}>
                <Text style={{ color: descriptor.foregroundColor }}>{descriptor.text}</Text>
              </Pressable>
            );
          }
          default:
            throw new Error('UNSUPPORTED_RENDER_DESCRIPTOR');
        }
      })}
    </View>
  );
}
