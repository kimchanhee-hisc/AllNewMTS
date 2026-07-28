import { descriptorBase, type ControlModule, type LabelControl } from './types';

export const labelControl: ControlModule<LabelControl> = {
  type: 'Label',
  create: (common, values) => Object.freeze({
    ...common,
    type: 'Label',
    caption: values.caption as string,
    ...(values.fgcolor === undefined ? {} : { foregroundColor: values.fgcolor as LabelControl['foregroundColor'] }),
    ...(values.fontsize === undefined ? {} : { fontsize: values.fontsize as string }),
    ...(values.fontstyle === undefined ? {} : { fontstyle: values.fontstyle as string }),
  }),
  project: (control) => Object.freeze({
    ...descriptorBase(control),
    component: 'Text',
    text: control.caption,
    foregroundColor: control.foregroundColor?.value,
    accessibilityLabel: control.caption || control.name,
  }),
};
