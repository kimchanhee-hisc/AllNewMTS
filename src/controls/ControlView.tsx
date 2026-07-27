import { Image, Pressable, Text, TextInput, type ImageSourcePropType } from 'react-native';
import { buildControlEvent, type XmfControlEvent } from '../xmf';
import type { XmfControl, XmfRenderDescriptor } from './types';

export type ControlImageSources = Readonly<Record<string, ImageSourcePropType>>;

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
      const resource = descriptor.imageResource;
      const source = resource && Object.hasOwn(imageSources, resource) ? imageSources[resource] : undefined;
      if (!resource || source === undefined) throw new Error('UNRESOLVED_IMAGE_RESOURCE');
      return <Image source={source} accessibilityRole="image" accessibilityLabel={descriptor.accessibilityLabel} resizeMode="contain" style={position(descriptor.style)} />;
    }
    default:
      return unreachable(component);
  }
}
