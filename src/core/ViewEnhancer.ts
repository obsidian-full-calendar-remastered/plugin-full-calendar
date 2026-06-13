/**
 * @file ViewEnhancer.ts
 * @brief Orchestrates presentation-layer logic for the calendar view.
 *
 * @description
 * This class acts as the single intermediary between the EventCache and the
 * CalendarView. It composes one or more "enhancement modules" (like the
 * WorkspaceManager) to apply all necessary data transformations and configuration
 * overrides before the data is rendered.
 *
 * This decouples complex business logic from the view, making the view a "dumb"
 * renderer and centralizing the transformation logic for consistency and testability.
 *
 * @license See LICENSE.md
 */

import { FullCalendarSettings } from '../types/settings';
import { WorkspaceManager } from '../features/workspaces/WorkspaceManager';
import { OFCEventSource } from './EventCache';
import { EventSourceInput } from '@fullcalendar/core';
import { WorkspaceSettings } from '../types/settings';

export class ViewEnhancer {
  private settings: FullCalendarSettings;
  private workspaceManager: WorkspaceManager;

  constructor(settings: FullCalendarSettings) {
    this.settings = settings;
    this.workspaceManager = new WorkspaceManager(settings);
  }

  /**
   * Updates the enhancer and its modules with the latest plugin settings.
   * @param newSettings The latest plugin settings.
   */
  public updateSettings(newSettings: FullCalendarSettings): void {
    this.settings = newSettings;
    this.workspaceManager.updateSettings(newSettings);
  }

  public async loadBasesFilter(): Promise<void> {
    await this.workspaceManager.loadBasesFilter();
  }

  /**
   * The main enhancement pipeline.
   * Takes raw sources from the cache and returns the final, filtered, and
   * configured data package for the calendar view to render.
   *
   * @param allSources The complete, unfiltered list of sources from EventCache.
   * @returns An object containing the final event sources and calendar configuration.
   */
  public getEnhancedData(allSources: OFCEventSource[]): {
    sources: EventSourceInput[];
    config: Partial<FullCalendarSettings>;
  } {
    const sources = this.workspaceManager.getFilteredEventSources(allSources);
    const config = this.workspaceManager.getCalendarConfig();
    return { sources, config };
  }

  /**
   * A pass-through to the workspace manager to get only the filtered sources.
   * This is used by UI components that need the raw, filtered OFCEventSource objects,
   * such as the timeline resource builder.
   *
   * @param allSources The complete, unfiltered list of sources from EventCache.
   * @returns A filtered array of OFCEventSource objects.
   */
  public getFilteredSources(allSources: OFCEventSource[]): OFCEventSource[] {
    return this.workspaceManager.filterCalendarSources(allSources);
  }

  /**
   * Gets the resolved workspace configuration (overrides merged on top of global settings).
   */
  public getCalendarConfig(): Partial<FullCalendarSettings> {
    return this.workspaceManager.getCalendarConfig();
  }

  /**
   * Gets the active workspace object from the internal manager.
   * @returns The active WorkspaceSettings object, or null if none is active.
   */
  public getActiveWorkspace(): WorkspaceSettings | null {
    return this.workspaceManager.getActiveWorkspace();
  }
}
