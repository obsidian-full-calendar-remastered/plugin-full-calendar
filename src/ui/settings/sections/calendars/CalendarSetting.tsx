/**
 * @file CalendarSetting.tsx
 * @brief React component for displaying and managing a list of configured calendars.
 *
 * @description
 * This file defines the `CalendarSettings` component, which is embedded in the
 * plugin's settings tab. It is responsible for rendering the list of all
 * currently configured calendar sources, allowing the user to modify their
 * colors, names, or delete them. It auto-saves changes: structural mutations
 * (add/delete) persist immediately, while cosmetic edits (name/color) are
 * debounced to avoid excessive disk writes.
 *
 * @license See LICENSE.md
 */

import * as React from 'react';
import { PluginState } from '../../../../core/PluginState';
import { CalendarInfo } from '../../../../types/calendar_settings';
import FullCalendarPlugin from '../../../../main';

// Define props for the new stable component
interface CalendarSettingRowProps {
  children: React.ReactNode;
  setting: Partial<CalendarInfo>;
  onColorChange: (s: string) => void;
  onNameChange: (s: string) => void;
  deleteCalendar: () => void;
}

// The new stable row component
const CalendarSettingRow = ({
  children,
  setting,
  onColorChange,
  onNameChange,
  deleteCalendar
}: CalendarSettingRowProps) => {
  return (
    <div className="setting-item">
      <button type="button" onClick={deleteCalendar} className="ofc-setting-delete-btn">
        ✕
      </button>
      <div className="setting-item-control u-flex-1">
        <input
          type="text"
          value={setting.name || ''}
          className="ofc-setting-input"
          onChange={e => onNameChange(e.target.value)}
        />
      </div>
      {children}
      <input
        type="color"
        value={setting.color}
        className="ofc-setting-color-input"
        onChange={e => onColorChange(e.target.value)}
      />
    </div>
  );
};

interface CalendarSettingsProps {
  sources: CalendarInfo[];
  submit: (payload: CalendarInfo[]) => void;
  plugin: FullCalendarPlugin;
}

// ✅ Expose this type in `settings.tsx`
export interface CalendarSettingsRef {
  addSource: (source: CalendarInfo) => void;
  getUsedDirectories: () => string[];
}

type CalendarSettingState = {
  sources: CalendarInfo[];
};

