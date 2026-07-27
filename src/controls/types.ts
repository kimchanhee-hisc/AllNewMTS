export type XmfRect = Readonly<{ left: number; top: number; width: number; height: number }>;
export type XmfPadding = Readonly<{ top: number; right: number; bottom: number; left: number }>;
export type XmfColor = Readonly<{ source: string; prefix: string; value: string }>;

export type XmfControlBase = Readonly<{ name: string; layout: XmfRect }>;
export type LabelControl = XmfControlBase & Readonly<{
  type: 'Label';
  caption: string;
  fontsize?: string;
  fontstyle?: string;
}>;
export type EditControl = XmfControlBase & Readonly<{
  type: 'Edit';
  caption: string;
  hintCaption: string;
  maxLength: number;
  padding: XmfPadding;
}>;
export type ButtonControl = XmfControlBase & Readonly<{
  type: 'Button';
  caption: string;
  enabled: boolean;
  foregroundColor: XmfColor;
  backgroundColor?: XmfColor;
  borderSize: number;
  fontsize: string;
}>;
export type ImageControl = XmfControlBase & Readonly<{
  type: 'Image';
  imageResource: string;
}>;
export type XmfControl = LabelControl | EditControl | ButtonControl | ImageControl;

export type XmfRenderDescriptor = Readonly<{
  key: string;
  control: string;
  component: 'Text' | 'TextInput' | 'Pressable' | 'Image';
  text?: string;
  imageResource?: string;
  placeholder?: string;
  maxLength?: number;
  enabled?: boolean;
  foregroundColor?: string;
  backgroundColor?: string;
  borderWidth?: number;
  padding?: XmfPadding;
  style: XmfRect;
  accessibilityLabel: string;
  accessibilityRole?: 'button' | 'image';
  event?: 'OnEditComplete' | 'OnClick';
}>;

export type ControlValues = Readonly<Record<string, unknown>>;
export type ControlProjectionState = Readonly<Record<string, unknown>>;

export interface ControlModule<T extends XmfControl> {
  readonly type: T['type'];
  create(common: XmfControlBase, values: ControlValues): T;
  project(control: T, state: ControlProjectionState): XmfRenderDescriptor;
}

export function descriptorBase(control: XmfControl): Pick<XmfRenderDescriptor, 'key' | 'control' | 'style' | 'accessibilityLabel'> {
  return { key: control.name, control: control.name, style: control.layout, accessibilityLabel: control.name };
}
