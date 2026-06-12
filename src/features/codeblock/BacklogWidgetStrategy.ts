import { EventRef } from 'obsidian';
import {
  EmbeddedWidgetStrategy,
  EmbeddedWidgetInstance,
  WidgetContext,
  EmbeddedBlockRegistry
} from './EmbeddedBlockRegistry';
import { EmbeddedTaskBacklog } from '../task-backlogs/EmbeddedTaskBacklog';
import FullCalendarPlugin from '../../main';

export class BacklogWidgetStrategy implements EmbeddedWidgetStrategy {
  private backlogEvents = new Map<EmbeddedTaskBacklog, EventRef>();

  constructor(private plugin: FullCalendarPlugin) {}

  async render(
    el: HTMLElement,
    config: Record<string, unknown>,
    ctx: WidgetContext
  ): Promise<EmbeddedWidgetInstance> {
    // Apply styling container class
    el.addClass('ofc-embedded-backlog-container');

    const backlogWidget = new EmbeddedTaskBacklog(this.plugin, el, config, callback => {
      ctx.onUpdate(callback);
      // Subscribe to backlog changes to trigger update
      interface AppWorkspaceEvents {
        on(name: 'full-calendar:backlog-changed', callback: () => void): EventRef;
      }
      const ref = (this.plugin.app.workspace as unknown as AppWorkspaceEvents).on(
        'full-calendar:backlog-changed',
        callback
      );
      this.backlogEvents.set(backlogWidget, ref);
    });

    backlogWidget.load();

    return {
      updateSize() {
        // Size updates are handled by standard CSS layout
      },
      async refresh() {
        await backlogWidget.refresh();
      },
      destroy: () => {
        const ref = this.backlogEvents.get(backlogWidget);
        if (ref) {
          this.plugin.app.workspace.offref(ref);
          this.backlogEvents.delete(backlogWidget);
        }
        backlogWidget.unload();
      }
    };
  }
}

export function registerBacklogStrategy(plugin: FullCalendarPlugin): void {
  if (!EmbeddedBlockRegistry.has('backlog')) {
    EmbeddedBlockRegistry.register('backlog', new BacklogWidgetStrategy(plugin));
  }
}
