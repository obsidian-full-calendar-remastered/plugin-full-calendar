import { ComponentType } from 'react';
import type FullCalendarPlugin from '../main';
import type { CalendarInfo } from '../types';

/**
 * The persistent, source-of-truth locator for an event within its source.
 */
export type EventHandle = {
  persistentId: string;
  uid?: string;
  recurrenceId?: string;
  location?: { path: string; lineNumber?: number };
};

/**
 * Contextual information passed from the Settings UI to a provider's configuration component.
 */
export type ProviderConfigContext = {
  allDirectories: string[];
  usedDirectories: string[];
  headings: string[];
};

/**
 * A generic type for a React component used in the provider interface.
 */
export type FCReactComponent<T> = ComponentType<T>;

export type ProviderSettingsRowProps = {
  source: Partial<CalendarInfo>;
  plugin?: FullCalendarPlugin;
  onSourceChange?: (changes: Partial<CalendarInfo>) => void;
};
