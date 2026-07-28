import { buttonControl } from './button';
import { editControl } from './edit';
import { imageControl } from './image';
import { labelControl } from './label';
import type { ControlProjectionState, ControlValues, XmfControl, XmfControlBase, XmfRenderDescriptor } from './types';

const unreachable = (value: never): never => { throw new Error(`UNSUPPORTED_CONTROL_TYPE:${String(value)}`); };

export type {
  ButtonControl,
  ControlModule,
  EditControl,
  ImageControl,
  LabelControl,
  XmfColor,
  XmfControl,
  XmfPadding,
  XmfRect,
  XmfRenderDescriptor,
} from './types';

export function createControl(type: XmfControl['type'], common: XmfControlBase, values: ControlValues): XmfControl {
  switch (type) {
    case 'Label': return labelControl.create(common, values);
    case 'Edit': return editControl.create(common, values);
    case 'Button': return buttonControl.create(common, values);
    case 'Image': return imageControl.create(common, values);
    default: return unreachable(type);
  }
}

export function projectControl(control: XmfControl, state: ControlProjectionState): XmfRenderDescriptor {
  switch (control.type) {
    case 'Label': return labelControl.project(control, state);
    case 'Edit': return editControl.project(control, state);
    case 'Button': return buttonControl.project(control, state);
    case 'Image': return imageControl.project(control, state);
    default: return unreachable(control);
  }
}
