import { descriptorBase, type ControlModule, type ImageControl, type ImageResourceTarget } from './types';

export type ImageSourceMap<T> = Readonly<Partial<Record<ImageResourceTarget, Readonly<Record<string, T>>>>>;

export function resolveImageSource<T>(resource: string, target: ImageResourceTarget, fallback: string, sources: ImageSourceMap<T>): T | undefined {
  const bucket = Object.hasOwn(sources, target) ? sources[target] : undefined;
  let source = resource && bucket && Object.hasOwn(bucket, resource) ? bucket[resource] : undefined;
  const local = Object.hasOwn(sources, 0) ? sources[0] : undefined;
  if (source === undefined && fallback && local && Object.hasOwn(local, fallback)) source = local[fallback];
  if ((resource || fallback) && source === undefined) throw new Error('UNRESOLVED_IMAGE_RESOURCE');
  return source;
}

export const imageControl: ControlModule<ImageControl> = {
  type: 'Image',
  create: (common, values) => Object.freeze({
    ...common,
    type: 'Image',
    imageResource: values.imgpath as string,
    imageTarget: values.imagetarget as ImageControl['imageTarget'],
    defaultImageResource: values.defaultimg as string,
    visible: values.visible as boolean,
    enabled: values.enable as boolean,
    autosize: values.autosize as boolean,
    circle: values.circle as boolean,
    ...(values.bgcolor === undefined ? {} : { backgroundColor: values.bgcolor as ImageControl['backgroundColor'] }),
    borderRadius: values.borderradius as number,
  }),
  project: (control, state) => {
    const style = Object.freeze({
      left: (state.left as number | undefined) ?? control.layout.left,
      top: (state.top as number | undefined) ?? control.layout.top,
      width: (state.width as number | undefined) ?? control.layout.width,
      height: (state.height as number | undefined) ?? control.layout.height,
    });
    return Object.freeze({
      ...descriptorBase(control),
      component: 'Image',
      imageResource: (state.imageResource as string | undefined) ?? control.imageResource,
      imageTarget: (state.imageTarget as ImageControl['imageTarget'] | undefined) ?? control.imageTarget,
      defaultImageResource: control.defaultImageResource,
      visible: (state.visible as boolean | undefined) ?? control.visible,
      enabled: (state.enabled as boolean | undefined) ?? control.enabled,
      resizeMode: ((state.autosize as boolean | undefined) ?? control.autosize) ? 'stretch' : 'contain',
      circle: (state.circle as boolean | undefined) ?? control.circle,
      backgroundColor: control.backgroundColor?.value,
      borderWidth: 0,
      borderRadius: Math.min(control.borderRadius, style.width / 2, style.height / 2),
      style,
      accessibilityRole: 'button',
      event: 'OnClick',
    });
  },
};
