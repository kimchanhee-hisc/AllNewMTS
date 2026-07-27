import { descriptorBase, type ControlModule, type ImageControl } from './types';

export const imageControl: ControlModule<ImageControl> = {
  type: 'Image',
  create: (common, values) => Object.freeze({
    ...common,
    type: 'Image',
    imageResource: values.imgpath as string,
  }),
  project: (control) => Object.freeze({
    ...descriptorBase(control),
    component: 'Image',
    imageResource: control.imageResource,
    accessibilityRole: 'image',
  }),
};
