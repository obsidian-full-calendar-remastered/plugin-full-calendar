import * as React from 'react';
import FullCalendarPlugin from '../../../main';
import { ProviderConfigContext } from '../../typesProvider';
import { CalDAVProviderConfig } from '../types/typesCalDAV';
import { CalDAVConfigComponent } from './CalDAVConfigComponent';

export const CalDAVSettingRow: React.FC<{
  source: Partial<import('../../../types').CalendarInfo>;
}> = ({ source }) => {
  const url = (source as unknown as { url?: string })?.url || '';
  const username = (source as unknown as { username?: string })?.username || '';

  return React.createElement(
    React.Fragment,
    {},
    React.createElement(
      'div',
      { className: 'setting-item-control' },
      React.createElement('input', {
        disabled: true,
        type: 'text',
        value: url,
        className: 'ofc-setting-input'
      })
    ),
    React.createElement(
      'div',
      { className: 'setting-item-control' },
      React.createElement('input', {
        disabled: true,
        type: 'text',
        value: username,
        className: 'ofc-setting-input'
      })
    )
  );
};

export type CalDAVConfigProps = {
  plugin: FullCalendarPlugin;
  config: Partial<CalDAVProviderConfig>;
  onConfigChange: (newConfig: Partial<CalDAVProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: CalDAVProviderConfig | CalDAVProviderConfig[]) => void;
  onClose: () => void;
};

export const CalDAVConfigWrapper: React.FC<CalDAVConfigProps> = props => {
  const { config, onSave, onClose } = props;
  const handleSave = (configs: CalDAVProviderConfig[]) => onSave(configs);

  return React.createElement(CalDAVConfigComponent, {
    config,
    onSave: handleSave,
    onClose
  });
};
