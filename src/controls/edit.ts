import { descriptorBase, type ControlModule, type EditControl, type XmfPadding } from './types';

export const editControl: ControlModule<EditControl> = {
  type: 'Edit',
  create: (common, values) => Object.freeze({
    ...common,
    type: 'Edit',
    caption: values.caption as string,
    hintCaption: values.hintcaption as string,
    maxLength: values.maxlength as number,
    padding: values.paddinginfo as XmfPadding,
  }),
  project: (control, state) => Object.freeze({
    ...descriptorBase(control),
    component: 'TextInput',
    text: (state.caption as string | undefined) ?? control.caption,
    placeholder: control.hintCaption,
    maxLength: control.maxLength,
    padding: control.padding,
    accessibilityLabel: control.hintCaption || control.name,
    event: 'OnEditComplete',
  }),
};
