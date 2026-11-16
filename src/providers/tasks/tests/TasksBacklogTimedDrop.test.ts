/**
 * @file TasksBacklogTimedDrop.test.ts
 * @brief Tests for dropping a backlog task onto a time slot of the calendar.
 *
 * @description
 * A drop onto the time grid must write the dropped time into the task line and
 * render the task as a timed event, instead of scheduling it as all-day.
 *
 * @license See LICENSE.md
 */

import { TasksPluginProvider } from '../TasksPluginProvider';
import type { ObsidianInterface } from '../../../ObsidianAdapter';
import type FullCalendarPlugin from '../../../main';
import { PluginState } from '../../../core/PluginState';
import type EventCache from '../../../core/EventCache';
import { DEFAULT_SETTINGS, FullCalendarSettings } from '../../../types/settings';
import type { ProviderRegistry } from '../../ProviderRegistry';

jest.mock('../../../ObsidianAdapter');

describe('TasksPluginProvider backlog drop onto a time slot', () => {
  let provider: TasksPluginProvider;
  let settings: FullCalendarSettings;
  let rewrite: jest.Mock;
  let written: string[];

  const setup = (
    originalMarkdown: string,
    description: string,
    overrides: Partial<FullCalendarSettings['tasksIntegration']> = {},
    displayTimezone: string | null = 'UTC'
  ) => {
    written = [];
    rewrite = jest.fn((_file: unknown, update: (content: string) => string) => {
      written.push(update(originalMarkdown));
      return Promise.resolve();
    });
    const mockApp = {
      read: jest.fn(),
      getAbstractFileByPath: jest.fn(),
      getFileByPath: jest.fn().mockReturnValue({ path: 'Daily.md' }),
      getMetadata: jest.fn(),
      create: jest.fn(),
      rewrite,
      delete: jest.fn()
    };
    settings = {
      ...DEFAULT_SETTINGS,
      timeFormat24h: true,
      displayTimezone,
      tasksIntegration: {
        ...DEFAULT_SETTINGS.tasksIntegration,
        backlogDateTarget: 'scheduledDate',
        calendarDisplayDateTarget: 'scheduledDate',
        openEditModalAfterBacklogDrop: false,
        ...overrides
      }
    };
    const mockPlugin = {
      app: {
        vault: { getMarkdownFiles: jest.fn().mockReturnValue([]) },
        workspace: {
          on: jest.fn().mockReturnValue({}),
          trigger: jest.fn((eventName: string, callback: (data: unknown) => void) => {
            if (eventName === 'obsidian-tasks-plugin:request-cache-update') {
              callback({
                state: 'Warm',
                tasks: [
                  {
                    path: 'Daily.md',
                    description,
                    taskLocation: { lineNumber: 0 },
                    originalMarkdown,
                    isDone: false
                  }
                ]
              });
            }
          })
        }
      },
      registerEvent: jest.fn(),
      settings,
      providerRegistry: {
        refreshBacklogViews: jest.fn(),
        reloadProviderNow: jest.fn(),
        processProviderUpdates: jest.fn()
      }
    };

    PluginState.setSettings(settings);
    PluginState.setProviderRegistry(mockPlugin.providerRegistry as unknown as ProviderRegistry);
    PluginState.setCache({ getEventById: jest.fn() } as unknown as EventCache);

    provider = new TasksPluginProvider(
      { id: 'tasks_1', name: 'Test Tasks' },
      mockPlugin as unknown as FullCalendarPlugin,
      mockApp as unknown as ObsidianInterface
    );
  };

  it('writes the dropped time and renders the task on the time grid', async () => {
    setup('- [ ] Backlog task', 'Backlog task', { taskDisplayFormat: 'standard' });
    await provider.getUndatedTasks();

    await provider.scheduleTask('Daily.md::0', new Date('2026-05-02T22:00:00Z'), false);

    expect(written).toEqual(['- [ ] Backlog task (22:00-22:30) ⏳ 2026-05-02']);
    const events = await provider.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0][0]).toMatchObject({
      allDay: false,
      date: '2026-05-02',
      startTime: '22:00',
      endTime: '22:30'
    });
  });

  it('uses the Day Planner prefix when that display format is configured', async () => {
    setup('- [ ] Backlog task', 'Backlog task', { taskDisplayFormat: 'dayPlanner' });
    await provider.getUndatedTasks();

    await provider.scheduleTask('Daily.md::0', new Date('2026-05-02T09:15:00Z'), false);

    expect(written).toEqual(['- [ ] 9:15 - 9:45 Backlog task ⏳ 2026-05-02']);
  });

  it('keeps the duration of a task that already carries a time range', async () => {
    setup('- [ ] Backlog task (9:00-10:30)', 'Backlog task (9:00-10:30)', {
      taskDisplayFormat: 'standard'
    });
    await provider.getUndatedTasks();

    await provider.scheduleTask('Daily.md::0', new Date('2026-05-02T14:00:00Z'), false);

    expect(written).toEqual(['- [ ] Backlog task (14:00-15:30) ⏳ 2026-05-02']);
  });

  it('reads the dropped slot in the display timezone', async () => {
    setup('- [ ] Backlog task', 'Backlog task', { taskDisplayFormat: 'standard' }, 'Asia/Tokyo');
    await provider.getUndatedTasks();

    await provider.scheduleTask('Daily.md::0', new Date('2026-05-02T23:30:00Z'), false);

    expect(written).toEqual(['- [ ] Backlog task (8:30-9:00) ⏳ 2026-05-03']);
  });

  it('keeps date-only scheduling for drops onto the all-day row', async () => {
    setup('- [ ] Backlog task', 'Backlog task', { taskDisplayFormat: 'standard' });
    await provider.getUndatedTasks();

    await provider.scheduleTask('Daily.md::0', new Date('2026-05-02T00:00:00'), true);

    expect(written).toEqual(['- [ ] Backlog task ⏳ 2026-05-02']);
    const events = await provider.getEvents();
    expect(events[0][0]).toMatchObject({ allDay: true, date: '2026-05-02' });
  });
});
