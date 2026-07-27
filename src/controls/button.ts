import { descriptorBase, type ButtonControl, type ControlModule, type XmfColor } from './types';

export const buttonControl: ControlModule<ButtonControl> = {
  type: 'Button',
  create: (common, values) => Object.freeze({
    ...common,
    type: 'Button',
    caption: values.caption as string,
    enabled: values.enable as boolean,
    foregroundColor: values.fgcolor as XmfColor,
    ...(values.bgcolor === undefined ? {} : { backgroundColor: values.bgcolor as XmfColor }),
    borderSize: values.bordersize as number,
    fontsize: values.fontsize as string,
  }),
  project: (control, state) => {
    const enabled = (state.enabled as boolean | undefined) ?? control.enabled;
    return Object.freeze({
      ...descriptorBase(control),
      component: 'Pressable',
      text: control.caption,
      enabled,
      foregroundColor: !enabled && state.disabledForegroundColor !== undefined ? state.disabledForegroundColor as string : control.foregroundColor.value,
      ...(control.backgroundColor === undefined ? {} : { backgroundColor: control.backgroundColor.value }),
      borderWidth: (state.borderWidth as number | undefined) ?? control.borderSize,
      accessibilityLabel: control.caption || control.name,
      accessibilityRole: 'button',
      event: 'OnClick',
    });
  },
};