export class CalendarSettings
  extends React.Component<CalendarSettingsProps, CalendarSettingState>
  implements CalendarSettingsRef
{
  private debounceTimer: number | null = null;
  private static readonly DEBOUNCE_MS = 500;

  constructor(props: CalendarSettingsProps) {
    super(props);
    this.state = { sources: [...props.sources] };
  }

  private instancesListener = (): void => {
    this.setState({ sources: [...PluginState.getProviderRegistry().getAllSources()] });
  };

  componentDidMount() {
    (
      this.props.plugin.app.workspace as unknown as {
        on: (name: string, cb: () => void) => void;
      }
    ).on('full-calendar:instances-initialized', this.instancesListener);
  }

  componentDidUpdate(prevProps: CalendarSettingsProps) {
    if (prevProps.sources !== this.props.sources) {
      this.setState({ sources: [...this.props.sources] });
    }
  }

  componentWillUnmount() {
    (
      this.props.plugin.app.workspace as unknown as {
        off: (name: string, cb: () => void) => void;
      }
    ).off('full-calendar:instances-initialized', this.instancesListener);

    // Flush any pending debounced save before unmount to prevent data loss
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      this.props.submit(this.state.sources);
    }
  }

  /**
   * Immediately persists the given sources to settings.
   * Used for structural changes (add/delete) where consistency
   * with PluginState is critical before the next ID generation.
   */
  private saveImmediate(sources: CalendarInfo[]) {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.props.submit(sources);
  }

  /**
   * Schedules a debounced save for cosmetic changes (name, color).
   * Coalesces rapid edits into a single persist call.
   */
  private saveDebounced(sources: CalendarInfo[]) {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      // Re-read current state at flush time to capture any
      // additional edits that occurred during the debounce window
      this.props.submit(sources);
    }, CalendarSettings.DEBOUNCE_MS);
  }

  addSource = (source: CalendarInfo) => {
    const exists = this.state.sources.some(s => s.id === source.id);
    const newSources = exists ? this.state.sources : [...this.state.sources, source];
    this.setState({ sources: newSources }, () => this.saveImmediate(newSources));
  };

  getUsedDirectories = () => {
    return this.state.sources
      .map(s => s.type === 'local' && s.directory)
      .filter((s): s is string => !!s);
  };

  updateSourceName = (index: number, name: string) => {
    const newSources = [...this.state.sources];
    newSources[index] = { ...newSources[index], name };
    this.setState({ sources: newSources }, () => this.saveDebounced(newSources));
  };

  updateSourceConfig = (index: number, changes: Partial<CalendarInfo>) => {
    const newSources = [...this.state.sources];
    newSources[index] = { ...newSources[index], ...changes } as CalendarInfo;
    this.setState({ sources: newSources }, () => this.saveImmediate(newSources));
  };

  render() {
    return (
      <div className="u-w-full">
        {this.state.sources.map((s, idx) => (
          <ProviderAwareCalendarSettingRow
            key={idx}
            setting={s}
            plugin={this.props.plugin}
            onSourceChange={(changes: Partial<CalendarInfo>) =>
              this.updateSourceConfig(idx, changes)
            }
            onNameChange={(name: string) => this.updateSourceName(idx, name)}
            onColorChange={(color: string) => {
              const newSources = [
                ...this.state.sources.slice(0, idx),
                { ...this.state.sources[idx], color },
                ...this.state.sources.slice(idx + 1)
              ];
              this.setState({ sources: newSources }, () => this.saveDebounced(newSources));
            }}
            deleteCalendar={() => {
              const newSources = [
                ...this.state.sources.slice(0, idx),
                ...this.state.sources.slice(idx + 1)
              ];
              this.setState({ sources: newSources }, () => this.saveImmediate(newSources));
            }}
          />
        ))}
      </div>
    );
  }
}

// Provider-Aware Calendar Setting Row - the main component
interface ProviderAwareCalendarSettingsRowProps {
  setting: Partial<CalendarInfo>;
  onColorChange: (s: string) => void;
  onNameChange: (s: string) => void;
  deleteCalendar: () => void;
  plugin: FullCalendarPlugin;
  onSourceChange: (changes: Partial<CalendarInfo>) => void;
}

export const ProviderAwareCalendarSettingRow = ({
  setting,
  onColorChange,
  onNameChange,
  deleteCalendar,
  plugin,
  onSourceChange
}: ProviderAwareCalendarSettingsRowProps) => {
  const registry = PluginState.getProviderRegistry();
  const provider = setting.id ? registry.getInstance(setting.id) : null;

  const rowProps = {
    setting,
    onColorChange,
    onNameChange,
    deleteCalendar
  };

  // All providers should implement the required method - get the provider-specific content
  if (provider) {
    // Defensive check: if provider doesn't have the new method, provide fallback
    if (typeof provider.getSettingsRowComponent !== 'function') {
      console.warn(
        'Full Calendar: Provider instance missing getSettingsRowComponent method. Using fallback display. Please reload the plugin.'
      );

      // Fallback rendering - display basic info about the calendar source
      const displayName = setting.name || setting.type || 'Unknown';
      return (
        <CalendarSettingRow {...rowProps}>
          <div className="setting-item-control">
            <span>{displayName} calendar</span>
          </div>
        </CalendarSettingRow>
      );
    }

    const ProviderContent = provider.getSettingsRowComponent();
    return (
      <CalendarSettingRow {...rowProps}>
        <ProviderContent source={setting} plugin={plugin} onSourceChange={onSourceChange} />
      </CalendarSettingRow>
    );
  }

  // Fallback for sources without an ID or provider not found (should not happen in normal operation)
  return (
    <CalendarSettingRow {...rowProps}>
      <div className="setting-item-control">
        <span>Provider not found</span>
      </div>
    </CalendarSettingRow>
  );
};
