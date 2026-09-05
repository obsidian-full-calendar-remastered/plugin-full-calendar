import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { TFile } from 'obsidian';
import { LivePreviewDecorator } from '../../../features/livepreview/LivePreviewDecorator';
import { PluginState } from '../../../core/PluginState';
import { extractCleanTitleFromBasename } from '../../utils/noteUtils';
import { launchEditModal } from '../../../ui/modals/event_modal';
import {
  createColorDot,
  createCategoryPill,
  createIconButton
} from '../../../features/livepreview/utils/dom';

class FrontmatterCardWidget extends WidgetType {
  constructor(
    private eventId: string,
    private color: string,
    private calendarName: string,
    private title: string,
    private date: string,
    private startTime: string | undefined,
    private endTime: string | undefined,
    private category: string | undefined,
    private subCategory: string | undefined,
    private onEdit: () => void,
    private onDelete: () => void
  ) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const card = createDiv({ cls: 'fc-lp-header-card' });
    card.style.setProperty('--calendar-color', this.color);
    // card.style.setProperty('display', 'block', 'important');

    // Color banner & Calendar badge
    const banner = createDiv({ cls: 'fc-lp-header-card-banner' });

    const dot = createColorDot(this.color);
    banner.appendChild(dot);

    const calLabel = createSpan({
      cls: 'fc-lp-header-card-cal-label',
      text: this.calendarName
    });
    banner.appendChild(calLabel);

    card.appendChild(banner);

    // Large styled event title
    const titleEl = createEl('h1', {
      cls: 'fc-lp-header-card-title',
      text: this.title
    });
    card.appendChild(titleEl);

    // Details layout block
    const details = createDiv({ cls: 'fc-lp-header-card-details' });

    // Date and time info
    const datetime = createDiv({ cls: 'fc-lp-header-card-datetime' });

    let timeText = this.date;
    if (this.startTime) {
      timeText += ` • ${this.startTime}`;
      if (this.endTime) {
        timeText += ` - ${this.endTime}`;
      }
    } else {
      timeText += ` • All Day`;
    }
    datetime.setText(timeText);
    details.appendChild(datetime);

    // Category / Subcategory pills
    const badges = createDiv({ cls: 'fc-lp-header-card-badges' });
    if (this.category) {
      badges.appendChild(createCategoryPill(this.category, this.color));
    }
    if (this.subCategory) {
      badges.appendChild(createCategoryPill(this.subCategory));
    }
    details.appendChild(badges);
    card.appendChild(details);

    // Quick Actions
    const controls = createDiv({ cls: 'fc-lp-header-card-controls' });

    const editBtn = createIconButton('pencil', 'Edit details', () => this.onEdit());
    controls.appendChild(editBtn);

    const deleteBtn = createIconButton('trash', 'Delete event', () => this.onDelete());
    controls.appendChild(deleteBtn);

    card.appendChild(controls);

    return card;
  }

  // Optimize block widget redraw
  eq(other: FrontmatterCardWidget): boolean {
    return (
      this.eventId === other.eventId &&
      this.color === other.color &&
      this.calendarName === other.calendarName &&
      this.title === other.title &&
      this.date === other.date &&
      this.startTime === other.startTime &&
      this.endTime === other.endTime &&
      this.category === other.category &&
      this.subCategory === other.subCategory
    );
  }
}

export class FrontmatterCardDecorator implements LivePreviewDecorator {
  getDecorations(state: EditorState, file: TFile): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const cache = PluginState.getCache();
    if (!cache || !cache.store) {
      return builder.finish();
    }

    const storedEvents = cache.store.getEventsInFile(file);
    if (storedEvents.length === 0) {
      return builder.finish();
    }

    // A FullNote represents exactly one event in this file
    const event = storedEvents[0];
    if (!event || !event.event) {
      return builder.finish();
    }

    const calendarId = event.calendarId;
    if (!calendarId) {
      return builder.finish();
    }

    if (state.doc.length === 0) {
      return builder.finish();
    }

    const source = PluginState.getProviderRegistry().getSource(calendarId);
    const calendarName = source?.name || 'Local Notes';
    const calendarColor = source?.color || 'var(--interactive-accent)';

    const innerEvent = event.event;
    let date = '';
    if (innerEvent.type === 'single') {
      date = innerEvent.date || '';
    }

    let startTime: string | undefined;
    let endTime: string | undefined;
    if (innerEvent.allDay === false) {
      startTime = innerEvent.startTime;
      endTime = innerEvent.endTime || undefined;
    }

    const eventTitle =
      innerEvent.title || extractCleanTitleFromBasename(file.basename) || 'Untitled Event';

    const widget = Decoration.widget({
      widget: new FrontmatterCardWidget(
        event.id,
        calendarColor,
        calendarName,
        eventTitle,
        date,
        startTime,
        endTime,
        innerEvent.category,
        innerEvent.subCategory,
        // Edit callback
        () => {
          launchEditModal(PluginState.getPlugin(), event.id);
        },
        // Delete callback
        () => {
          void cache.deleteEvent(event.id);
        }
      ),
      side: -1, // Blocks rendered above content
      block: true
    });

    let targetPos = 0;
    let hasFrontmatter = false;
    try {
      const doc = state.doc;
      if (doc.length > 0 && doc.line(1).text.trim() === '---') {
        const maxLines = Math.min(doc.lines, 100);
        for (let i = 2; i <= maxLines; i++) {
          if (doc.line(i).text.trim() === '---') {
            if (i < doc.lines) {
              targetPos = doc.line(i + 1).from;
            } else {
              targetPos = doc.line(i).to;
            }
            hasFrontmatter = true;
            break;
          }
        }
      }
    } catch {
      // Quietly default to 0
    }

    if (!hasFrontmatter) {
      return builder.finish();
    }

    try {
      const docLength = state.doc.length;
      if (targetPos < 0) {
        targetPos = 0;
      }
      if (targetPos > docLength) {
        targetPos = docLength;
      }
      builder.add(targetPos, targetPos, widget);
    } catch {
      // Quietly fail
    }

    return builder.finish();
  }
}
