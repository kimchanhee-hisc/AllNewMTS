import { Image, Pressable, Text, TextInput, View, type ImageSourcePropType } from 'react-native';
import { buildControlEvent, type XmfControlEvent } from '../xmf';
import { resolveImageSource, type ImageSourceMap } from './image';
import type { XmfControl, XmfRenderDescriptor } from './types';

export type ControlImageSources = ImageSourceMap<ImageSourcePropType>;

type Props = {
  control: XmfControl;
  descriptor: XmfRenderDescriptor;
  imageSources: ControlImageSources;
  onControlEvent(event: XmfControlEvent): void;
};

const position = ({ left, top, width, height }: XmfRenderDescriptor['style']) => ({ position: 'absolute' as const, left, top, width, height });
const unreachable = (value: never): never => { throw new Error(`UNSUPPORTED_RENDER_DESCRIPTOR:${String(value)}`); };

export function ControlView({ control, descriptor, imageSources, onControlEvent }: Props) {
  const component = descriptor.component;
  switch (component) {
    case 'Text':
      return <Text accessibilityLabel={descriptor.accessibilityLabel} style={[position(descriptor.style), descriptor.foregroundColor ? { color: descriptor.foregroundColor } : undefined]}>{descriptor.text}</Text>;
    case 'TextInput': {
      const padding = descriptor.padding && { paddingTop: descriptor.padding.top, paddingRight: descriptor.padding.right, paddingBottom: descriptor.padding.bottom, paddingLeft: descriptor.padding.left };
      return <TextInput key={`${descriptor.key}:${descriptor.text}`} defaultValue={descriptor.text} placeholder={descriptor.placeholder} maxLength={descriptor.maxLength} accessibilityLabel={descriptor.accessibilityLabel} style={[position(descriptor.style), padding]} onSubmitEditing={({ nativeEvent }) => onControlEvent(buildControlEvent(control, 'OnEditComplete', nativeEvent.text))} />;
    }
    case 'Pressable': {
      const enabled = descriptor.enabled !== false;
      return (
        <Pressable disabled={!enabled} accessibilityRole="button" accessibilityLabel={descriptor.accessibilityLabel} accessibilityState={{ disabled: !enabled }} style={[position(descriptor.style), { borderWidth: descriptor.borderWidth, backgroundColor: descriptor.backgroundColor, opacity: enabled ? 1 : 0.5 }]} onPress={() => onControlEvent(buildControlEvent(control, 'OnClick'))}>
          <Text style={{ color: descriptor.foregroundColor }}>{descriptor.text}</Text>
        </Pressable>
      );
    }
    case 'Image': {
      if (descriptor.visible === false) return null;
      const source = resolveImageSource(descriptor.imageResource ?? '', descriptor.imageTarget ?? 0, descriptor.defaultImageResource ?? '', imageSources);
      const enabled = descriptor.enabled !== false;
      const size = Math.min(descriptor.style.width, descriptor.style.height);
      const clip = descriptor.circle
        ? { position: 'absolute' as const, left: (descriptor.style.width - size) / 2, top: (descriptor.style.height - size) / 2, width: size, height: size, borderRadius: size / 2 }
        : { width: '100%' as const, height: '100%' as const, borderRadius: descriptor.borderRadius };
      return (
        <Pressable
          disabled={!enabled}
          accessibilityRole="button"
          accessibilityLabel={descriptor.accessibilityLabel}
          accessibilityState={{ disabled: !enabled }}
          style={position(descriptor.style)}
          onPress={() => onControlEvent(buildControlEvent(control, 'OnClick'))}
        >
          <View pointerEvents="none" style={[clip, { backgroundColor: descriptor.backgroundColor, overflow: 'hidden' }]}>
            {source === undefined ? null : <Image source={source} accessible={false} resizeMode={descriptor.resizeMode ?? 'contain'} style={{ width: '100%', height: '100%' }} />}
          </View>
        </Pressable>
      );
    }
    default:
      return unreachable(component);
  }
}
