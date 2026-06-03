// src/ui/components/forms/ColorPicker.tsx

import { BasicProps } from './common';
import { CalendarInfo } from '../../../types';

export function ColorPicker<T extends Partial<CalendarInfo>>({
  source,
  changeListener
}: BasicProps<T>) {
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">Color</div>
        <div className="setting-item-description">The color of events on the calendar</div>
      </div>
      <div className="setting-item-control">
        <input
          required
          type="color"
          value={source.color}
          className="ofc-setting-color-input"
          onChange={changeListener(x => ({ ...source, color: x }))}
        />
      </div>
    </div>
  );
}
