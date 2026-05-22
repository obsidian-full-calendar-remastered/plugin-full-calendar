import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { TFile } from 'obsidian';
import { LivePreviewDecorator } from '../../../features/livepreview/LivePreviewDecorator';
import { PluginState } from '../../../core/PluginState';
import { OFCEvent } from '../../../types';
import { launchEditModal } from '../../../ui/modals/event_modal';
import {
  createColorDot,
  createCategoryPill,
  createIconButton,
  createTaskCheckbox
} from '../../../features/livepreview/utils/dom';

class InlineEventWidget extends WidgetType {
  constructor(
    private text: string,
    private eventId: string,
    private color: string,
    private title: string,
    private startTime: string | undefined,
    private endTime: string | undefined,
    private category: string | undefined,
    private completed: boolean | null,
    private onToggleCheckbox: () => void,
    private onEdit: () => void
  ) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = activeDocument.createElement('div');
    wrapper.addClass('fc-lp-inline-event-wrapper');
    wrapper.style.setProperty('--calendar-color', this.color);

    // Checkbox (if task checklist is enabled)
    if (this.completed !== null) {
      const checkbox = createTaskCheckbox(this.completed, () => this.onToggleCheckbox());
      wrapper.appendChild(checkbox);
    }

    // Colored category dot
    const dot = createColorDot(this.color);
    wrapper.appendChild(dot);

    // Time representation
    if (this.startTime) {
      const timeEl = activeDocument.createElement('span');
      timeEl.addClass('fc-lp-inline-event-time');
      timeEl.setText(this.endTime ? `${this.startTime} - ${this.endTime}` : this.startTime);
      wrapper.appendChild(timeEl);
    }

    // Event title
    const titleEl = activeDocument.createElement('span');
    titleEl.addClass('fc-lp-inline-event-title');
    titleEl.setText(this.title);
    if (this.completed) {
      titleEl.addClass('is-completed');
    }
    wrapper.appendChild(titleEl);

    // Category badge
    if (this.category) {
      const catPill = createCategoryPill(this.category, this.color);
      wrapper.appendChild(catPill);
    }

    // Action controls (Edit Details button revealed on hover)
    const controls = activeDocument.createElement('div');
    controls.addClass('fc-lp-inline-event-controls');

    const editBtn = createIconButton('pencil', 'Edit event', () => this.onEdit());
    controls.appendChild(editBtn);

    wrapper.appendChild(controls);

    return wrapper;
  }

  // Optimize equality check to prevent unneeded redraws
  eq(other: InlineEventWidget): boolean {
    return (
      this.text === other.text &&
      this.eventId === other.eventId &&
      this.color === other.color &&
      this.title === other.title &&
      this.startTime === other.startTime &&
      this.endTime === other.endTime &&
      this.category === other.category &&
      this.completed === other.completed
    );
  }
}

export class DailyNoteDecorator implements LivePreviewDecorator {
  getDecorations(
    view: EditorView,
    file: TFile,
    visibleRanges: readonly { from: number; to: number }[]
  ): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const cache = PluginState.getCache();
    if (!cache || !cache.store) {
      return builder.finish();
    }

    const storedEvents = cache.store.getEventsInFile(file);
    if (storedEvents.length === 0) {
      return builder.finish();
    }

    // Map 0-indexed line number to stored events
    const eventMap = new Map<number, (typeof storedEvents)[0]>();
    for (const event of storedEvents) {
      if (event.location && event.location.lineNumber !== undefined) {
        eventMap.set(event.location.lineNumber, event);
      }
    }

    // Get active cursor line for exclusion (1-indexed)
    const selection = view.state.selection.main;
    const cursorLine = view.state.doc.lineAt(selection.head).number;

    for (const range of visibleRanges) {
      const startLineObj = view.state.doc.lineAt(range.from);
      const endLineObj = view.state.doc.lineAt(range.to);

      for (let i = startLineObj.number; i <= endLineObj.number; i++) {
        // Active-line exclusion: do not decorate the line currently being edited
        if (i === cursorLine) {
          continue;
        }

        const lineIndex = i - 1; // 0-indexed line number
        const event = eventMap.get(lineIndex);

        if (event) {
          const line = view.state.doc.line(i);
          const calendarId = event.calendarId;
          const source = PluginState.getProviderRegistry().getSource(calendarId);
          const calendarColor = source?.color || 'var(--interactive-accent)';

          const startTime = event.event.allDay ? undefined : event.event.startTime;
          const endTime = event.event.allDay ? undefined : event.event.endTime || undefined;

          let completed: boolean | null = null;
          if (
            event.event.type === 'single' &&
            event.event.completed !== undefined &&
            event.event.completed !== null
          ) {
            completed = event.event.completed !== false;
          }

          const widget = Decoration.replace({
            widget: new InlineEventWidget(
              line.text,
              event.id,
              calendarColor,
              event.event.title,
              startTime,
              endTime,
              event.event.category,
              completed,
              // Checkbox Toggle Callback
              () => {
                if (event.event.type === 'single') {
                  const isDone = event.event.completed === false;
                  const updatedEvent = {
                    ...event.event,
                    completed: isDone ? 'x' : false
                  } as OFCEvent;
                  void cache.updateEventWithId(event.id, updatedEvent);
                }
              },
              // Edit Event Callback
              () => {
                launchEditModal(PluginState.getPlugin(), event.id);
              }
            )
          });

          // Add the replace decoration to standard CodeMirror range
          builder.add(line.from, line.to, widget);
        }
      }
    }

    return builder.finish();
  }
}
